"""Background tasks: work the talker (or a routine) hands to the worker.

A task runs the worker agent (worker.py) in the background while the talker
keeps talking. It stops for one of these reasons, and the talker learns of each:

- needs_input: the worker asked the user something (`ask`).
- needs_confirmation: a tool is about to send, pay or change something
  (`confirm_action`), or a payment needs the user's approval (`wait_approval`,
  the money card: Allow / Deny / Always).
- needs_takeover: the user has to do something on screen (sign in, solve a
  CAPTCHA, check a page) and then press "I've done it" (`takeover`).
- done, failed, cancelled.

Every pause is also a Convex ask (asks:create), so it shows in the main window's
Needs you list. The answer that comes first wins: a WebSocket frame from the notch
(task_reply / task_confirm / task_continue, or the talker's continue_task) or the
ask answered in the window (polling asks:get every 1.5 s). An answer from the notch
is mirrored onto the ask (asks:answer), so the window and the approvals row agree.

The talker's start_task / continue_task tools await the next stop (they are
non-blocking Live tools, so the voice carries on meanwhile) and get a short
payload to speak from. When a task stops with no talker call waiting, the update
reaches the talker as a text note instead (`Connection.notify_talker`). Every change
also goes to the Mac as a `task` frame for the island's card. Routine runs are quiet
tasks: the island shows them, the voice stays quiet, and each step is mirrored to the
run record (routines:logStep).
"""

from __future__ import annotations

import asyncio
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Awaitable, Callable

from . import convex

if TYPE_CHECKING:
    from .connection import Connection

RUNNING = "running"
NEEDS_INPUT = "needs_input"
NEEDS_CONFIRMATION = "needs_confirmation"
NEEDS_TAKEOVER = "needs_takeover"
DONE = "done"
FAILED = "failed"
CANCELLED = "cancelled"
PAUSED = {NEEDS_INPUT, NEEDS_CONFIRMATION, NEEDS_TAKEOVER}
ENDED = {DONE, FAILED, CANCELLED}

# How long a talker call waits before telling the user the task is still going.
TALKER_WAIT_S = 240.0
# A running task says what it's doing after this long in silence, then at this interval.
PROGRESS_FIRST_S = 22.0
PROGRESS_EVERY_S = 50.0
PROGRESS_MAX = 3
# How often a paused task checks whether its ask was answered in the main window.
ASK_POLL_S = 1.5


@dataclass
class Task:
    id: str
    title: str
    goal: str
    status: str = RUNNING
    steps: list[str] = field(default_factory=list)
    question: str | None = None
    options: list[str] | None = None
    confirm: dict[str, str] | None = None
    takeover: dict[str, Any] | None = None
    # The money approval card: {amountCents, payee, ruleText, potName, askId}.
    approval: dict[str, Any] | None = None
    # The last receipt this task wrote: {id, amountCents, payee, why, ruleText, state, kind}.
    receipt: dict[str, Any] | None = None
    # A routine's run: {"id", "name"} for the island's quiet card, and the run record.
    routine: dict[str, str] | None = None
    run_id: str | None = None
    # The routine's guardrails ({potName?, maxSpendCents?, approval}), enforced by money.py on top of the policy.
    guardrails: dict[str, Any] | None = None
    ask_id: str | None = None
    say: str | None = None
    views: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    worker_session_id: str | None = None
    # Started by a routine: the island shows it, the voice stays quiet.
    quiet: bool = False
    # When the current pause began (monotonic): an answer the user gave before it can't be
    # theirs (tools.continue_task).
    asked_at: float = 0.0
    # The operator is on the screen: the talker doesn't narrate every click.
    on_screen: bool = False
    # Called once when the task ends (routines.finish_run).
    on_end: list[Callable[["Task"], Awaitable[None]]] = field(default_factory=list)
    _reply: asyncio.Future[Any] | None = None
    _progress: asyncio.Task[None] | None = None
    # The worker can call two asking tools at once; they take turns.
    _asking: asyncio.Lock = field(default_factory=asyncio.Lock)
    _changed: asyncio.Event = field(default_factory=asyncio.Event)
    _run: asyncio.Task[None] | None = None
    _log_tail: asyncio.Task[None] | None = None
    _waiters: int = 0

    def snapshot(self) -> dict[str, Any]:
        out = {
            "id": self.id,
            "title": self.title,
            "status": self.status,
            "steps": self.steps[-6:],
            "question": self.question,
            "options": self.options,
            "confirm": self.confirm,
            "takeover": self.takeover,
            "approval": self.approval,
            "receipt": self.receipt,
            "routine": self.routine,
            "ask_id": self.ask_id,
            "say": self.say,
            "views": self.views,
            "error": self.error,
            "quiet": self.quiet,
        }
        return {k: v for k, v in out.items() if v is not None}

    def for_talker(self) -> dict[str, Any]:
        """What the talker needs to speak about this stop, and nothing more."""
        out: dict[str, Any] = {"task_id": self.id, "status": self.status}
        if self.status == NEEDS_INPUT:
            out["question"] = self.question
            if self.options:
                out["options"] = self.options
        elif self.status == NEEDS_CONFIRMATION and self.approval:
            a = self.approval
            out["approval"] = (f"Pay {a.get('payee')} ${(a.get('amountCents') or 0) / 100:,.2f} from the "
                               f"{a.get('potName')} pot? It needs your OK because: {a.get('ruleText')}")
            out["note"] = ("The money card with Allow, Deny and Always is in the notch. Read this to the user and wait "
                           "for their answer; pass it with continue_task(approved=..., always=...).")
        elif self.status == NEEDS_CONFIRMATION:
            out["confirm"] = (self.confirm or {}).get("title")
            out["note"] = "Read this to the user and ask yes or no; pass the answer with continue_task(approved=...)."
        elif self.status == NEEDS_TAKEOVER:
            out["takeover"] = (self.takeover or {}).get("title")
            out["note"] = ("The user has to do this themselves on screen, then press I've done it in the notch "
                           "(or tell you, then continue_task(reply=\"done\")).")
        elif self.status == DONE:
            out["say"] = self.say or "Done."
            if self.receipt:
                out["receipt"] = {k: self.receipt.get(k) for k in ("amountCents", "payee", "state")}
        elif self.status == FAILED:
            out["error"] = self.error
        elif self.status == RUNNING:
            out["note"] = "Still working; the result will come to you when it's ready."
        return out

    def transcript(self) -> str:
        """The task in a few lines, for memory.reflect."""
        lines = [f"Goal: {self.goal}", *[f"- {s}" for s in self.steps[-30:]]]
        if self.say:
            lines.append(f"Result: {self.say}")
        return "\n".join(lines)


class TaskManager:
    def __init__(self, conn: "Connection") -> None:
        self.conn = conn
        self.tasks: dict[str, Task] = {}

    # --- from the talker and the scheduler ------------------------------------

    def start(self, goal: str, title: str, quiet: bool = False, *, routine: dict[str, str] | None = None,
              run_id: str | None = None, on_end: Callable[[Task], Awaitable[None]] | None = None) -> Task:
        # Gemini can repeat a tool call during a long wait; reuse a running task with the same goal.
        if routine is None:
            for task in self.tasks.values():
                if task.goal == goal and task.status not in ENDED:
                    return task
        task = Task(id=uuid.uuid4().hex[:8], title=title.strip() or goal[:60], goal=goal, quiet=quiet,
                    routine=routine, run_id=run_id)
        if on_end:
            task.on_end.append(on_end)
        self.tasks[task.id] = task
        self._launch(task, goal)
        return task

    def follow_up(self, task: Task, message: str) -> None:
        """More work on a finished task, in the same worker session (it remembers what it did)."""
        task.say, task.error, task.question, task.confirm, task.receipt = None, None, None, None, None
        self._launch(task, message)

    async def until_stop(self, task: Task, timeout: float = TALKER_WAIT_S) -> dict[str, Any]:
        task._waiters += 1
        try:
            while task.status == RUNNING:
                task._changed.clear()
                try:
                    await asyncio.wait_for(task._changed.wait(), timeout)
                except TimeoutError:
                    break
            return task.for_talker()
        finally:
            task._waiters -= 1

    def answer(self, task: Task, reply: str = "", approved: bool | None = None, always: bool = False,
               by: str = "notch") -> bool:
        """The user's answer to a paused task. False if it wasn't waiting for one."""
        if task.status not in PAUSED or task._reply is None or task._reply.done():
            return False
        if task.status == NEEDS_CONFIRMATION and approved is None:
            approved = reply.strip().lower().startswith(("y", "ok", "sure", "go", "do it", "confirm", "pay", "send", "allow", "approve"))
        if task.status == NEEDS_TAKEOVER and approved is None:
            approved = not reply.strip().lower().startswith(("no", "cancel", "stop", "can't", "cannot"))
        task._reply.set_result({"approved": approved, "always": bool(always), "text": reply, "by": by})
        return True

    def find(self, task_id: str) -> Task | None:
        return self.tasks.get(task_id.strip())

    def find_by_ask(self, ask_id: str) -> Task | None:
        for task in self.tasks.values():
            if task.ask_id == ask_id and task.status in PAUSED:
                return task
        return None

    def cancel(self, task: Task) -> None:
        if task.status in ENDED:
            return
        if task._run and not task._run.done():
            task._run.cancel()
        self._set(task, CANCELLED)

    def cancel_all(self) -> None:
        """The Mac disconnected: stop every task and forget their worker sessions."""
        from .connection import unregister_worker

        for task in list(self.tasks.values()):
            if task._run and not task._run.done():
                task._run.cancel()
            if task.worker_session_id:
                unregister_worker(task.worker_session_id)

    # --- from the worker's tools -------------------------------------------

    async def ask(self, task: Task, question: str, options: list[str] | None = None) -> str:
        task.question, task.options = question, options or None
        try:
            answer = await self._pause(task, NEEDS_INPUT, kind="question", title=question, options=options,
                                       clear=lambda: (setattr(task, "question", None), setattr(task, "options", None)))
        finally:
            task.question, task.options = None, None
            self._emit(task)
        return str(answer.get("text") or "")

    async def confirm_action(self, task: Task, title: str, detail: str = "") -> bool:
        """Ask before acting. True only on a clear yes."""
        task.confirm = {"title": title, "detail": detail}
        try:
            answer = await self._pause(task, NEEDS_CONFIRMATION, kind="approval", title=title, detail=detail or None,
                                       clear=lambda: setattr(task, "confirm", None))
        finally:
            task.confirm = None
            self._emit(task)
        approved = bool(answer.get("approved"))
        self.step(task, "You said go ahead" if approved else "You said no", kind="ask")
        return approved

    async def takeover(self, task: Task, title: str, detail: str = "", kind: str = "takeover", url: str | None = None) -> bool:
        """Hand the screen to the user ("Sign in to Comcast in the Plex browser") until they press
        I've done it. True when they did; False when they said they couldn't."""
        task.takeover = {"title": title, "detail": detail, "kind": kind if kind in ("takeover", "login") else "takeover"}
        if url:
            task.takeover["url"] = url
        try:
            answer = await self._pause(task, NEEDS_TAKEOVER, kind=task.takeover["kind"], title=title, detail=detail or None,
                                       clear=lambda: setattr(task, "takeover", None))
        finally:
            task.takeover = None
            self._emit(task)
        done = answer.get("approved") is not False
        self.step(task, "You took care of it" if done else "You couldn't do it", kind="ask")
        return done

    async def wait_approval(self, task: Task, ask_id: str, approval: dict[str, Any]) -> dict[str, Any]:
        """Wait on a money approval that agentMoney:pay already created (the approvals row and its
        ask). Returns {"approved", "always"}."""
        task.approval = {**approval, "askId": ask_id}
        payee, cents = approval.get("payee"), approval.get("amountCents") or 0
        task.confirm = {"title": f"Pay {payee} ${cents / 100:,.2f}?", "detail": str(approval.get("ruleText") or "")}
        try:
            answer = await self._pause(task, NEEDS_CONFIRMATION, ask_id=ask_id, kind="approval", title=task.confirm["title"],
                                       clear=lambda: (setattr(task, "approval", None), setattr(task, "confirm", None)))
        finally:
            task.approval, task.confirm = None, None
            self._emit(task)
        approved = bool(answer.get("approved"))
        self.step(task, ("You allowed it" + (" (always)" if answer.get("always") else "")) if approved else "You said no",
                  kind="ask")
        return {"approved": approved, "always": bool(answer.get("always"))}

    def step(self, task: Task, line: str, kind: str = "info") -> None:
        task.steps.append(line)
        self._emit(task)
        self._log_run(task, kind, line)

    def show_view(self, task: Task, view: dict[str, Any]) -> None:
        """Add a card ({"type": "note", "key", "title", "text"}); a newer one of the same type and key
        replaces the old one."""
        same = lambda v: v.get("type") == view.get("type") and v.get("key") == view.get("key")  # noqa: E731
        task.views = [v for v in task.views if not same(v)][-5:] + [view]
        self._emit(task)

    async def show_receipt(self, task: Task | None, receipt: dict[str, Any]) -> None:
        """Money moved: the receipt slides into the notch, and onto the task's card."""
        await self.conn.bridge.send_json({"type": "receipt", "receipt": receipt})
        if task is not None:
            task.receipt = receipt
            self._emit(task)

    # --- pauses ----------------------------------------------------------------

    async def _pause(self, task: Task, status: str, *, kind: str, title: str, detail: str | None = None,
                     options: list[str] | None = None, ask_id: str | None = None,
                     clear: Callable[[], None] | None = None) -> dict[str, Any]:
        async with task._asking:
            if ask_id is None:
                ask_id = await self._create_ask(task, kind, title, detail, options)
                created_here = ask_id is not None
            else:
                created_here = False
            task.ask_id = ask_id
            task._reply = asyncio.get_running_loop().create_future()
            task.asked_at = time.monotonic()
            self._set(task, status)
            await self.conn.bridge.send_json({"type": "asks_changed"})
            if not created_here:
                # asks:create already logs "Waiting on you" on the run and marks it waiting.
                self._log_run(task, "ask", f"Waiting on you: {title}")
            answered = False
            try:
                answer = await self._first_answer(task, ask_id)
                answered = True
            finally:
                task._reply = None
                task.ask_id = None
                if not answered and ask_id:
                    asyncio.get_running_loop().create_task(_cancel_ask(ask_id))
                if clear:
                    clear()  # the card's question / approval / takeover goes before the status flips back
                if task.status == status:
                    self._set(task, RUNNING)
                await self.conn.bridge.send_json({"type": "asks_changed"})
        if answer.get("cancelled"):
            # The ask was cancelled or expired in the window: the task stops.
            self.cancel(task)
            raise asyncio.CancelledError()
        return answer

    async def _first_answer(self, task: Task, ask_id: str | None) -> dict[str, Any]:
        assert task._reply is not None
        reply = task._reply
        poll = asyncio.create_task(_poll_ask(ask_id)) if ask_id else None
        waiting: set[asyncio.Future[Any]] = {reply, *([poll] if poll else [])}
        try:
            done, _ = await asyncio.wait(waiting, return_when=asyncio.FIRST_COMPLETED)
        finally:
            if poll and not poll.done():
                poll.cancel()
        if reply in done:
            answer = dict(reply.result())
            if answer.get("by") != "voice":
                self._tell_talker_answered(task, answer)
            if ask_id:
                # Mirror the notch's (or the voice's) answer onto the ask and its approvals row.
                try:
                    await convex.public_mutation(
                        "asks:answer", askId=ask_id, approved=answer.get("approved"), always=answer.get("always") or None,
                        text=answer.get("text") or None, by=answer.get("by") if answer.get("by") in ("notch", "window", "voice") else "notch",
                    )
                except convex.ConvexError as err:
                    print(f"plex: couldn't mirror the answer onto ask {ask_id}: {err}", flush=True)
            return answer
        if not reply.done():
            reply.cancel()
        assert poll is not None
        answer = poll.result()
        if not answer.get("cancelled"):
            self._tell_talker_answered(task, answer)
        return answer

    def _tell_talker_answered(self, task: Task, answer: dict[str, Any]) -> None:
        """Answered in the notch or the window: the talker may still be about to ask it out loud."""
        if task.quiet or not self.conn.notify_talker:
            return
        what = (task.approval and "the payment") or (task.confirm or {}).get("title") or task.question or \
            (task.takeover or {}).get("title") or "it"
        said = answer.get("text") or ("yes" if answer.get("approved") else "no" if answer.get("approved") is False else "answered")
        self.conn.notify_talker(f"[The user already answered {what} in the notch ({said}). Don't ask about it again; "
                                "the task carries on.]")

    async def _create_ask(self, task: Task, kind: str, title: str, detail: str | None,
                          options: list[str] | None) -> str | None:
        source: dict[str, Any] = {"kind": "routine" if task.run_id else "task",
                                  "label": (task.routine or {}).get("name") or task.title, "taskId": task.id}
        if task.run_id:
            source["runId"] = task.run_id
        try:
            return await convex.mutation("asks:create", kind=kind, title=title[:200], detail=(detail or None),
                                         options=options or None, source=source)
        except convex.ConvexError as err:
            # The notch still works without the window's copy.
            print(f"plex: asks:create failed: {err}", flush=True)
            return None

    # --- internals ----------------------------------------------------------

    def _launch(self, task: Task, message: str) -> None:
        from .worker import run_worker  # worker imports this module

        self._set(task, RUNNING)
        task._run = asyncio.create_task(self._run(task, run_worker, message))
        if not task.quiet:
            task._progress = asyncio.create_task(self._keep_posted(task))

    async def _run(self, task: Task, run_worker: Any, message: str) -> None:
        try:
            # Spoken and shown as plain text: no markdown emphasis.
            task.say = re.sub(r"[*_`#]+", "", await run_worker(self.conn, task, message))
            self._set(task, DONE)
        except asyncio.CancelledError:
            if task.status not in ENDED:
                self._set(task, CANCELLED)
        except Exception as err:  # the worker or a tool failed
            print(f"plex: task {task.id} failed: {type(err).__name__}: {err}", flush=True)
            task.error = f"{type(err).__name__}: {err}"[:300]
            self._set(task, FAILED)
        finally:
            if task._progress and not task._progress.done():
                task._progress.cancel()
            if task._log_tail:
                try:
                    await asyncio.wait_for(asyncio.shield(task._log_tail), 10)
                except Exception:
                    pass
            for callback in task.on_end:
                try:
                    await callback(task)
                except Exception as err:
                    print(f"plex: task {task.id} end hook failed: {type(err).__name__}: {err}", flush=True)
            if task.status == DONE:
                from . import memory

                asyncio.get_running_loop().create_task(memory.reflect_safely(task.transcript(), "routine" if task.run_id else "learned"))

    async def _keep_posted(self, task: Task) -> None:
        """A long task shouldn't leave the user in silence: after a while, and then now and then,
        the talker gets the latest step to say in a few words (the card shows it too)."""
        await asyncio.sleep(PROGRESS_FIRST_S)
        said = 0
        while task.status == RUNNING and said < PROGRESS_MAX:
            if self.conn.notify_talker and task.steps and not task.on_screen:
                said += 1
                self.conn.notify_talker(
                    f"[Background task \"{task.title}\" is still working; its latest step: {task.steps[-1]}. "
                    "Tell the user in one short sentence what it's doing right now, nothing more: don't guess the result, "
                    "and never say any money moved or anything is paid, sent or done.]"
                )
            await asyncio.sleep(PROGRESS_EVERY_S)

    def _log_run(self, task: Task, kind: str, label: str) -> None:
        """Mirror a step onto the routine's run record, in order."""
        if not task.run_id:
            return
        kind = kind if kind in ("info", "tool", "money", "ask", "done", "error") else "info"
        previous = task._log_tail

        async def log() -> None:
            if previous:
                try:
                    await previous
                except Exception:
                    pass
            try:
                await convex.mutation("routines:logStep", runId=task.run_id, kind=kind, label=label[:200])
            except convex.ConvexError as err:
                print(f"plex: routines:logStep failed: {err}", flush=True)

        task._log_tail = asyncio.get_running_loop().create_task(log())

    def _set(self, task: Task, status: str) -> None:
        was = task.status
        task.status = status
        task._changed.set()
        self._emit(task)
        # Nobody is waiting on this stop: tell the talker in words.
        stopped = status in PAUSED or (status in ENDED and was != status)
        if stopped and task._waiters == 0 and self.conn.notify_talker and status != CANCELLED and not task.quiet:
            self.conn.notify_talker(_note(task))

    def _emit(self, task: Task) -> None:
        asyncio.get_running_loop().create_task(self.conn.bridge.send_json({"type": "task", "task": task.snapshot()}))


async def _poll_ask(ask_id: str) -> dict[str, Any]:
    """Wait until the ask is answered (or cancelled) in the main window."""
    complained = False
    while True:
        await asyncio.sleep(ASK_POLL_S)
        try:
            ask = await convex.query("asks:get", askId=ask_id)
        except convex.ConvexError as err:
            if not complained:
                print(f"plex: asks:get failed (still waiting on the notch): {err}", flush=True)
                complained = True
            continue
        status = (ask or {}).get("status")
        if status == "answered":
            ans = ask.get("answer") or {}
            return {"approved": ans.get("approved"), "always": bool(ans.get("always")), "text": ans.get("text") or "",
                    "by": ans.get("by") or "window"}
        if status in ("cancelled", "expired") or ask is None:
            return {"cancelled": True}


async def _cancel_ask(ask_id: str) -> None:
    try:
        await convex.mutation("asks:cancel", askId=ask_id)
    except convex.ConvexError:
        pass


def _note(task: Task) -> str:
    payload = task.for_talker()
    if task.status == DONE:
        body = f"finished: {payload['say']}"
    elif task.status == NEEDS_INPUT:
        body = f"needs an answer from the user: {task.question} (pass it with continue_task, task_id {task.id})"
    elif task.status == NEEDS_CONFIRMATION and task.approval:
        body = f"needs the user's OK on a payment: {payload['approval']} (continue_task, task_id {task.id}, approved=...)"
    elif task.status == NEEDS_CONFIRMATION:
        body = f"needs a yes or no: {payload['confirm']} (continue_task, task_id {task.id}, approved=...)"
    elif task.status == NEEDS_TAKEOVER:
        body = (f"needs the user to do something on screen: {payload['takeover']}. They press I've done it in the notch, "
                f"or tell you (continue_task, task_id {task.id}, reply=\"done\")")
    else:
        return (f"[Background task \"{task.title}\" didn't work ({task.error}). Tell the user briefly that it "
                "didn't work and offer to try again; don't guess at a reason.]")
    return f"[Background task \"{task.title}\" {body}. Tell the user briefly, in your own words.]"

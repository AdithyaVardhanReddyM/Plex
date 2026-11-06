"""The talker's tools: a few fast ones, and the hand-off to background tasks.

start_task and continue_task are non-blocking Live tools whose answers arrive when the
conversation is idle (WHEN_IDLE): the voice keeps talking while the worker runs, and speaks
the result at the next pause. See tasks.py. The talker never moves money itself: payments
are tasks, so the policy, the approval card and the receipt always run.
"""

from __future__ import annotations

import time
from typing import Any

from google.adk.tools import FunctionTool, ToolContext
from google.genai import types

from . import convex, memory, money
from .connection import for_talker, report
from .tasks import NEEDS_CONFIRMATION, NEEDS_TAKEOVER

# A yes by voice counts only if the user spoke this recently.
VOICE_ANSWER_WINDOW_S = 90.0


async def look_at_frontmost_app(tool_context: ToolContext) -> dict[str, Any]:
    """What the user has in front of them right now: the app, its window title, and the page
    address when it is a browser. Use it when they say "this", "here" or "what I'm looking at"."""
    conn = for_talker(tool_context)
    result = await conn.bridge.call("frontmost_app")
    await report(conn, None, "mac", "Looked at the front app", result.get("app") or result.get("error"))
    return result


async def check_money(tool_context: ToolContext) -> dict[str, Any]:
    """The user's money right now, fresh: pots (balance left, spent this month, their rules),
    bills due in the next 14 days (amount, due day, usual amount, autopay), subscriptions (price
    rises, days since last used) and what's waiting on them. Use it for "what's due", "how much is
    left in Food", "what am I paying for". Answer from it in a sentence or two; never read out ids."""
    conn = for_talker(tool_context)
    snap = await money.snapshot()
    conn.snapshot = snap
    await report(conn, None, "money", "Looked at your pots and bills")
    now_ms = snap.get("now") or int(time.time() * 1000)
    for b in snap.get("billsDue") or []:
        b["in_days"] = round(((b.get("dueAt") or now_ms) - now_ms) / 86_400_000, 1)
        b.pop("_id", None)
        b.pop("dueAt", None)
    for s in snap.get("subscriptions") or []:
        s.pop("_id", None)
    for a in snap.get("pendingAsks") or []:
        a["ask_id"] = a.pop("_id", None)
    snap.pop("now", None)
    return snap


async def answer_ask(ask_id: str, tool_context: ToolContext, approved: bool | None = None, always: bool = False,
                     text: str = "") -> dict[str, Any]:
    """Answer something waiting in the user's Needs you list by voice (an approval or a question
    from a routine), only after the user has actually said their answer. For a task you started
    in this conversation, use continue_task instead.

    Args:
        ask_id: The ask's id from check_money's pendingAsks.
        approved: For an approval: true to allow, false to deny.
        always: For a money approval, true when they said "always" (allow this payee up to this amount from now on).
        text: For a question: their answer in their words.
    """
    conn = for_talker(tool_context)
    if time.monotonic() - conn.last_input_at > VOICE_ANSWER_WINDOW_S:
        return {"note": "The user hasn't answered this. Read it to them and wait for their answer; don't decide for them."}
    assert conn.tasks
    task = conn.tasks.find_by_ask(ask_id)
    if task is not None and conn.tasks.answer(task, text, approved, always, by="voice"):
        return {"answered": True, "task_id": task.id}
    await convex.public_mutation("asks:answer", askId=ask_id, approved=approved, always=always or None, text=text or None, by="voice")
    await conn.bridge.send_json({"type": "asks_changed"})
    return {"answered": True}


async def start_task(goal: str, title: str, tool_context: ToolContext) -> dict[str, Any]:
    """Hand NEW work to a background task: money reviews and plans ("how did I do this month",
    "plan my week", which build an Insights page), paying a bill or a person, splitting a receipt,
    cancelling a subscription, requesting money, setting up a routine ("every Friday…",
    "whenever…"), anything with the user's accounts (Gmail, calendars, Sheets, Slack, Notion),
    anything on the screen or a website, anything with several steps. Before calling, say one
    short line ("On it"). The answer comes back later; until then, don't guess at the result.
    Anything about a task that already ran ("pay it", "do it every month", "send it to Sam") is a
    follow-up: continue_task with that task's id, never a new task.

    Args:
        goal: Everything the worker needs, in the user's words plus context from the conversation
            ("Pay the Comcast internet bill from the bills pot"; "Every Friday at 6pm, move half of
            what's left in Food to savings and tell me").
        title: Three to five words for the task's card ("Pay the Comcast bill").
    """
    conn = for_talker(tool_context)
    assert conn.tasks
    task = conn.tasks.start(goal, title)
    return await conn.tasks.until_stop(task)


async def continue_task(task_id: str, tool_context: ToolContext, reply: str = "", approved: bool | None = None,
                        always: bool = False) -> dict[str, Any]:
    """Pass the user's answer to a task that asked a question, wants a yes or no, needs a payment
    approved, or is waiting for them to do something on screen ("done"); or give a finished task a
    follow-up. Only pass `approved` after the user has actually answered.

    Args:
        task_id: The task's id from start_task.
        reply: The user's answer or follow-up, in their words ("done" after a takeover).
        approved: For a yes-or-no or a payment approval: true for yes / allow, false for no / deny.
        always: For a payment approval, true when they said "always" for this payee.
    """
    conn = for_talker(tool_context)
    assert conn.tasks
    task = conn.tasks.find(task_id)
    if task is None:
        return {"error": f"No task {task_id}."}
    if (approved is not None or task.status == NEEDS_TAKEOVER) and task.status in (NEEDS_CONFIRMATION, NEEDS_TAKEOVER) \
            and conn.last_input_at < task.asked_at:
        # The user hasn't spoken since the question came up: this yes would be the talker's own.
        return {**task.for_talker(),
                "note": "The user hasn't answered this yet. Read it to them and wait for their answer; don't decide for them."}
    if not conn.tasks.answer(task, reply, approved, always, by="voice"):
        if task.status in ("done", "failed") and reply:
            conn.tasks.follow_up(task, reply)
        else:
            return task.for_talker()
    return await conn.tasks.until_stop(task)


async def cancel_task(task_id: str, tool_context: ToolContext) -> dict[str, Any]:
    """Stop a task the user no longer wants ("never mind", "stop that").

    Args:
        task_id: The task's id.
    """
    conn = for_talker(tool_context)
    assert conn.tasks
    task = conn.tasks.find(task_id)
    if task is None:
        return {"error": f"No task {task_id}."}
    conn.tasks.cancel(task)
    return {"task_id": task.id, "status": task.status}


def _background(fn: Any) -> FunctionTool:
    tool = FunctionTool(fn)
    tool.behavior = types.Behavior.NON_BLOCKING
    tool.response_scheduling = types.FunctionResponseScheduling.WHEN_IDLE
    return tool


TOOLS = [
    look_at_frontmost_app, check_money, memory.remember_this, memory.recall_memory, answer_ask,
    _background(start_task), _background(continue_task), cancel_task,
]

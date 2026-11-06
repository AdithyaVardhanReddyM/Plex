"""Routines: compiled once, checked every time.

compile(prompt, timezone) turns the user's sentence into the exact `spec` Convex stores
(docs/plex-mac.md §2: trigger, conditions, steps, guardrails, summary) with Gemini
structured output, then validates it with pydantic. The model fills a flat schema (Gemini
handles flat objects better than unions); the code turns it into the union and checks it.

The Scheduler runs every 30 s (and at once on the Mac's hello and wake):
- routines:due gives the schedule-due routines and the queued runs (Run now, PayPal events).
- runWhere "mac" runs only while a Mac is connected; "cloud" runs in the brain.
- A run more than 10 minutes late either runs ("Missed at 9:00 while your Mac slept, ran on
  wake") or is skipped (routines:skipRun), by the routine's `missed`.
- Email triggers: Gmail is polled through Composio every 5 minutes (newer_than:1d, deduped by
  message id in memory). Folder triggers come from the Mac ({"type":"folder_event"}).
- A run is a quiet Task (tasks.py) whose goal is the routine, its recent runs and the trigger
  payload. Its steps mirror to routines:logStep, its pauses become asks (the run waits), and it
  ends with routines:finishRun.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import fnmatch
import json
import os
import time
from typing import Annotated, Any, Literal, Optional, Union
from zoneinfo import ZoneInfo

from google import genai
from google.adk.tools import ToolContext
from google.genai import types
from pydantic import BaseModel, Field, ValidationError, field_validator

from . import accounts, convex
from .connection import Connection, cloud, for_worker, mac, report

COMPILE_MODEL = os.environ.get("PLEX_COMPILE_MODEL", "gemini-3.8-flash")
COMPILE_FALLBACK = os.environ.get("PLEX_COMPILE_FALLBACK", "gemini-3.6-flash")
TICK_S = 5.0  # the contract says 30 s; 5 s makes Run now from the window feel immediate (one cheap query)
LATE_MS = 10 * 60 * 1000
# Gmail is polled this often for email-triggered routines (PLEX_MAIL_POLL_S=30 for a filmed demo).
MAIL_EVERY_S = float(os.environ.get("PLEX_MAIL_POLL_S", "300"))

# --- the exact spec (contract §2), for validation -----------------------------------------------


class ScheduleTrigger(BaseModel):
    kind: Literal["schedule"]
    cadence: Literal["hourly", "daily", "weekly", "monthly", "once"]
    time: Optional[str] = None
    days: Optional[list[int]] = None
    dayOfMonth: Optional[int] = None
    everyHours: Optional[int] = None
    at: Optional[int] = None

    @field_validator("time")
    @classmethod
    def _hhmm(cls, v: str | None) -> str | None:
        if v is None:
            return v
        h, m = v.split(":")
        assert 0 <= int(h) < 24 and 0 <= int(m) < 60
        return f"{int(h):02d}:{int(m):02d}"

    @field_validator("days")
    @classmethod
    def _days(cls, v: list[int] | None) -> list[int] | None:
        if v is not None:
            assert all(0 <= d <= 6 for d in v)
            return sorted(set(v))
        return v


class EmailTrigger(BaseModel):
    kind: Literal["email"]
    query: str
    label: str


class PaypalTrigger(BaseModel):
    kind: Literal["paypal"]
    event: str
    label: str


class FolderTrigger(BaseModel):
    kind: Literal["folder"]
    path: str
    pattern: Optional[str] = None
    label: str


class ManualTrigger(BaseModel):
    kind: Literal["manual"]


Trigger = Annotated[Union[ScheduleTrigger, EmailTrigger, PaypalTrigger, FolderTrigger, ManualTrigger], Field(discriminator="kind")]


class Condition(BaseModel):
    text: str
    check: Optional[str] = None


class Step(BaseModel):
    id: str
    kind: Literal["check", "act", "money", "notify", "ask", "wait"]
    title: str
    detail: Optional[str] = None
    tool: Optional[str] = None


class Guardrails(BaseModel):
    potName: Optional[str] = None
    maxSpendCents: Optional[int] = None
    approval: Literal["always", "over_limit", "never_money"]


class Spec(BaseModel):
    trigger: Trigger
    conditions: list[Condition]
    steps: list[Step] = Field(min_length=1)
    guardrails: Guardrails
    summary: str


def spec_json(spec: Spec) -> dict[str, Any]:
    return spec.model_dump(exclude_none=True)


# --- what the model fills in ----------------------------------------------------------------------


class _TriggerOut(BaseModel):
    kind: Literal["schedule", "email", "paypal", "folder", "manual"]
    cadence: Optional[Literal["hourly", "daily", "weekly", "monthly", "once"]] = None
    time: Optional[str] = Field(default=None, description="HH:MM, 24-hour, local time")
    days: Optional[list[int]] = Field(default=None, description="Weekly days, 0=Sunday .. 6=Saturday")
    dayOfMonth: Optional[int] = None
    everyHours: Optional[int] = None
    onceAt: Optional[str] = Field(default=None, description="For cadence once: local date and time, YYYY-MM-DDTHH:MM")
    query: Optional[str] = Field(default=None, description="For email: a Gmail search query")
    event: Optional[str] = Field(default=None, description="For paypal: a PayPal webhook event type")
    path: Optional[str] = Field(default=None, description="For folder: a folder path, ~ allowed")
    pattern: Optional[str] = Field(default=None, description="For folder: a glob like *.pdf")
    label: Optional[str] = Field(default=None, description="For email/paypal/folder: a short label, 'Email from Comcast'")


class _StepOut(BaseModel):
    kind: Literal["check", "act", "money", "notify", "ask", "wait"]
    title: str
    detail: Optional[str] = None
    tool: Optional[str] = None


class _GuardOut(BaseModel):
    potName: Optional[str] = None
    maxSpendCents: Optional[int] = None
    approval: Literal["always", "over_limit", "never_money"]


class _CompileOut(BaseModel):
    name: str
    icon: str
    trigger: _TriggerOut
    conditions: list[Condition]
    steps: list[_StepOut]
    guardrails: _GuardOut
    summary: str
    runWhere: Literal["mac", "cloud"]
    missed: Literal["run_on_wake", "skip"]
    questions: list[str] = Field(default_factory=list)


ICONS = ("calendar-clock", "wallet", "piggy-bank", "receipt", "home", "zap", "wifi", "repeat", "mail", "bell",
         "shield-check", "trending-up", "folder", "file-text", "users", "credit-card", "shopping-cart", "utensils",
         "heart-handshake", "sparkles", "clock", "send", "banknote", "bar-chart-3")

STEP_TOOLS = ("money_overview", "check_spend", "pay", "move_between_pots", "pay_bill", "request_money", "cancel_subscription", "recent_money",
              "tell_user", "recall_memory", "gmail_search", "gmail_draft", "gmail_send", "google_calendar_events",
              "slack_send", "sheets_add_rows", "docs_create", "calendar_events", "add_reminder", "send_imessage",
              "read_file", "app_usage", "operate", "search_the_web")

_COMPILE = """\
You turn one sentence from the user into a routine for Plex, a personal money and errands agent
on their Mac. Plex runs the routine on its trigger; a worker follows the steps with tools; every
money step still goes through the user's pot rules in code.

Now: {now} ({tz}). The user's pots: {pots}.

Fill in:
- name: 3 to 6 words, plain ("Friday Food sweep", "Pay rent when everyone's in").
- icon: one of {icons}.
- trigger: when it runs.
  schedule: cadence hourly (everyHours), daily (time), weekly (days + time), monthly (dayOfMonth +
  time) or once (onceAt). "Every Friday at 6pm" is weekly, days [5], time "18:00". No time given:
  use 09:00 and don't ask about it (the user can change it on the routine's page).
  email: a Gmail search (query) and a label, for "when an email from Comcast arrives".
  paypal: a PayPal webhook event (INVOICING.INVOICE.PAID, PAYMENT.CAPTURE.COMPLETED,
  BILLING.SUBSCRIPTION.ACTIVATED...) and a label, for "when an invoice is paid".
  folder: a folder path and a glob pattern, for "when a PDF lands in ~/Downloads/Bills".
  manual: only run when asked.
- conditions: what must be true before acting ("Food pot has money left"); empty if none.
- steps: 1 to 6 short steps in order. kind: check (read something), act (do something non-money),
  money (moves money), notify (tell the user), ask (needs the user's answer), wait. tool: the main
  tool for the step, one of {tools}. Money to people uses pay; bills use pay_bill; asking people to
  pay the user back uses request_money (that's an act step, it doesn't spend). Moving money between
  the user's own pots (Food to Savings) uses move_between_pots (a money step; no one is paid).
  Amounts that depend on state ("half of what's left") stay as words in detail. Never write today's
  amounts into a step or condition: "if it's the usual amount" stays as those words, since the
  bill changes every month (the worker compares it with the usual in code at run time).
- guardrails: potName (the pot money comes from, spelled as above), maxSpendCents only for a hard cap
  the user states ("never more than $200"); "ask me if it's over $150" is not a cap (put that
  threshold in a condition or an ask step, and leave maxSpendCents empty), approval: always (the user says ask me / confirm first), over_limit (the pot's rules decide;
  the default when money moves) or never_money (no money steps).
- summary: one sentence starting with the trigger: "Every Friday at 6 pm, moves half of what's left
  in Food to Savings and tells you."
- runWhere: mac if any step needs the screen, Mac apps (Calendar, Reminders, Messages, files) or a
  folder trigger; cloud if only money and connected-account APIs.
- missed: run_on_wake for money moves, bills and check-ins; skip for things that only matter at that
  moment (a reminder at 9).
- questions: at most 2 short questions about what's genuinely unclear and changes what the routine
  does (which pot when several fit, which people); never about the time of day; empty if it's clear.
  Still fill in your best guess.

The user said: "{prompt}"
"""


_genai: genai.Client | None = None


def _client() -> genai.Client:
    global _genai
    if _genai is None:
        _genai = genai.Client(location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"))
    return _genai


def _tz(timezone: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(timezone or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _to_spec(out: _CompileOut, timezone: str) -> Spec:
    t = out.trigger
    trigger: dict[str, Any] = {"kind": t.kind}
    if t.kind == "schedule":
        trigger["cadence"] = t.cadence or "daily"
        if trigger["cadence"] == "once":
            when = dt.datetime.fromisoformat(t.onceAt) if t.onceAt else dt.datetime.now() + dt.timedelta(hours=1)
            if when.tzinfo is None:
                when = when.replace(tzinfo=_tz(timezone))
            trigger["at"] = int(when.timestamp() * 1000)
        else:
            if trigger["cadence"] != "hourly":
                trigger["time"] = t.time or "09:00"
            if trigger["cadence"] == "weekly":
                trigger["days"] = t.days or [1]
            if trigger["cadence"] == "monthly":
                trigger["dayOfMonth"] = min(max(t.dayOfMonth or 1, 1), 31)
            if trigger["cadence"] == "hourly":
                trigger["everyHours"] = max(1, t.everyHours or 1)
    elif t.kind == "email":
        trigger.update(query=t.query or t.label or "", label=t.label or f"Email matching {t.query}")
    elif t.kind == "paypal":
        trigger.update(event=t.event or "INVOICING.INVOICE.PAID", label=t.label or "PayPal event")
    elif t.kind == "folder":
        trigger.update(path=t.path or "~/Downloads", label=t.label or f"A file in {t.path}")
        if t.pattern:
            trigger["pattern"] = t.pattern
    steps = [Step(id=f"s{i + 1}", **s.model_dump()) for i, s in enumerate(out.steps[:6])]
    guard = out.guardrails.model_dump()
    if not any(s.kind == "money" for s in steps):
        guard["approval"] = "never_money"
    return Spec.model_validate({
        "trigger": trigger, "conditions": [c.model_dump() for c in out.conditions], "steps": [s.model_dump() for s in steps],
        "guardrails": guard, "summary": out.summary,
    })


async def _generate(prompt: str) -> _CompileOut:
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=_CompileOut,
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW),
    )
    last: Exception | None = None
    for model in (COMPILE_MODEL, COMPILE_FALLBACK):
        try:
            res = await asyncio.wait_for(_client().aio.models.generate_content(model=model, contents=prompt, config=config), 40)
            return res.parsed if isinstance(res.parsed, _CompileOut) else _CompileOut.model_validate_json(res.text or "{}")
        except Exception as err:  # rate-limited, slow or malformed: one more model
            last = err
            print(f"plex: routine compile on {model} failed: {type(err).__name__}: {str(err)[:200]}", flush=True)
    raise RuntimeError(f"Couldn't compile the routine: {last}")


async def compile(prompt: str, timezone: str | None = None) -> dict[str, Any]:
    """{name, icon, spec, runWhere, missed, questions}: the spec is valid for routines:save."""
    tz = timezone or "UTC"
    try:
        pots = ", ".join(p.get("name", "") for p in (await convex.query("agent:snapshot") or {}).get("pots") or []) or "unknown"
    except convex.ConvexError:
        pots = "unknown"
    now = dt.datetime.now(_tz(tz)).strftime("%A %d %B %Y, %H:%M")
    text = _COMPILE.format(now=now, tz=tz, pots=pots, icons=", ".join(ICONS), tools=", ".join(STEP_TOOLS), prompt=prompt.strip())
    out = await _generate(text)
    try:
        spec = _to_spec(out, tz)
    except (ValidationError, ValueError, AssertionError) as err:
        # One retry with the validation error in the prompt.
        out = await _generate(text + f"\n\nYour last answer was invalid ({str(err)[:300]}). Fix it.")
        spec = _to_spec(out, tz)
    run_where = "mac" if spec.trigger.kind == "folder" else out.runWhere
    return {
        "name": out.name.strip()[:80],
        "icon": out.icon if out.icon in ICONS else "repeat",
        "spec": spec_json(spec),
        "runWhere": run_where,
        "missed": out.missed,
        "questions": [q for q in out.questions if q.strip()][:2],
    }


def describe(spec: dict[str, Any]) -> str:
    """When / If / Then, for confirm cards and the worker's goal."""
    t = spec.get("trigger") or {}
    if t.get("kind") == "schedule":
        names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        days = ", ".join(names[int(d)] for d in t.get("days") or [] if 0 <= int(d) <= 6)
        when = " ".join(b for b in (str(t.get("cadence")), f"on {days}" if days else "",
                                     f"day {int(t['dayOfMonth'])}" if t.get("dayOfMonth") else "",
                                     f"every {int(t['everyHours'])} h" if t.get("everyHours") else "",
                                     f"at {t['time']}" if t.get("time") else "") if b)
    elif t.get("kind") == "manual":
        when = "When you ask"
    else:
        when = str(t.get("label") or t.get("kind"))
    lines = [f"When: {when}"]
    for c in spec.get("conditions") or []:
        lines.append(f"If: {c.get('text')}")
    for i, s in enumerate(spec.get("steps") or [], 1):
        lines.append(f"Then {i}. [{s.get('kind')}] {s.get('title')}" + (f" ({s.get('detail')})" if s.get("detail") else "")
                     + (f" -> {s.get('tool')}" if s.get("tool") else ""))
    g = spec.get("guardrails") or {}
    bits = [f"from the {g['potName']} pot" if g.get("potName") else None,
            f"at most ${g['maxSpendCents'] / 100:,.2f}" if g.get("maxSpendCents") else None,
            {"always": "always asks before paying", "over_limit": "asks when the pot's rules say so",
             "never_money": "never moves money"}.get(g.get("approval") or "")]
    lines.append("Guardrails: " + ", ".join(b for b in bits if b))
    return "\n".join(lines)


# --- the scheduler -------------------------------------------------------------------------------


def _hhmm(ms: int | None, timezone: str | None) -> str:
    if not ms:
        return "its time"
    when = dt.datetime.fromtimestamp(ms / 1000, _tz(timezone))
    return when.strftime("%-I:%M %p").lower().replace(":00 ", " ") if when.minute == 0 else when.strftime("%-I:%M %p").lower()


class Scheduler:
    def __init__(self) -> None:
        self._loop: asyncio.Task[None] | None = None
        self._poke = asyncio.Event()
        self.running: dict[str, Any] = {}  # routineId -> Task
        self._mail_seen: dict[str, set[str]] = {}
        self._last_mail = 0.0
        self.last_tick: float | None = None
        self.last_error: str | None = None

    def start(self) -> None:
        if self._loop is None or self._loop.done():
            self._loop = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._loop:
            self._loop.cancel()
            try:
                await self._loop
            except (asyncio.CancelledError, Exception):
                pass

    def poke(self) -> None:
        """Check at once: the Mac said hello or woke up."""
        self._poke.set()

    async def _run(self) -> None:
        await asyncio.sleep(2)
        while True:
            try:
                await self.tick()
                self.last_error = None
            except asyncio.CancelledError:
                raise
            except Exception as err:
                msg = f"{type(err).__name__}: {str(err)[:200]}"
                if msg != self.last_error:
                    print(f"plex: scheduler tick failed: {msg}", flush=True)
                self.last_error = msg
            self._poke.clear()
            try:
                await asyncio.wait_for(self._poke.wait(), TICK_S)
            except TimeoutError:
                pass

    async def tick(self) -> None:
        self.last_tick = time.time()
        now = int(time.time() * 1000)
        data = await convex.query("routines:due", now=now) or {}
        has_mac = mac() is not None
        for run in data.get("queued") or []:
            rid = str(run.get("routineId"))
            if rid in self.running:
                continue
            ctx = await convex.query("routines:context", routineId=rid)
            routine = (ctx or {}).get("routine")
            if not routine:
                continue
            if routine.get("runWhere") == "mac" and not has_mac:
                continue  # waits for the Mac
            await self.start_run(routine, str(run.get("reason") or "Run now"), run_id=str(run["_id"]),
                                 recent=(ctx or {}).get("recentRuns"), payload=run.get("trigger") or None)
        for routine in data.get("due") or []:
            rid = str(routine["_id"])
            if rid in self.running:
                continue
            if routine.get("runWhere") == "mac" and not has_mac:
                continue  # runs only while a Mac is connected; the missed rule applies when it's back
            due_at = int(routine.get("nextRunAt") or now)
            at = _hhmm(due_at, routine.get("timezone"))
            if now - due_at > LATE_MS:
                asleep = "while your Mac slept" if routine.get("runWhere") == "mac" else "while Plex was offline"
                if routine.get("missed") == "skip":
                    await convex.mutation("routines:skipRun", routineId=rid, reason=f"Missed at {at} {asleep}, skipped")
                    continue
                reason = f"Missed at {at} {asleep}, ran on wake"
            else:
                reason = f"Scheduled for {at}"
            await self.start_run(routine, reason)
        if time.time() - self._last_mail >= MAIL_EVERY_S:
            self._last_mail = time.time()
            await self._poll_mail()

    async def start_run(self, routine: dict[str, Any], reason: str, run_id: str | None = None,
                        payload: dict[str, Any] | None = None, recent: list[dict[str, Any]] | None = None) -> str:
        rid = str(routine["_id"])
        run_id = str(await convex.mutation("routines:startRun", routineId=rid, reason=reason, runId=run_id))
        conn: Connection = mac() or cloud()
        if recent is None:
            try:
                recent = (await convex.query("routines:context", routineId=rid) or {}).get("recentRuns")
            except convex.ConvexError:
                recent = []
        assert conn.tasks
        try:
            goal = _goal(routine, reason, recent or [], payload)
        except Exception as err:
            await convex.mutation("routines:finishRun", runId=run_id, status="failed",
                                  summary=f"Plex couldn't start this run: {type(err).__name__}: {str(err)[:200]}")
            raise
        print(f"plex: routine {routine.get('name')!r} starting ({reason}) on {'the Mac' if conn.has_mac else 'the cloud'}, run {run_id}",
              flush=True)

        async def finish(task: Any) -> None:
            self.running.pop(rid, None)
            status = {"done": "done", "failed": "failed", "cancelled": "cancelled"}.get(task.status, "done")
            summary = (task.say or task.error or status).strip()[:500]
            try:
                await convex.mutation("routines:finishRun", runId=run_id, status=status, summary=summary)
            except convex.ConvexError as err:
                print(f"plex: routines:finishRun failed: {err}", flush=True)
            await conn.bridge.send_json({"type": "asks_changed"})

        task = conn.tasks.start(goal, str(routine.get("name") or "Routine"), quiet=True,
                                routine={"id": rid, "name": str(routine.get("name") or "Routine"),
                                         "prompt": str(routine.get("prompt") or "")}, run_id=run_id, on_end=finish)
        task.guardrails = (routine.get("spec") or {}).get("guardrails")
        self.running[rid] = task
        return run_id

    async def run_by_id(self, routine_id: str, reason: str = "Run now") -> str:
        ctx = await convex.query("routines:context", routineId=routine_id)
        if not ctx or not ctx.get("routine"):
            raise ValueError("No such routine")
        return await self.start_run(ctx["routine"], reason, recent=ctx.get("recentRuns"))

    # --- event triggers ----------------------------------------------------------------------

    async def _routines(self) -> list[dict[str, Any]]:
        return [r for r in (await convex.public_query("routines:list") or []) if r.get("enabled")]

    async def _poll_mail(self) -> None:
        email_routines = [r for r in await self._routines() if ((r.get("spec") or {}).get("trigger") or {}).get("kind") == "email"]
        if not email_routines or not accounts.configured():
            return
        conn = mac()
        user = conn.user_id if conn else os.environ.get("PLEX_COMPOSIO_USER", "")
        if not user or not await accounts.is_connected(user, "gmail"):
            return
        for routine in email_routines:
            rid = str(routine["_id"])
            trigger = routine["spec"]["trigger"]
            try:
                messages = await accounts.gmail_messages(user, f"{trigger['query']} newer_than:1d", 5)
            except Exception as err:
                print(f"plex: Gmail poll for {routine.get('name')!r} failed: {err}", flush=True)
                continue
            first_look = rid not in self._mail_seen
            seen = self._mail_seen.setdefault(rid, set())
            fresh = [m for m in messages if m["id"] not in seen]
            seen.update(m["id"] for m in messages)
            if first_look or not fresh or rid in self.running:
                continue  # the first poll only learns what's already there
            m = fresh[0]
            if routine.get("runWhere") == "mac" and mac() is None:
                continue
            await self.start_run(routine, f"{trigger.get('label') or 'Email'}: {m.get('subject') or 'new message'}",
                                 payload={"email": m})

    async def on_folder_event(self, path: str, file: str) -> int:
        """A file appeared in a watched folder (the Mac watches; this starts the matching runs)."""
        started = 0
        full = os.path.expanduser(file if file.startswith("/") else os.path.join(path, file))
        name = os.path.basename(full)
        for routine in await self._routines():
            trigger = (routine.get("spec") or {}).get("trigger") or {}
            if trigger.get("kind") != "folder":
                continue
            folder = os.path.expanduser(str(trigger.get("path") or "")).rstrip("/")
            if not folder or not (os.path.expanduser(path).rstrip("/") == folder or full.startswith(folder + "/")):
                continue
            if trigger.get("pattern") and not fnmatch.fnmatch(name, str(trigger["pattern"])):
                continue
            if str(routine["_id"]) in self.running:
                continue
            await self.start_run(routine, f"New file: {name}", payload={"file": full})
            started += 1
        return started


def _goal(routine: dict[str, Any], reason: str, recent: list[dict[str, Any]], payload: dict[str, Any] | None) -> str:
    spec = routine.get("spec") or {}
    history = "\n".join(
        f"- {dt.datetime.fromtimestamp((r.get('startedAt') or 0) / 1000).strftime('%a %d %b')}: {r.get('status')}: {r.get('summary') or ''}"
        for r in recent[:5] if r.get("status") not in ("queued", "running")
    ) or "- none yet"
    return f"""\
You're running the user's routine "{routine.get('name')}" ({reason}). This is a quiet run: the user
isn't talking to you; the notch shows your progress, and anything you need from them becomes an ask.

What they asked for, in their words: "{routine.get('prompt')}"

The compiled routine:
{describe(spec)}

{('Trigger details: ' + json.dumps(payload, default=str)[:2000]) if payload else ''}
Recent runs:
{history}

How to run it:
- Check the conditions first with tools (money_overview for pots and bills). If one isn't met,
  stop there and say why in one sentence: that's a normal, successful run.
- "The usual amount" means within 10% of the bill's usual (record_bill or money_overview give it;
  record_bill's timesUsual up to 1.1), unless the user named their own margin. Cents of difference
  are the usual.
- Follow the steps in order with the tools they name. Work out amounts from live data (integer
  cents; "half of what's left" means half the pot's balance, rounded down to the cent).
- Money goes through pay or pay_bill only: the pot's rules and the routine's guardrails decide,
  and an approval card goes to the user when they say so. Never claim money moved unless the tool
  returned ok with a receiptId.
- "Tell me" and notify steps: tell_user with one or two plain sentences.
- Finish with one or two sentences for the run log: what you did, with amounts and payees.
"""


scheduler = Scheduler()


# --- worker tools ---------------------------------------------------------------------------------


async def create_routine(description: str, tool_context: ToolContext) -> dict[str, Any]:
    """Make a standing routine from what the user said ("every Friday at 6pm, move half of what's
    left in Food to savings and tell me", "when the Comcast bill comes in, pay it if it's under
    $100"). Compiles it into When / If / Then, asks any unclear point, shows it to the user to
    confirm, then saves it. Don't do the routine's work now; it runs on its trigger.

    Args:
        description: The routine in the user's own words, with any details from the conversation.
    """
    conn, task = for_worker(tool_context)
    assert conn.tasks
    tz = conn.timezone or "UTC"
    await report(conn, task, "routine", "Drafting the routine")
    draft = await compile(description, tz)
    if draft["questions"]:
        answer = await conn.tasks.ask(task, draft["questions"][0])
        description = f"{description}\n(Asked: {draft['questions'][0]} They said: {answer})"
        draft = await compile(description, tz)
    card = describe(draft["spec"])
    if not await conn.tasks.confirm_action(task, f"Save the routine “{draft['name']}”?", f"{draft['spec']['summary']}\n\n{card}"):
        return {"saved": False, "note": "The user didn't want it saved. Ask what to change."}
    routine_id = await convex.mutation("routines:saveFromBrain", name=draft["name"], prompt=description, icon=draft["icon"],
                                       spec=draft["spec"], runWhere=draft["runWhere"], missed=draft["missed"], timezone=tz)
    await report(conn, task, "routine", f"Saved the routine “{draft['name']}”", draft["spec"]["summary"])
    return {"saved": True, "routineId": routine_id, "name": draft["name"], "summary": draft["spec"]["summary"],
            "runWhere": draft["runWhere"]}


async def list_routines(tool_context: ToolContext) -> dict[str, Any]:
    """The user's routines: name, what each does, on or off, the next run and how the last went."""
    conn, task = for_worker(tool_context)
    rows = await convex.public_query("routines:list") or []
    await report(conn, task, "routine", "Looked at your routines")
    return {"routines": [{"_id": r.get("_id"), "name": r.get("name"), "summary": (r.get("spec") or {}).get("summary"),
                          "enabled": r.get("enabled"), "nextRunAt": r.get("nextRunAt"),
                          "lastRun": r.get("lastRun")} for r in rows]}


async def run_routine_now(routine_id: str, tool_context: ToolContext) -> dict[str, Any]:
    """Run one of the user's routines now (find its _id with list_routines).

    Args:
        routine_id: The routine's _id.
    """
    conn, task = for_worker(tool_context)
    run_id = await scheduler.run_by_id(routine_id, "You asked for a run now")
    await report(conn, task, "routine", "Started a routine run")
    return {"runId": run_id, "note": "It runs in the background; its card shows in the notch."}


async def tell_user(message: str, tool_context: ToolContext) -> dict[str, Any]:
    """Tell the user something from a routine run or a task ("Moved $41.20 from Food to Savings").
    It shows as a note on the notch card and in Today.

    Args:
        message: One or two plain sentences.
    """
    conn, task = for_worker(tool_context)
    assert conn.tasks
    title = (task.routine or {}).get("name") or task.title
    conn.tasks.show_view(task, {"type": "note", "key": "tell", "title": title, "text": message})
    await convex.log("routine" if task.run_id else "task", title, message[:300],
                     runId=task.run_id, routineId=(task.routine or {}).get("id"))
    conn.tasks.step(task, f"Told you: {message[:120]}", kind="info")
    return {"told": True}


TOOLS = [create_routine, list_routines, run_routine_now, tell_user]

"""The worker: the agent that does the real work of a task or a routine run.

gemini-3.8-flash with low thinking, in its own ADK session per task (a follow-up on the
same task reuses it, so it remembers what it did). Its tools: money (money.py, over Convex
agentMoney:*), memory, routines, the user's cloud accounts (accounts.py), the Mac's data and
actions (mac_tools.py), the operator for anything on screen (operator.py) and web search.

Measured on Slice (2026-10-20/27): a step takes 2-9 s on gemini-3.8-flash, but the shared
quota sometimes answers 429 and default retries turned that into 20-60 s waits. So a step
that hasn't answered after HEDGE_S asks the next model in FALLBACKS too, a 429 moves on at
once, and the first answer wins.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import time
from typing import Any
from zoneinfo import ZoneInfo

from google.adk.agents import Agent, LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.models import Gemini, LlmRequest, LlmResponse
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext, google_search
from google.adk.tools.google_search_agent_tool import GoogleSearchAgentTool
from google.genai import types

from . import accounts, convex, insights, mac_tools, memory, money, routines
from .connection import Connection, for_worker, register_worker, report
from .operator import TOOLS as OPERATOR_TOOLS
from .tasks import Task

WORKER_MODEL = os.environ.get("PLEX_WORKER_MODEL", "gemini-3.8-flash")
FALLBACKS = [m for m in os.environ.get("PLEX_WORKER_FALLBACKS", "gemini-3.6-flash,gemini-2.5-flash").split(",") if m]
# Low keeps each step to a few seconds (MINIMAL isn't supported on 3.8 Flash).
THINKING = os.environ.get("PLEX_WORKER_THINKING", "LOW")
APP_NAME = "plex_worker"
DEBUG = bool(os.environ.get("MAC_DEBUG"))


def _instruction(ctx: ReadonlyContext) -> str:
    s = ctx.state
    return f"""\
You are Plex's worker. Plex is a personal agent for money and errands on the user's Mac. The
voice assistant (or one of the user's routines) handed you a task; do it fully, then report
back in a few words that will be read aloud. Today is {s.get('now')} ({s.get('timezone') or 'local time'}).

The user: {s.get('name') or 'unknown'}.
What you know about them (their memory in Plex):
{s.get('memories') or 'nothing yet'}
Their money right now: {s.get('money') or 'call money_overview'}
What's in front of them: {s.get('front') or 'unknown'}.

How money works here (this is the law, not a style):
- You never move money yourself. pay, pay_bill, request_money and cancel_subscription ask
  Convex, which runs the user's pot rules in code, writes a receipt and calls PayPal. The rules
  decide whether a payment goes through, needs the user's OK (the notch shows Allow / Deny /
  Always and the tool waits) or is blocked. Don't ask "shall I pay?" yourself before pay;
  the rules do that. Do ask before request_money and cancel_subscription (those tools ask).
- Never say money moved, a bill is paid or a request went out unless the tool returned ok
  (and, for payments, a receiptId). If it was blocked or declined, say so plainly with the rule.
- Amounts are integer cents. Bills: use pay_bill with the payee; it finds the amount. If a
  bill is much higher than usual, say so when you report.
- "Can I afford / can I spend…" questions: check_spend (no money moves).
- Moving money between the user's own pots ("half of what's left in Food to Savings"):
  money_overview for the balance, then move_between_pots. It's not a payment, so never use pay for it.

- Asking people for money (a split, a share of a bill, a client) is request_money: PayPal emails
  each one an invoice with a Pay button. Say "PayPal invoice". Set pot_name to where the money
  should land (the pot a shared bill came from; Work for a client).
- A pot they mention that doesn't exist ("put 30% in Tax"): create_pot (it asks them), then go on.

Paying on a website (a booking, a ticket, a portal):
0. Anything at a time (a class, a table, a trip): calendar_events for that day first. If it clashes,
   ask_user with the times that don't (options), before booking anything.
1. operate to get to the payment step, with the user's real name and email from memory in the job
   (recall_memory if you don't have them). It stops there and reports the amount, who gets paid
   (their PayPal email) and the order, booking or citation number.
2. Check it against what you expected (the photo, the bill, what they asked for). If it differs,
   stop and ask_user.
3. pay(kind="purchase" or "bill", payee_email=…, reference=that number). The rules decide.
4. Only if it went through: operate again to finish ("The payment is done, reference CC-4821:
   finish the booking and read the confirmation"; add "save it as a PDF" when proof is worth
   keeping). Don't ask the user a second time.

Other work:
- Bills and subscriptions: money_overview has bills due in 14 days (with usual amounts) and
  subscriptions (price rises, days since last used). app_usage tells when a Mac app was last
  opened, to spot a subscription they don't use.
- A bill you found that isn't in money_overview (an email, a PDF, a portal): record_bill first.
  It says how it compares with their usual amount; 1.5 times or more is a spike worth saying.
- "How did I do", "where does my money go", "plan my week", "what should I cut": gather the facts,
  then show_insights (a page of charts and tables that opens on their Mac), and end with the one
  or two things you'd do, as a question. After you act on it, update the page (insights_id).
- After a payment, finish the job around it: the calendar event, the reminder, the note they'd
  want, from what you learned (an address, a deadline, a cancellation date).
- Memory: recall_memory before asking the user for something they may have told Plex before
  (a landlord's email, a roommate's share). remember_this when they tell you something durable.
- Routines: "every Friday…", "whenever…", "when the bill comes in…" means create_routine with
  their words (it compiles, confirms with them and saves). Don't do the routine's work now.
- Their apps: Gmail, Google Calendar, Drive, Docs, Sheets, Slack and Notion through the account
  tools (connect_app only when they named that app); Calendar, Reminders, Notes, Contacts and
  Messages on the Mac. A dropped file ("[Dropped file: /path]"): read_file.
- On screen: operate, with one precise job and every detail, only when no tool can do it
  (a biller's website, a native app). It hands over for sign-ins; never use it to pay.
- The web: search_the_web for anything current (a biller's support number, a fee).
- Anything that sends, posts or changes data asks the user inside the tool; don't ask twice.
- Ask the user (ask_user) only for what no tool or memory can tell you, one question at a time.

Finish with one to three short sentences: what you did or found (amounts as "$84.20"), and one
next step as a question if there is one. No lists, links, ids or markdown.
"""


async def ask_user(question: str, tool_context: ToolContext, options: list[str] | None = None) -> dict[str, Any]:
    """Ask the user one question and wait for the answer (the notch shows it, the voice asks it,
    and it's in their Needs you list).

    Args:
        question: A short, specific question.
        options: Optional choices for the user to tap ("Food", "Errands").
    """
    conn, task = for_worker(tool_context)
    assert conn.tasks
    return {"answer": await conn.tasks.ask(task, question, options)}


async def show_note(title: str, text: str, tool_context: ToolContext) -> dict[str, Any]:
    """Show a piece of writing on the notch card with a Copy button: a message to send, a split
    breakdown, a summary.

    Args:
        title: "Dinner split".
        text: The words, as they'd be written.
    """
    conn, task = for_worker(tool_context)
    assert conn.tasks
    conn.tasks.show_view(task, {"type": "note", "key": title, "title": title, "text": text})
    await report(conn, task, "plex", f"Wrote {title}")
    return {"shown": True}


# A step slower than this is usually stuck behind the shared quota; try the next model.
STEP_TIMEOUT_S = 15.0
HEDGE_S = 7.0


def _rate_limited(err: Exception) -> bool:
    return isinstance(err, TimeoutError) or "RESOURCE_EXHAUSTED" in str(err) or getattr(err, "code", None) == 429


class FallbackGemini(Gemini):
    """Gemini that moves to the next model when one is rate-limited, instead of waiting: a model
    that hasn't answered after HEDGE_S gets the next one started beside it (hedged), and a 429
    moves on at once."""

    fallbacks: list[str] = []

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False):  # type: ignore[override]
        models = [llm_request.model or self.model, *self.fallbacks]
        running: dict[asyncio.Task[list[LlmResponse]], str] = {}
        failed: Exception | None = None
        started = time.monotonic()
        try:
            next_model = 0
            while True:
                if next_model < len(models) and (not running or time.monotonic() - started >= HEDGE_S * next_model):
                    name = models[next_model]
                    # A shallow copy: the requests share contents and tools (a deep copy hits a thread
                    # lock inside the tool declarations) and differ only in the model.
                    request = llm_request.model_copy(update={"model": name})
                    if next_model:
                        print(f"plex: {models[next_model - 1]} hasn't answered in {HEDGE_S:.0f}s, asking {name} too", flush=True)
                    running[asyncio.create_task(_collect(super().generate_content_async(request, stream)))] = name
                    next_model += 1
                if not running:
                    raise failed or TimeoutError("no model answered")
                wait = HEDGE_S * next_model - (time.monotonic() - started) if next_model < len(models) else STEP_TIMEOUT_S
                done, _ = await asyncio.wait(running, timeout=max(0.1, wait), return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    name = running.pop(task)
                    try:
                        responses = task.result()
                    except Exception as err:
                        failed = err
                        if not _rate_limited(err):
                            raise
                        print(f"plex: {name} is rate-limited", flush=True)
                        continue
                    for response in responses:
                        yield response
                    return
                if not done and not running and next_model >= len(models):
                    raise failed or TimeoutError("no model answered")
                if time.monotonic() - started > STEP_TIMEOUT_S + HEDGE_S * len(models):
                    raise failed or TimeoutError("no model answered in time")
        finally:
            for task in running:
                task.cancel()


async def _collect(gen: Any) -> list[LlmResponse]:
    return [response async for response in gen]


def tool_failed(tool: Any, args: dict[str, Any], tool_context: ToolContext, error: Exception) -> dict[str, Any]:
    """A tool that raises would end the whole task (or the talker's Live session); hand the error
    to the model instead so it can carry on or say what didn't work."""
    print(f"plex: tool {getattr(tool, 'name', tool)} failed: {type(error).__name__}: {error}", flush=True)
    if isinstance(error, convex.ConvexError):
        return {"error": f"Plex's data service said: {str(error)[:300]}", "note": "Nothing changed. Say it didn't work."}
    return {"error": f"{type(error).__name__}: {str(error)[:300]}"}


def _before_model(callback_context: CallbackContext, llm_request: LlmRequest) -> None:
    callback_context.state["temp:model_started"] = time.monotonic()


def _after_model(callback_context: CallbackContext, llm_response: LlmResponse) -> None:
    if DEBUG:
        took = time.monotonic() - (callback_context.state.get("temp:model_started") or time.monotonic())
        usage = llm_response.usage_metadata
        tokens = f"{usage.prompt_token_count} in, {usage.candidates_token_count} out" if usage else ""
        print(f"plex: worker model call {took:4.1f}s {tokens}", flush=True)


_model = FallbackGemini(
    model=WORKER_MODEL,
    fallbacks=FALLBACKS,
    retry_options=types.HttpRetryOptions(attempts=1),
)

# Google Search is a built-in tool that can't share a request with function tools, so it lives
# in a sub-agent the worker calls like any other tool (ADK's own workaround).
_searcher = LlmAgent(
    name="search_the_web",
    model=_model,
    description=(
        "Look something up on the web with Google Search: a biller's support number or website, a fee, "
        "a due-date policy, news, anything current. Give one clear question with the names in it."
    ),
    instruction="""\
You answer one question with Google Search. Reply in two or three plain sentences with the facts
you found (names, numbers, dates, prices, addresses) and say in words which site they came from.
No lists, links or markdown. If the web doesn't settle it, say what you did find and what's unclear.
""",
    tools=[google_search],
    generate_content_config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel(THINKING.upper())),
    ),
)
search_the_web = GoogleSearchAgentTool(_searcher)

worker_agent = Agent(
    name="plex_worker",
    model=_model,
    before_model_callback=_before_model,
    after_model_callback=_after_model,
    on_tool_error_callback=tool_failed,
    instruction=_instruction,
    tools=[
        ask_user, show_note, *money.TOOLS, *memory.TOOLS, *routines.TOOLS, *accounts.TOOLS, *mac_tools.TOOLS,
        *OPERATOR_TOOLS, *insights.TOOLS, search_the_web,
    ],
    generate_content_config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel(THINKING.upper())),
    ),
)
_sessions = InMemorySessionService()
_runner = Runner(app_name=APP_NAME, agent=worker_agent, session_service=_sessions)


def now_text(timezone: str | None) -> str:
    try:
        now = dt.datetime.now(ZoneInfo(timezone)) if timezone else dt.datetime.now()
    except Exception:
        now = dt.datetime.now()
    return now.strftime("%A %d %B %Y, %H:%M")


def _describe_front(front: dict[str, Any]) -> str | None:
    if front.get("error") or not front.get("app"):
        return None
    bits = [front["app"], front.get("windowTitle"), front.get("url")]
    return ", ".join(str(b) for b in bits if b)


def money_line(snap: dict[str, Any]) -> str:
    """The snapshot in a few compact lines for an instruction."""
    if not snap:
        return ""
    usd = money.usd
    pots = "; ".join(f"{p.get('name')} {usd(p.get('balanceCents'))} left"
                     + (f" ({', '.join(p.get('rules') or [])})" if p.get("rules") else "") for p in snap.get("pots") or [])
    bills = "; ".join(f"{b.get('payee')} {usd(b.get('amountCents'))} due {b.get('due')}"
                      + (" (autopay)" if b.get("autopay") else "") + (f" [usually {usd(b.get('usualCents'))}]" if b.get("usualCents") and b.get("usualCents") != b.get("amountCents") else "")
                      for b in snap.get("billsDue") or [])
    asks = "; ".join(f"{a.get('title')}" for a in snap.get("pendingAsks") or [])
    paused = " ALL AGENT SPENDING IS PAUSED." if snap.get("paused") else ""
    return f"Pots: {pots or 'none'}. Bills due in 14 days: {bills or 'none'}. Waiting on them: {asks or 'nothing'}.{paused}"


async def run_worker(conn: Connection, task: Task, message: str) -> str:
    """Run the worker on a task until it answers; returns what to say."""
    if task.worker_session_id is None:
        try:
            snap = await money.snapshot()
            conn.snapshot = snap
        except convex.ConvexError:
            snap = conn.snapshot
        try:
            conn.core_memories = await memory.core()
        except Exception:
            pass
        front = await conn.bridge.call("frontmost_app", timeout=4) if conn.has_mac else {}
        session = await _sessions.create_session(
            app_name=APP_NAME,
            user_id=conn.user_id,
            state={
                "now": now_text(conn.timezone),
                "timezone": conn.timezone,
                "name": conn.name or (snap or {}).get("name"),
                "memories": memory.core_lines(conn.core_memories),
                "money": money_line(snap or {}),
                "front": _describe_front(front),
            },
        )
        task.worker_session_id = session.id
        register_worker(session.id, conn, task)
    await report(conn, task, "plex", "Started", task.title, step_kind="info")
    if task.said and not task.run_id:
        quoted = " / ".join(f"\u201c{w}\u201d" for w in task.said[-3:])
        message = f"{message}\n\n(What the user actually said, word for word: {quoted}. Quote it as `why` on any payment.)"
    final = ""
    started = time.monotonic()
    async for event in _runner.run_async(
        user_id=conn.user_id,
        session_id=task.worker_session_id,
        new_message=types.Content(role="user", parts=[types.Part(text=message)]),
    ):
        if DEBUG:
            for call in event.get_function_calls():
                print(f"plex: task {task.id} +{time.monotonic() - started:5.1f}s {call.name}({json.dumps(call.args, default=str)[:160]})", flush=True)
        if event.is_final_response() and event.content and event.content.parts:
            final = "".join(p.text or "" for p in event.content.parts if not p.thought)
    return final.strip() or "Done."

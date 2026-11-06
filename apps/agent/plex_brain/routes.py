"""Plex for Mac routes (/mac/*), mounted by server.py.

GET  /mac/health                 {ok, model, convex, composio}
WS   /mac/live                   one connected Mac (the talker, its tasks, Mac tools)
POST /mac/routines/compile       {prompt, timezone} -> {name, icon, spec, runWhere, missed, questions}
POST /mac/routines/run           {routineId} -> {runId} (now, in the brain)
GET  /mac/accounts?user=         the Connections screen: every app, its group and state (accounts.py)
POST /mac/accounts/connect       {user, app} -> {url} to sign in
GET  /mac/accounts/connected     where the sign-in page sends the browser when it's done
POST /mac/accounts/disconnect    {user, app} -> the catalog, without that app's accounts
GET  /mac/tools/status           {agentDesktop: {installed, version, accessibility}, agentBrowser: {installed, version}}

The WebSocket carries JSON text frames both ways plus binary audio (PCM16 mono, 16 kHz up
while the talk keys are held, 24 kHz down). Frames are listed in docs/plex-mac.md §4.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.events import Event
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService, Session
from google.genai import types
from pydantic import BaseModel

from . import accounts, convex, memory, money
from .bridge import MacBridge
from .connection import Connection, add_mac, mac, register_talker, remove_mac, unregister_talker
from .routines import compile as compile_routine
from .routines import scheduler
from .talker import LIVE_LOCATION, LIVE_MODEL, build_agent, live_run_config
from .tasks import TaskManager
from .worker import money_line, now_text

APP_NAME = "plex_talker"
MIC_MIME = "audio/pcm;rate=16000"
HELLO_WAIT_S = 3.0

router = APIRouter(prefix="/mac")
# Fire-and-forget work is held here so it isn't garbage-collected mid-run.
_background_jobs: set[asyncio.Task[Any]] = set()


def background(coro: Any) -> None:
    job = asyncio.create_task(coro)
    _background_jobs.add(job)
    job.add_done_callback(_background_jobs.discard)


_sessions = InMemorySessionService()
_runner = Runner(app_name=APP_NAME, agent=build_agent(), session_service=_sessions)


def _token_ok(header: str | None) -> bool:
    """When MAC_CLIENT_TOKEN is set (any hosted brain), the app must send it as a bearer token."""
    expected = os.environ.get("MAC_CLIENT_TOKEN")
    return not expected or header == f"Bearer {expected}"


def _require_token(request: Request) -> None:
    if not _token_ok(request.headers.get("authorization")):
        raise HTTPException(status_code=401, detail="Bad or missing token")


@router.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "model": LIVE_MODEL, "location": LIVE_LOCATION, "convex": await convex.healthy(),
            "composio": accounts.configured(), "mac": mac() is not None,
            "scheduler": {"lastTick": scheduler.last_tick, "error": scheduler.last_error, "running": list(scheduler.running)}}


class CompileBody(BaseModel):
    prompt: str
    timezone: str = "UTC"


@router.post("/routines/compile", dependencies=[Depends(_require_token)])
async def routines_compile(body: CompileBody) -> dict[str, Any]:
    if not body.prompt.strip():
        raise HTTPException(status_code=400, detail="Say what the routine should do.")
    try:
        return await compile_routine(body.prompt, body.timezone)
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Couldn't compile it: {str(err)[:300]}") from err


class RunBody(BaseModel):
    routineId: str


@router.post("/routines/run", dependencies=[Depends(_require_token)])
async def routines_run(body: RunBody) -> dict[str, Any]:
    if body.routineId in scheduler.running:
        task = scheduler.running[body.routineId]
        return {"runId": task.run_id, "already": True}
    try:
        return {"runId": await scheduler.run_by_id(body.routineId, "Run now")}
    except (ValueError, convex.ConvexError) as err:
        raise HTTPException(status_code=400, detail=str(err)[:300]) from err


@router.get("/accounts", dependencies=[Depends(_require_token)])
async def account_status(user: str) -> dict[str, Any]:
    return await accounts.catalog(user)


class Connect(BaseModel):
    user: str
    app: str


@router.post("/accounts/connect", dependencies=[Depends(_require_token)])
async def account_connect(body: Connect, request: Request) -> dict[str, Any]:
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    try:
        return {"url": await accounts.connect_link(body.user, body.app, f"{scheme}://{host}/mac/accounts/connected")}
    except Exception as err:
        raise HTTPException(status_code=400, detail=accounts.explain(err)) from err


@router.post("/accounts/disconnect", dependencies=[Depends(_require_token)])
async def account_disconnect(body: Connect) -> dict[str, Any]:
    try:
        await accounts.disconnect(body.user, body.app)
    except Exception as err:
        raise HTTPException(status_code=400, detail=accounts.explain(err)) from err
    return await accounts.catalog(body.user)


_CONNECTED_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Connected to Plex</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f8f7; color: #0f1412;
         font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; }
  main { max-width: 380px; padding: 36px 32px; border-radius: 18px; background: #fff; text-align: center;
         border: 1px solid rgba(15, 20, 18, .08); box-shadow: 0 5px 14px rgba(16, 24, 20, .06); }
  h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: -.4px; }
  p { margin: 0; color: #5b6661; }
</style></head><body><main><h1>You're connected</h1>
<p>You can close this tab and go back to Plex. It will show the app as connected in a moment.</p></main></body></html>"""


@router.get("/accounts/connected", response_class=HTMLResponse)
async def account_connected() -> str:
    """The page the browser lands on after a sign-in. No token: it shows nothing about the user."""
    return _CONNECTED_PAGE


async def _local_version(bin: str, *args: str) -> str | None:
    path = shutil.which(bin)
    if not path:
        return None
    try:
        proc = await asyncio.create_subprocess_exec(path, *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        out, _ = await asyncio.wait_for(proc.communicate(), 10)
        return out.decode(errors="replace").strip()
    except Exception:
        return None


def _version_of(text: str | None) -> str | None:
    if not text:
        return None
    try:
        env = json.loads(text)
        data = env.get("data") or {}
        return str(data.get("version") or data.get("agent_desktop") or env.get("version") or "").strip() or None
    except (json.JSONDecodeError, AttributeError):
        return text.splitlines()[0].strip()[:40]


@router.get("/tools/status", dependencies=[Depends(_require_token)])
async def tools_status() -> dict[str, Any]:
    """Whether agent-desktop and agent-browser are there (asked of the Mac when one is connected)."""
    conn = mac()
    if conn is not None:
        desk = await conn.bridge.call("cli", {"bin": "agent-desktop", "args": ["version"], "timeout_ms": 8000}, timeout=12)
        perms = await conn.bridge.call("cli", {"bin": "agent-desktop", "args": ["permissions"], "timeout_ms": 8000}, timeout=12)
        browser = await conn.bridge.call("cli", {"bin": "agent-browser", "args": ["--version"], "timeout_ms": 8000}, timeout=12)
        desk_v, perm_text, browser_v = (None if r.get("error") or r.get("code") else str(r.get("stdout") or "")
                                        for r in (desk, perms, browser))
        where = "mac"
    else:
        desk_v, perm_text, browser_v = await asyncio.gather(
            _local_version("agent-desktop", "version"), _local_version("agent-desktop", "permissions"),
            _local_version("agent-browser", "--version"))
        where = "brain"
    accessibility = None
    if perm_text:
        try:
            accessibility = (json.loads(perm_text).get("data") or {}).get("accessibility", {}).get("state")
        except (json.JSONDecodeError, AttributeError):
            pass
    return {
        "checkedOn": where,
        "agentDesktop": {"installed": desk_v is not None, "version": _version_of(desk_v), "accessibility": accessibility},
        "agentBrowser": {"installed": browser_v is not None, "version": _version_of(browser_v)},
    }


def _subscriptions_line(snap: dict[str, Any]) -> str:
    bits = []
    for s in (snap.get("subscriptions") or [])[:10]:
        line = f"{s.get('merchant')} {money.usd(s.get('amountCents'))}/{'yr' if s.get('cadence') == 'yearly' else 'mo'}"
        if s.get("previousAmountCents"):
            line += f" (up from {money.usd(s['previousAmountCents'])})"
        if (s.get("lastUsedDaysAgo") or 0) >= 30:
            line += f" (unused {s['lastUsedDaysAgo']} days)"
        bits.append(line)
    return "; ".join(bits)


class LiveConversation:
    """One Gemini Live conversation for a connected Mac.

    It opens on the first thing the user says or types (not on connect, so an idle app costs
    nothing) and reopens when Gemini ends it, which it does after about ten minutes of audio.
    Tasks outlive it: they belong to the connection.
    """

    def __init__(self, conn: Connection, session: Session) -> None:
        self.conn = conn
        self.session = session
        self.queue: LiveRequestQueue | None = None
        self._heard = ""  # the user's words in this turn, from partial transcriptions
        self._garbled = False  # this turn's agent transcript turned into markup
        self.task: asyncio.Task[None] | None = None

    def ensure(self) -> LiveRequestQueue:
        if self.queue is None or self.task is None or self.task.done():
            self.queue = LiveRequestQueue()
            self.task = asyncio.create_task(self._pump(self.queue))
        return self.queue

    def say_note(self, text: str) -> None:
        """A background update for the talker to relay (see tasks.py)."""
        self.ensure().send_content(types.Content(role="user", parts=[types.Part(text=text)]))

    async def _pump(self, queue: LiveRequestQueue) -> None:
        try:
            async for event in _runner.run_live(
                user_id=self.session.user_id,
                session_id=self.session.id,
                live_request_queue=queue,
                run_config=live_run_config(),
            ):
                await self._forward(event)
        except asyncio.CancelledError:
            raise
        except Exception as err:  # Gemini closed the stream or refused the request
            print(f"plex: live session ended: {type(err).__name__}: {err}", flush=True)
            await self.conn.bridge.send_json({"type": "error", "message": f"{type(err).__name__}: {err}"[:300]})
        finally:
            queue.close()

    async def _forward(self, event: Event) -> None:
        bridge = self.conn.bridge
        for part in (event.content.parts if event.content and event.content.parts else []):
            blob = part.inline_data
            if blob and blob.data and (blob.mime_type or "").startswith("audio/"):
                await bridge.send_audio(blob.data)
        for role, tx in (("user", event.input_transcription), ("agent", event.output_transcription)):
            if tx and tx.text and role == "agent" and (self._garbled or _looks_like_markup(tx.text)):
                # The Live model now and then transcribes a burst of unrelated HTML; the notch never shows
                # it, nor the rest of that turn.
                self._garbled = True
                continue
            if tx and tx.text:
                await bridge.send_json({"type": "transcript", "role": role, "text": tx.text, "partial": bool(event.partial)})
                if role == "user":
                    self._heard += tx.text if event.partial else ""
                    if not event.partial or tx.finished:
                        self.conn.hear(tx.text if not event.partial else self._heard)
                        self._heard = ""
        if event.interrupted or event.turn_complete:
            self._garbled = False
        if event.interrupted:
            await bridge.send_json({"type": "interrupted"})
        if event.turn_complete:
            await bridge.send_json({"type": "turn_complete"})

    def close(self) -> None:
        if self.queue:
            self.queue.close()
        if self.task and not self.task.done():
            self.task.cancel()
        self.queue = self.task = None


def _looks_like_markup(text: str) -> bool:
    t = text.strip()
    return t.count("<") >= 2 and any(tag in t for tag in ("</", "<td", "<tr", "<div", "<li", "<p>", "<table", "<!--"))


async def _refresh(conn: Connection) -> None:
    """agent:snapshot and memory:core for the talker's instruction (each at most a few seconds)."""
    async def snap() -> None:
        try:
            conn.snapshot = await asyncio.wait_for(money.snapshot(), 6)
        except Exception as err:
            print(f"plex: agent:snapshot failed: {type(err).__name__}: {str(err)[:160]}", flush=True)

    async def core() -> None:
        try:
            conn.core_memories = await asyncio.wait_for(memory.core(), 6)
        except Exception as err:
            print(f"plex: memory:core failed: {type(err).__name__}: {str(err)[:160]}", flush=True)

    await asyncio.gather(snap(), core())


async def _new_session(conn: Connection) -> Session:
    return await _sessions.create_session(
        app_name=APP_NAME,
        user_id=conn.user_id,
        state={
            "name": conn.name or conn.snapshot.get("name") or "",
            "now": now_text(conn.timezone),
            "money": money_line(conn.snapshot),
            "subscriptions": _subscriptions_line(conn.snapshot),
            "memories": memory.core_lines(conn.core_memories),
        },
    )


async def _hello(ws: WebSocket, conn: Connection) -> list[dict[str, Any]]:
    """The app's first frame says who it is; anything else that arrives first is kept for later."""
    early: list[dict[str, Any]] = []
    try:
        frame = await asyncio.wait_for(ws.receive(), HELLO_WAIT_S)
    except TimeoutError:
        return early
    if frame["type"] == "websocket.disconnect":
        raise WebSocketDisconnect()
    msg = json.loads(frame.get("text") or "{}") if frame.get("text") else {}
    if msg.get("type") == "hello":
        conn.user_id = str(msg.get("user_id") or "anonymous")[:64]
        conn.timezone = msg.get("timezone")
        conn.name = str(msg.get("name") or "")[:80]
        if os.environ.get("MAC_DEBUG"):
            print(f"plex: hello from {conn.user_id} ({conn.name}, {conn.timezone})", flush=True)
    elif msg:
        early.append(msg)
    return early


async def _answer_ask(conn: Connection, msg: dict[str, Any]) -> None:
    """An ask answered in the notch: the task waiting on it, or straight to Convex (a routine's ask)."""
    ask_id = str(msg.get("ask_id") or "")
    if not ask_id:
        return
    approved = msg.get("approved")
    approved = None if approved is None else bool(approved)
    text = str(msg.get("text") or "")
    always = bool(msg.get("always"))
    from .connection import cloud, macs

    for c in [*macs(), cloud()]:
        task = c.tasks.find_by_ask(ask_id) if c.tasks else None
        if task is not None and c.tasks and c.tasks.answer(task, text, approved, always, by="notch"):
            return
    try:
        await convex.public_mutation("asks:answer", askId=ask_id, approved=approved, always=always or None,
                                     text=text or None, by="notch")
    except convex.ConvexError as err:
        await conn.bridge.send_json({"type": "error", "message": f"Couldn't answer that: {str(err)[:200]}"})
    await conn.bridge.send_json({"type": "asks_changed"})


@router.websocket("/live")
async def live(ws: WebSocket) -> None:
    if not _token_ok(ws.headers.get("authorization")):
        await ws.close(code=4401)
        return
    await ws.accept()
    conn = Connection(bridge=MacBridge(ws))
    conn.tasks = TaskManager(conn)
    convo: LiveConversation | None = None
    session: Session | None = None
    try:
        early = await _hello(ws, conn)
        await _refresh(conn)
        session = await _new_session(conn)
        register_talker(session.id, conn)
        add_mac(conn)
        scheduler.poke()  # catch up on runs that waited for a Mac
        convo = LiveConversation(conn, session)
        conn.notify_talker = lambda text: convo.say_note(text) if convo else None
        await conn.bridge.send_json({"type": "ready", "model": LIVE_MODEL})

        async def fresh_conversation() -> None:
            nonlocal convo, session
            assert convo and session
            convo.close()
            unregister_talker(session.id)
            await _refresh(conn)
            session = await _new_session(conn)
            register_talker(session.id, conn)
            convo = LiveConversation(conn, session)

        async def handle(msg: dict[str, Any]) -> None:
            assert convo and session and conn.tasks
            kind = msg.get("type")
            if os.environ.get("MAC_DEBUG") and kind not in ("tool_result",):
                print(f"plex: from the Mac: {kind}", flush=True)
            if kind in ("text", "talk_start", "talk_end", "task_reply", "task_confirm", "task_continue", "ask_answer"):
                conn.last_input_at = time.monotonic()
            if kind == "text" and (msg.get("text") or "").strip():
                conn.hear(str(msg["text"]))
                convo.ensure().send_content(types.Content(role="user", parts=[types.Part(text=msg["text"])]))
            elif kind == "talk_start":
                convo.ensure().send_activity_start()
            elif kind == "talk_end":
                if convo.queue:
                    convo.queue.send_activity_end()
            elif kind == "tool_result":
                conn.bridge.resolve(msg.get("id", ""), msg.get("result"), msg.get("error"))
            elif kind in ("task_reply", "task_confirm", "task_cancel", "task_continue"):
                task = conn.tasks.find(str(msg.get("id") or ""))
                if task is None:
                    return
                if kind == "task_cancel":
                    conn.tasks.cancel(task)
                elif kind == "task_confirm":
                    conn.tasks.answer(task, approved=bool(msg.get("approved")), always=bool(msg.get("always")), by="notch")
                elif kind == "task_continue":
                    conn.tasks.answer(task, "done", approved=True, by="notch")
                else:
                    conn.tasks.answer(task, str(msg.get("text") or ""), by="notch")
            elif kind == "ask_answer":
                background(_answer_ask(conn, msg))
            elif kind == "wake":
                scheduler.poke()
            elif kind == "folder_event" and (msg.get("path") or msg.get("file")):
                background(scheduler.on_folder_event(str(msg.get("path") or ""), str(msg.get("file") or "")))
            elif kind == "reset":
                await fresh_conversation()

        for msg in early:
            await handle(msg)
        while True:
            frame = await ws.receive()
            if frame["type"] == "websocket.disconnect":
                break
            if frame.get("bytes") is not None:
                convo.ensure().send_realtime(types.Blob(data=frame["bytes"], mime_type=MIC_MIME))
                continue
            try:
                msg = json.loads(frame.get("text") or "{}")
            except json.JSONDecodeError:
                continue
            await handle(msg)
    except WebSocketDisconnect:
        pass
    finally:
        remove_mac(conn)
        if convo:
            convo.close()
        if conn.tasks:
            conn.tasks.cancel_all()
        if session:
            unregister_talker(session.id)
        conn.bridge.cancel_all()

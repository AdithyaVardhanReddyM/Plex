"""A stand-in for the Mac app, for testing the brain from the terminal.

    uv run python scripts/fake_mac.py --say "What bills are due this week?"
    uv run python scripts/fake_mac.py --say "Pay the Pacific Power bill" --approve yes --answer-via notch
    uv run python scripts/fake_mac.py --say "Open TextEdit and type 'Plex test' in a new document, then close it without saving"

It connects to /mac/live like apps/mac does: sends `hello`, then each --say as a `text` frame
(waiting for the brain to go idle in between), answers `tool_call`s with plausible stubs, and
runs `cli` calls for real (agent-desktop / agent-browser, via subprocess) so the operator path is
exercised end to end. It answers pauses on its own:

- needs_confirmation (a yes/no or a money approval): --approve yes|no|always, sent --answer-via
  notch (task_confirm), voice (a text frame "Yes, allow it") or window (asks:answer over Convex HTTP,
  which exercises the brain's polling).
- needs_input: --reply TEXT (task_reply, or by voice / window like above).
- needs_takeover: task_continue after --takeover-wait seconds.

It prints the talker's words, task cards (status, steps, approval, receipt, routine), receipts
and asks_changed, and exits when the brain has been idle for --idle seconds after the last --say.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any

import httpx
import websockets
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(HERE, ".env"))

CONVEX_URL = os.environ.get("CONVEX_URL", "http://127.0.0.1:3210").rstrip("/")
T0 = time.monotonic()


def log(kind: str, text: str) -> None:
    print(f"[{time.monotonic() - T0:6.1f}s] {kind:<10} {text}", flush=True)


def run_cli(args: dict[str, Any]) -> dict[str, Any]:
    binary = args.get("bin")
    if binary not in ("agent-desktop", "agent-browser"):
        return {"code": 126, "stdout": "", "stderr": f"{binary} is not allowed"}
    path = shutil.which(binary)
    if not path:
        return {"code": 127, "stdout": "", "stderr": f"{binary} not found"}
    timeout = max(1.0, float(args.get("timeout_ms") or 20000) / 1000)
    started = time.monotonic()
    try:
        argv = [os.path.expanduser(str(a)) if str(a).startswith("~/") else str(a) for a in args.get("args") or []]
        if binary == "agent-browser" and argv[:1] == ["pdf"] and len(argv) > 1:
            os.makedirs(os.path.dirname(argv[1]), exist_ok=True)
        proc = subprocess.run([path, *argv], capture_output=True, text=True, timeout=timeout)
        out = {"code": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr[-2000:]}
    except subprocess.TimeoutExpired:
        out = {"code": 124, "stdout": "", "stderr": f"timed out after {timeout:.0f}s"}
    log("cli", f"{binary} {' '.join(map(str, args.get('args') or []))[:110]} -> code {out['code']} ({time.monotonic() - started:.2f}s)")
    return out


def screenshot() -> dict[str, Any]:
    fd, path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    try:
        subprocess.run(["screencapture", "-x", "-t", "jpg", path], check=True, timeout=10)
        subprocess.run(["sips", "-Z", "1280", path], capture_output=True, timeout=10)
        with open(path, "rb") as f:
            return {"image": base64.b64encode(f.read()).decode(), "mime": "image/jpeg", "url": ""}
    except Exception as err:
        return {"error": f"screenshot failed: {err}"}
    finally:
        os.unlink(path)


def read_file(path: str) -> dict[str, Any]:
    path = os.path.expanduser(path)
    if not os.path.exists(path):
        return {"error": f"No file at {path}"}
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    with open(path, "rb") as f:
        data = f.read()
    if mime.startswith("text/") or mime in ("application/json", "text/csv"):
        return {"text": data.decode(errors="replace")[:50000], "mime": mime}
    return {"image": base64.b64encode(data).decode(), "mime": mime}


def stub(name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == "cli":
        return run_cli(args)
    if name == "frontmost_app":
        return {"app": "Terminal", "windowTitle": "fake_mac.py"}
    if name == "screenshot":
        return screenshot()
    if name == "read_file":
        return read_file(str(args.get("path") or ""))
    if name == "app_usage":
        # Unknown on this stand-in: a made-up date would be written onto the user's subscriptions.
        return {"usage": [{"app": a, "running": False} for a in args.get("apps") or []]}
    if name in ("calendar_events", "reminders_list"):
        return {"events": [], "reminders": []}
    if name == "contacts_search":
        return {"contacts": []}
    return {"ok": True, "stub": True}


async def window_answer(ask_id: str, approved: bool | None, always: bool, text: str) -> None:
    args: dict[str, Any] = {"askId": ask_id, "by": "window"}
    if approved is not None:
        args["approved"] = approved
    if always:
        args["always"] = True
    if text:
        args["text"] = text
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{CONVEX_URL}/api/mutation", json={"path": "asks:answer", "args": args, "format": "json"})
        log("window", f"asks:answer {args} -> {res.json().get('status')}")


class FakeMac:
    def __init__(self, opts: argparse.Namespace) -> None:
        self.opts = opts
        self.ws: Any = None
        self.tasks: dict[str, dict[str, Any]] = {}
        self.answered: set[str] = set()
        self.last_event = time.monotonic()
        self.agent_line = ""
        self.turns = 0
        self.receipts: list[dict[str, Any]] = []

    async def send(self, msg: dict[str, Any]) -> None:
        await self.ws.send(json.dumps(msg))

    def busy(self) -> bool:
        return any(t.get("status") not in ("done", "failed", "cancelled") for t in self.tasks.values())

    async def pause_answer(self, task: dict[str, Any]) -> None:
        key = f"{task['id']}:{task['status']}:{task.get('ask_id') or len(task.get('steps') or [])}"
        if key in self.answered:
            return
        self.answered.add(key)
        await asyncio.sleep(self.opts.think)
        o = self.opts
        status = task["status"]
        via = o.answer_via
        if status == "needs_confirmation":
            approved = o.approve != "no"
            always = o.approve == "always"
            if via == "voice":
                await self.send({"type": "text", "text": "Yes, always allow it." if always else ("Yes, allow it." if approved else "No, don't.")})
            elif via == "window" and task.get("ask_id"):
                await window_answer(task["ask_id"], approved, always, "")
            else:
                await self.send({"type": "task_confirm", "id": task["id"], "approved": approved, "always": always})
            log("answered", f"{'approved' if approved else 'declined'}{' (always)' if always else ''} via {via}")
        elif status == "needs_input":
            if via == "voice":
                await self.send({"type": "text", "text": o.reply})
            elif via == "window" and task.get("ask_id"):
                await window_answer(task["ask_id"], None, False, o.reply)
            else:
                await self.send({"type": "task_reply", "id": task["id"], "text": o.reply})
            log("answered", f"{o.reply!r} via {via}")
        elif status == "needs_takeover":
            await asyncio.sleep(o.takeover_wait)
            await self.send({"type": "task_continue", "id": task["id"]})
            log("answered", "I've done it (task_continue)")

    async def on_frame(self, msg: dict[str, Any]) -> None:
        kind = msg.get("type")
        self.last_event = time.monotonic()
        if kind == "tool_call":
            name, args = msg.get("name"), msg.get("args") or {}
            if name != "cli":
                log("tool", f"{name} {json.dumps(args)[:100]}")
            result = await asyncio.to_thread(stub, name, args)
            await self.send({"type": "tool_result", "id": msg.get("id"), "result": result})
        elif kind == "transcript":
            if msg.get("role") == "agent":
                if msg.get("partial"):
                    self.agent_line += msg.get("text") or ""
                else:  # the finished transcript of the turn replaces the partials
                    self.agent_line = msg.get("text") or ""
        elif kind == "turn_complete":
            self.turns += 1
            if self.agent_line.strip():
                log("PLEX SAYS", self.agent_line.strip())
            self.agent_line = ""
        elif kind == "task":
            t = msg["task"]
            old = self.tasks.get(t["id"], {})
            self.tasks[t["id"]] = t
            if old.get("status") != t["status"]:
                extra = ""
                if t.get("routine"):
                    extra += f" routine={t['routine']}"
                if t.get("approval"):
                    extra += f" approval={t['approval']}"
                if t.get("takeover"):
                    extra += f" takeover={t['takeover']}"
                if t.get("question"):
                    extra += f" question={t['question']!r}"
                if t.get("confirm") and not t.get("approval"):
                    extra += f" confirm={t['confirm']}"
                if t.get("say"):
                    extra += f" say={t['say']!r}"
                if t.get("error"):
                    extra += f" error={t['error']!r}"
                log("task", f"{t['id']} {t['title']!r} -> {t['status']}{extra}")
            steps = t.get("steps") or []
            if steps and (old.get("steps") or [None])[-1] != steps[-1]:
                log("  step", steps[-1])
            if t.get("receipt") and not old.get("receipt"):
                log("  receipt", json.dumps(t["receipt"]))
            if t["status"] in ("needs_confirmation", "needs_input", "needs_takeover"):
                asyncio.create_task(self.pause_answer(t))
        elif kind == "receipt":
            self.receipts.append(msg["receipt"])
            log("RECEIPT", json.dumps(msg["receipt"]))
        elif kind in ("asks_changed", "ready", "operator", "error", "interrupted"):
            if kind == "error" or kind == "ready" or self.opts.verbose:
                log(kind, json.dumps({k: v for k, v in msg.items() if k != "type"})[:200])
        elif kind == "activity":
            if self.opts.verbose:
                log("activity", f"{msg.get('kind')}: {msg.get('label')} {msg.get('detail') or ''}")

    async def wait_idle(self, idle: float, timeout: float) -> None:
        started = time.monotonic()
        while time.monotonic() - started < timeout:
            await asyncio.sleep(0.5)
            if not self.busy() and time.monotonic() - self.last_event > idle:
                return
        log("timeout", f"still busy after {timeout:.0f}s")

    async def run(self) -> None:
        headers = {}
        if os.environ.get("MAC_CLIENT_TOKEN"):
            headers["Authorization"] = f"Bearer {os.environ['MAC_CLIENT_TOKEN']}"
        async with websockets.connect(self.opts.url, max_size=2**24, additional_headers=headers) as ws:
            self.ws = ws
            await self.send({"type": "hello", "user_id": self.opts.user, "timezone": self.opts.timezone, "name": self.opts.name})

            async def reader() -> None:
                async for raw in ws:
                    if isinstance(raw, bytes):
                        continue  # the talker's voice
                    await self.on_frame(json.loads(raw))

            read = asyncio.create_task(reader())
            await asyncio.sleep(1.5)
            for frame in self.opts.frame or []:
                await self.send(json.loads(frame))
                log("sent", frame)
            for text in self.opts.say or []:
                log("YOU SAY", text)
                await self.send({"type": "text", "text": text})
                self.last_event = time.monotonic()
                await asyncio.sleep(3)
                await self.wait_idle(self.opts.idle, self.opts.timeout)
            if not self.opts.say:
                await self.wait_idle(self.opts.idle, self.opts.timeout)
            read.cancel()
        log("summary", f"{len(self.tasks)} tasks, {len(self.receipts)} receipts, {self.turns} talker turns")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="ws://127.0.0.1:8790/mac/live")
    p.add_argument("--say", action="append", help="a text frame (repeat for a conversation)")
    p.add_argument("--frame", action="append", help="a raw JSON frame to send first, e.g. '{\"type\":\"wake\"}'")
    p.add_argument("--approve", choices=["yes", "no", "always"], default="yes")
    p.add_argument("--answer-via", choices=["notch", "voice", "window"], default="notch")
    p.add_argument("--reply", default="Use the Bills pot.")
    p.add_argument("--takeover-wait", type=float, default=3.0)
    p.add_argument("--think", type=float, default=1.5, help="seconds before answering a pause")
    p.add_argument("--idle", type=float, default=10.0)
    p.add_argument("--timeout", type=float, default=300.0)
    p.add_argument("--user", default="adi-test")
    p.add_argument("--name", default="Adi")
    p.add_argument("--timezone", default="America/Los_Angeles")
    p.add_argument("-v", "--verbose", action="store_true")
    asyncio.run(FakeMac(p.parse_args()).run())


if __name__ == "__main__":
    sys.exit(main())

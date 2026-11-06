"""The operator: computer use, accessibility first.

The worker hands it one job (`operate(job, surface)`). The operator is its own LLM loop
(gemini-3.8-flash with function tools, hedged onto a fallback model like the worker) over
two CLIs the Mac app runs for it:

- agent-desktop reads native apps through the macOS accessibility tree and acts on refs
  (`@<snapshot>:eN`): semantic and headless, text not pixels, fast and exact.
- agent-browser drives Plex's own Chrome profile over CDP (session "plex", a persistent
  profile, headed), so a site the user signed in to once stays signed in.

Each CLI call goes to the Mac as `tool_call {name: "cli", args: {bin, args, timeout_ms}}`
and comes back as {code, stdout, stderr}; stdout is one JSON envelope.

People come first: before anything irreversible the operator calls ask_permission; for
anything only the user knows, ask_user; for passwords, card numbers, CAPTCHAs and sign-ins it
calls hand_over(kind="login") and waits for "I've done it". It never quits an app that may
hold the user's unsaved work; a document it created itself it may close without saving.

When an app has no accessibility tree, look_at_screen (a screenshot and Gemini vision)
answers questions, and use_screen_control falls back to Slice's screenshot loop with Gemini
computer use (`operate_by_screen`).
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import time
from typing import Any, Callable

from google import genai
from google.adk.tools import ToolContext
from google.genai import types

from .connection import Connection, for_worker, report
from .tasks import Task

OPERATOR_MODEL = os.environ.get("PLEX_OPERATOR_MODEL", "gemini-3.8-flash")
OPERATOR_FALLBACK = os.environ.get("PLEX_OPERATOR_FALLBACK", "gemini-3.6-flash")
SCREEN_MODEL = os.environ.get("PLEX_SCREEN_MODEL", "gemini-3.8-flash")
SCREEN_FALLBACK = os.environ.get("PLEX_SCREEN_FALLBACK", "gemini-3.5-flash-lite")
BROWSER_PROFILE = os.path.expanduser(os.environ.get("PLEX_BROWSER_PROFILE", "~/Library/Application Support/Plex/browser"))
BROWSER_SESSION = "plex"
MAX_STEPS = 40
STEP_TIMEOUT_S = 25.0
HEDGE_S = 7.0
KEEP_SNAPSHOTS = 2
TREE_CHARS = 14000

SYSTEM = """\
You operate the user's Mac for Plex, their money and errands agent, through accessibility tools.
Native apps: desktop_* (agent-desktop). Web pages: browser_* (agent-browser, Plex's own Chrome
profile, where the user stays signed in). Elements have refs like @s8f3k2p9:e12; a ref is only
valid for the snapshot it came from, so after anything changes, snapshot again (or the region,
with root) before the next action.

How to work:
- Observe, act, verify. Snapshot the app (or the page), act on one ref, then check the result
  with a fresh snapshot. Use desktop_find when you know the role or name.
- Prefer keyboard shortcuts for menus (cmd+n new, cmd+w close, cmd+s save) with desktop_press,
  always with app set. Document apps (TextEdit, Pages, Numbers, Preview) often open on an Open
  dialog: press cmd+n for a new document instead of using the dialog.
- After closing a document, check for a save sheet (desktop_snapshot with surface "sheet"); if
  there's no window left, it's closed.
- A result whose disposition says retry "unsafe" may already have landed: snapshot and check
  before repeating it.
- If an app has no accessibility tree (a canvas, a game, a remote desktop), use look_at_screen
  to understand it, or use_screen_control for the whole job.

People first:
- Payments are never yours. When a page asks for payment (a Pay button, a card form, "send
  $65 by PayPal to …"), stop there, don't click it, and report the amount, who gets paid (their
  PayPal email if the page shows one) and the order, booking or citation number. Plex pays
  through its own money tools, under the user's rules; then it may send you back to finish.
- If the job says the payment is already done (it names a receipt or a reference), finish the
  page without asking again: it already had the user's OK.
- Before anything else that can't be undone (submit, send, post, delete, cancel a plan),
  ask_permission with one short question, and wait.
- Something only the user knows (which account, which date): ask_user.
- Never type a password, a card number or a one-time code, and never solve a CAPTCHA. For a
  sign-in, a CAPTCHA or a payment form: hand_over(kind="login" or "takeover") with exactly what
  to do, then carry on when they're done.
- Never quit or force-quit an app that may hold the user's unsaved work, and never close their
  windows. A document you created yourself in this job you may close without saving ("Delete" or
  "Don't Save" in the sheet).
- Stay on the job: no developer tools, settings or unrelated apps.

When the job is done or you're blocked, answer in one or two plain sentences: what you did and
what you saw (amounts, dates, confirmation numbers, the PayPal email and reference to pay),
and anything left for the user. If you saved a PDF, give its path.
"""

_genai: genai.Client | None = None


def _client() -> genai.Client:
    global _genai
    if _genai is None:
        _genai = genai.Client(location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"))
    return _genai


# --- the CLI over the Mac ------------------------------------------------------------------------


def _envelope(stdout: str) -> dict[str, Any] | None:
    text = (stdout or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for line in reversed(text.splitlines()):  # the last JSON line
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    return None


async def cli(conn: Connection, bin: str, args: list[str], timeout_ms: int = 20000) -> dict[str, Any]:
    """Run agent-desktop or agent-browser on the Mac; returns the parsed JSON envelope (or the text)."""
    res = await conn.bridge.call("cli", {"bin": bin, "args": args, "timeout_ms": timeout_ms}, timeout=timeout_ms / 1000 + 8)
    if res.get("error"):
        return {"ok": False, "error": {"message": str(res["error"])[:400]}}
    env = _envelope(str(res.get("stdout") or ""))
    if env is None:
        out = {"ok": res.get("code") == 0, "stdout": str(res.get("stdout") or "")[:3000]}
        if res.get("stderr"):
            out["stderr"] = str(res["stderr"])[:1000]
        return out
    return env


def _tree_lines(node: dict[str, Any], depth: int = 0, out: list[str] | None = None) -> list[str]:
    """An accessibility tree as indented lines: role "name" = value [ref] (states)."""
    out = [] if out is None else out
    if not isinstance(node, dict):
        return out
    role = node.get("role") or ""
    bits = [role]
    name = node.get("name") or node.get("title") or node.get("label")
    if name:
        bits.append(json.dumps(str(name)[:80]))
    value = node.get("value")
    if value not in (None, "") and value != name:
        bits.append("= " + json.dumps(str(value)[:120]))
    ref = node.get("ref_id") or node.get("ref")
    if ref:
        bits.append(f"[{ref}]")
    states = node.get("states")
    if states:
        bits.append(f"({', '.join(map(str, states))})")
    if node.get("children_count") and not node.get("children"):
        bits.append(f"<{node['children_count']} children, drill with root>")
    if len(bits) > 1 or role not in ("group", "generic", ""):
        out.append("  " * depth + " ".join(bits))
        depth += 1
    for child in node.get("children") or []:
        _tree_lines(child, depth, out)
    return out


def _compact(env: dict[str, Any]) -> dict[str, Any]:
    """Keep what the model needs from an envelope; trees become lines."""
    if not isinstance(env, dict):
        return {"result": env}
    if "success" in env:  # agent-browser: {success, data, error}
        if not env.get("success"):
            return {"ok": False, "error": str(env.get("error") or "failed")[:400]}
        data = dict(env.get("data") or {})
        for k in ("lifecycle", "removedRefs", "refs"):
            data.pop(k, None)
        if isinstance(data.get("snapshot"), str):
            text = data.pop("snapshot")
            data["tree"] = text[:TREE_CHARS] + ("\n…(cut)" if len(text) > TREE_CHARS else "")
            data["refs"] = "Use refs as @eN (ref=e3 is @e3)."
        if isinstance(data.get("text"), str):
            data["text"] = data["text"][:TREE_CHARS]
        return {"ok": True, **data}
    if env.get("ok") is False or env.get("error"):
        err = env.get("error") or {}
        if isinstance(err, dict):
            keep = {k: err.get(k) for k in ("code", "message", "suggestion") if err.get(k)}
            disp = err.get("disposition") or {}
            if disp:
                keep["retry"] = disp.get("retry")
            details = err.get("details")
            if details:
                keep["details"] = json.dumps(details, default=str)[:400]
            return {"ok": False, "error": keep}
        return {"ok": False, "error": str(err)[:400]}
    data = env.get("data", env)
    if not isinstance(data, dict):
        return {"ok": True, "data": str(data)[:TREE_CHARS]}
    out: dict[str, Any] = {"ok": True}
    tree = data.get("tree")
    if tree is not None:
        text = "\n".join(_tree_lines(tree))
        out["tree"] = text[:TREE_CHARS] + ("\n…(cut; drill into a region with root)" if len(text) > TREE_CHARS else "")
        for k in ("app", "window", "snapshot_id", "complete", "surfaces"):
            if data.get(k) not in (None, "", []):
                out[k] = data[k]
        return out
    for k, v in data.items():
        if k in ("steps",):
            continue
        if k == "disposition" and isinstance(v, dict):
            out["delivery"] = v.get("delivery")
            out["retry"] = v.get("retry")
            continue
        out[k] = v
    text = json.dumps(out, default=str)
    if len(text) > TREE_CHARS:
        return {"ok": True, "data": text[:TREE_CHARS] + "…"}
    return out


def _browser_args(*args: str, launch: bool = False) -> list[str]:
    extra = ["--session", BROWSER_SESSION, "--json"]
    if launch:
        extra += ["--profile", BROWSER_PROFILE, "--headed"]
    return [*args, *extra]


# --- the operator loop ------------------------------------------------------------------------------


class Operator:
    """One job's worth of computer use. Its public async methods are the model's tools."""

    def __init__(self, conn: Connection, task: Task, surface: str = "auto") -> None:
        self.conn = conn
        self.task = task
        self.surface = surface
        self.timings: list[tuple[str, float]] = []
        self._browser_started = False
        self.saved: list[str] = []  # PDFs saved in this job, shown as file cards

    # helpers
    async def _desk(self, *args: str, timeout_ms: int = 15000, label: str = "") -> dict[str, Any]:
        started = time.monotonic()
        env = await cli(self.conn, "agent-desktop", list(args), timeout_ms)
        took = time.monotonic() - started
        self.timings.append((f"desktop {args[0]}", took))
        if label:
            await report(self.conn, self.task, "mac", label, None if env.get("ok", True) is not False else "didn't work")
        return _compact(env)

    async def _browse(self, *args: str, timeout_ms: int = 30000, label: str = "", launch: bool = False) -> dict[str, Any]:
        started = time.monotonic()
        env = await cli(self.conn, "agent-browser", _browser_args(*args, launch=launch or not self._browser_started), timeout_ms)
        self._browser_started = True
        self.timings.append((f"browser {args[0]}", time.monotonic() - started))
        if label:
            await report(self.conn, self.task, "web", label, None if env.get("ok", True) is not False else "didn't work")
        return _compact(env)

    # --- desktop ---
    async def desktop_apps(self) -> dict[str, Any]:
        """The apps running on the Mac (name, pid, foreground or background)."""
        return await self._desk("list-apps")

    async def _windows(self, app: str) -> list[dict[str, Any]]:
        env = await cli(self.conn, "agent-desktop", ["list-windows", "--app", app], 8000)
        data = env.get("data") if isinstance(env, dict) else None
        rows = data if isinstance(data, list) else (data or {}).get("windows") or []
        return [{"id": w.get("id"), "title": w.get("title"), "focused": w.get("is_focused")} for w in rows if isinstance(w, dict)]

    async def _one_window(self, app: str, args: list[str], timeout_ms: int = 12000) -> dict[str, Any]:
        """Run a command scoped to an app; when several windows match, pick the focused (or the
        frontmost non-dialog) window and say which, with the others listed."""
        out = await self._desk(*args, timeout_ms=timeout_ms)
        err = out.get("error") if isinstance(out.get("error"), dict) else {}
        if out.get("ok") is False and err.get("code") == "AMBIGUOUS_TARGET" and app and "--window-id" not in args:
            windows = await self._windows(app)
            pick = next((w for w in windows if w["focused"]), None) or next(
                (w for w in windows if (w["title"] or "") not in ("Open", "")), None) or (windows[0] if windows else None)
            if pick and pick.get("id"):
                out = await self._desk(*args, "--window-id", str(pick["id"]), timeout_ms=timeout_ms)
                out["window_picked"] = pick
                out["windows"] = windows
        return out

    async def desktop_snapshot(self, app: str = "", root: str = "", surface: str = "", window_id: str = "") -> dict[str, Any]:
        """The accessibility tree of an app's window: interactive elements with their refs.

        Args:
            app: The app's name ("TextEdit"). Empty with root set.
            root: A ref from an earlier snapshot, to drill into one region (then app is ignored).
            surface: Instead of the window: sheet, alert, menu, popover or menubar (an open dialog).
            window_id: A window's id (w-…) when the app has several windows (windows are listed when it's ambiguous).
        """
        if root:
            return await self._desk("snapshot", "--root", root, "-i", "--compact", timeout_ms=12000)
        args = ["snapshot", "-i", "--compact"]
        if app:
            args += ["--app", app]
        if surface:
            args += ["--surface", surface]
        if window_id:
            args += ["--window-id", window_id]
        out = await self._one_window(app, args)
        if out.get("ok") and len(out.get("tree") or "") >= TREE_CHARS and not surface:
            # A big app: a shallow map first, then drill.
            out = await self._desk("snapshot", "--skeleton", "-i", "--compact", *(["--app", app] if app else []), timeout_ms=12000)
            out["note"] = "Big window: this is a skeleton. Drill into a region with desktop_snapshot(root=ref)."
        return out

    async def desktop_find(self, app: str, query: str) -> dict[str, Any]:
        """Find elements in an app whose name, value or text contains the query; returns refs.

        Args:
            app: The app's name.
            query: Words on the element ("Don't Save", "Amount").
        """
        return await self._one_window(app, ["find", "--app", app, "--text", query])

    async def desktop_click(self, ref: str) -> dict[str, Any]:
        """Press a button, link, menu item or row by its ref.

        Args:
            ref: The element's ref (@s…:eN).
        """
        return await self._desk("click", ref, label="Clicked on screen")

    async def desktop_type(self, ref: str, text: str) -> dict[str, Any]:
        """Type text into a text field or document by its ref (inserted at the cursor).

        Args:
            ref: The text element's ref.
            text: The text.
        """
        out = await self._desk("type", ref, text, timeout_ms=10000 + 40 * len(text), label="Typed on screen")
        code = (out.get("error") or {}).get("code") if isinstance(out.get("error"), dict) else None
        if out.get("ok") is False and code in ("POLICY_DENIED", "ACTION_NOT_SUPPORTED", "PLATFORM_NOT_SUPPORTED"):
            # No headless typing for this element: set its value instead (replaces the content).
            out = await self._desk("set-value", ref, text)
            out["note"] = "Typing wasn't possible headless, so the value was set directly."
        return out

    async def desktop_set_value(self, ref: str, value: str) -> dict[str, Any]:
        """Set a field's whole value at once (replaces what's there).

        Args:
            ref: The element's ref.
            value: The new value.
        """
        return await self._desk("set-value", ref, value, label="Filled in a field")

    async def desktop_press(self, keys: str, app: str = "") -> dict[str, Any]:
        """Press a key combo (return, escape, tab, cmd+n, cmd+w, shift+tab) in an app.

        Args:
            keys: The combo.
            app: The app that gets the keys; empty for the frontmost one.
        """
        args = ["press", keys]
        if app:
            args += ["--app", app]
        return await self._desk(*args, label=f"Pressed {keys}")

    async def desktop_launch(self, app: str) -> dict[str, Any]:
        """Open an app (or attach to it if it's running) and bring its window up.

        Args:
            app: The app's name ("TextEdit", "Numbers").
        """
        return await self._desk("launch", app, "--activate", "--timeout", "15000", timeout_ms=20000, label=f"Opened {app}")

    async def desktop_scroll(self, ref: str, direction: str = "down") -> dict[str, Any]:
        """Scroll a scroll area or list.

        Args:
            ref: The scroll area's ref.
            direction: up, down, left or right.
        """
        return await self._desk("scroll", ref, "--direction", direction)

    async def desktop_wait(self, ms: int = 1000) -> dict[str, Any]:
        """Wait a moment for an app to catch up (at most 10 s).

        Args:
            ms: Milliseconds.
        """
        await asyncio.sleep(min(max(int(ms), 0), 10000) / 1000)
        return {"ok": True}

    # --- browser ---
    async def browser_open(self, url: str) -> dict[str, Any]:
        """Open a web page in Plex's browser.

        Args:
            url: The full address.
        """
        return await self._browse("open", url, label=f"Opened {url[:60]}", launch=True, timeout_ms=45000)

    async def browser_snapshot(self) -> dict[str, Any]:
        """The page's accessibility tree (headings, text, links, fields) with refs (@eN)."""
        return await self._browse("snapshot", "-c")

    async def browser_click(self, ref: str) -> dict[str, Any]:
        """Click an element on the page.

        Args:
            ref: Its ref (@eN).
        """
        return await self._browse("click", ref, label="Clicked on the page")

    async def browser_fill(self, ref: str, text: str) -> dict[str, Any]:
        """Clear a field and fill it in.

        Args:
            ref: The field's ref.
            text: The text (never a password or card number).
        """
        return await self._browse("fill", ref, text, label="Filled in a field")

    async def browser_type(self, ref: str, text: str) -> dict[str, Any]:
        """Type into a field without clearing it.

        Args:
            ref: The field's ref.
            text: The text.
        """
        return await self._browse("type", ref, text)

    async def browser_press(self, key: str) -> dict[str, Any]:
        """Press a key on the page (Enter, Tab, Escape, Control+a).

        Args:
            key: The key.
        """
        return await self._browse("press", key)

    async def browser_get_text(self, ref: str = "") -> dict[str, Any]:
        """The text of an element, or of the whole page when ref is empty.

        Args:
            ref: An element's ref, or empty.
        """
        return await self._browse("get", "text", ref or "body")

    async def browser_wait(self, ms: int = 0, text: str = "") -> dict[str, Any]:
        """Wait for some text to appear on the page, or for a number of milliseconds.

        Args:
            ms: Milliseconds (at most 15000), when text is empty.
            text: Text to wait for.
        """
        if text:
            return await self._browse("wait", "--text", text, timeout_ms=20000)
        return await self._browse("wait", str(min(max(int(ms or 1000), 0), 15000)), timeout_ms=20000)

    async def browser_save_pdf(self, name: str) -> dict[str, Any]:
        """Save the page as it is now as a PDF in ~/Documents/Plex (a confirmation, a statement, a
        bill), to keep as proof. Returns its path.

        Args:
            name: A file name without the folder ("Parking citation 4417 paid").
        """
        safe = "".join(c for c in name if c.isalnum() or c in " -_.,()").strip()[:80] or "Plex page"
        path = f"~/Documents/Plex/{safe.removesuffix('.pdf')}.pdf"
        out = await self._browse("pdf", path, label="Saved the page as a PDF")
        if out.get("ok", True) is not False:
            out["path"] = path
            self.saved.append(path)
        return out

    async def browser_back(self) -> dict[str, Any]:
        """Go back a page."""
        return await self._browse("back")

    # --- people and fallback ---
    async def ask_permission(self, question: str) -> dict[str, Any]:
        """Ask the user yes or no before an irreversible step. Returns {approved}.

        Args:
            question: One short question ("Submit the payment of $84.20 to Comcast?").
        """
        assert self.conn.tasks
        return {"approved": await self.conn.tasks.confirm_action(self.task, question)}

    async def ask_user(self, question: str) -> dict[str, Any]:
        """Ask the user for something only they know. Returns {answer}.

        Args:
            question: One short question.
        """
        assert self.conn.tasks
        return {"answer": await self.conn.tasks.ask(self.task, question)}

    async def hand_over(self, title: str, detail: str = "", kind: str = "takeover") -> dict[str, Any]:
        """Hand the screen to the user and wait until they press I've done it: a sign-in, a CAPTCHA,
        a card or password field, anything they must do themselves. Returns {done}.

        Args:
            title: What they need to do, short ("Sign in to Comcast in the Plex browser").
            detail: One more line, if it helps.
            kind: login (a sign-in) or takeover (anything else).
        """
        assert self.conn.tasks
        done = await self.conn.tasks.takeover(self.task, title, detail, kind)
        return {"done": done, "next": "Snapshot again: the screen has changed." if done else "Stop and say what's left."}

    async def look_at_screen(self, question: str) -> dict[str, Any]:
        """Screenshot plus vision, for a UI with no accessibility tree. Returns {answer}.

        Args:
            question: What you need to know from the screen.
        """
        shot = await self.conn.bridge.call("screenshot", {"for": "operator"}, timeout=15)
        if shot.get("error") or not shot.get("image"):
            return {"error": shot.get("error") or "No screenshot (Plex needs Screen Recording permission)."}
        started = time.monotonic()
        res = await _client().aio.models.generate_content(
            model=OPERATOR_MODEL,
            contents=[types.Content(role="user", parts=[
                types.Part(text=f"This is the user's screen. {question} Answer briefly and concretely."),
                types.Part.from_bytes(data=base64.b64decode(shot["image"]), mime_type=shot.get("mime") or "image/jpeg"),
            ])],
        )
        self.timings.append(("look_at_screen", time.monotonic() - started))
        await report(self.conn, self.task, "mac", "Looked at your screen")
        return {"answer": (res.text or "").strip()}

    async def use_screen_control(self, job: str) -> dict[str, Any]:
        """Do the job with screenshots and mouse clicks instead (slower). Only when the accessibility
        tree is empty or useless for this app.

        Args:
            job: The whole job, with every detail.
        """
        return {"outcome": await operate_by_screen(self.conn, self.task, job)}

    def tools(self) -> dict[str, Callable[..., Any]]:
        names = ["ask_permission", "ask_user", "hand_over", "look_at_screen", "use_screen_control"]
        if self.surface in ("auto", "desktop"):
            names += ["desktop_apps", "desktop_snapshot", "desktop_find", "desktop_click", "desktop_type", "desktop_set_value",
                      "desktop_press", "desktop_launch", "desktop_scroll", "desktop_wait"]
        if self.surface in ("auto", "browser"):
            names += ["browser_open", "browser_snapshot", "browser_click", "browser_fill", "browser_type", "browser_press",
                      "browser_get_text", "browser_wait", "browser_back", "browser_save_pdf"]
        return {n: getattr(self, n) for n in names}


_DECLS: dict[str, types.FunctionDeclaration] = {}


def _declarations(tools: dict[str, Callable[..., Any]]) -> list[types.FunctionDeclaration]:
    out = []
    for name, fn in tools.items():
        if name not in _DECLS:
            _DECLS[name] = types.FunctionDeclaration.from_callable_with_api_option(callable=fn, api_option="VERTEX_AI")
            _DECLS[name].response = None
        out.append(_DECLS[name])
    return out


async def _hedged(model: str, fallback: str, contents: list[types.Content], config: types.GenerateContentConfig) -> types.GenerateContentResponse:
    """The primary model; after HEDGE_S (or a 429) the fallback too; the first answer wins."""
    def start(name: str) -> asyncio.Task[types.GenerateContentResponse]:
        return asyncio.create_task(_client().aio.models.generate_content(model=name, contents=contents, config=config))

    running = {start(model): model}
    failed: Exception | None = None
    try:
        done, _ = await asyncio.wait(running, timeout=HEDGE_S)
        if not done and fallback:
            print(f"plex: {model} hasn't answered in {HEDGE_S:.0f}s, operator step on {fallback} too", flush=True)
            running[start(fallback)] = fallback
        deadline = asyncio.get_running_loop().time() + STEP_TIMEOUT_S
        while running:
            done, _ = await asyncio.wait(running, timeout=max(0.1, deadline - asyncio.get_running_loop().time()),
                                         return_when=asyncio.FIRST_COMPLETED)
            if not done:
                raise failed or TimeoutError("the operator model didn't answer in time")
            for t in done:
                name = running.pop(t)
                try:
                    return t.result()
                except Exception as err:
                    failed = err
                    if "RESOURCE_EXHAUSTED" not in str(err) and "429" not in str(err):
                        raise
                    print(f"plex: {name} is rate-limited", flush=True)
                    if name == model and fallback and fallback not in running.values():
                        running[start(fallback)] = fallback
        raise failed or TimeoutError("the operator model didn't answer")
    finally:
        for t in running:
            t.cancel()


_SNAPSHOT_TOOLS = {"desktop_snapshot", "desktop_find", "browser_snapshot", "browser_get_text"}


def _prune(contents: list[types.Content]) -> None:
    """Old accessibility trees are stale anyway: keep only the newest KEEP_SNAPSHOTS."""
    seen = 0
    for content in reversed(contents):
        for part in content.parts or []:
            fr = part.function_response
            if fr is not None and fr.name in _SNAPSHOT_TOOLS and isinstance(fr.response, dict) and "tree" in fr.response:
                seen += 1
                if seen > KEEP_SNAPSHOTS:
                    fr.response = {"ok": True, "tree": "(older snapshot removed; refs from it are stale)"}


async def operate(conn: Connection, task: Task, job: str, surface: str = "auto", max_steps: int = MAX_STEPS) -> dict[str, Any]:
    """Run one job; returns {"outcome", "steps", "timings"}."""
    op = Operator(conn, task, surface if surface in ("auto", "desktop", "browser") else "auto")
    tools = op.tools()
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM,
        tools=[types.Tool(function_declarations=_declarations(tools))],
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW),
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    where = {"desktop": " Use the desktop tools.", "browser": " Use the browser tools."}.get(op.surface, "")
    contents: list[types.Content] = [types.Content(role="user", parts=[types.Part(text=job + where)])]
    await conn.bridge.send_json({"type": "operator", "active": True, "task_id": task.id})
    task.on_screen = True
    started = time.monotonic()
    outcome = ""
    steps = 0
    try:
        for steps in range(1, max_steps + 1):
            t0 = time.monotonic()
            res = await _hedged(OPERATOR_MODEL, OPERATOR_FALLBACK, contents, config)
            op.timings.append(("model", time.monotonic() - t0))
            reply = res.candidates[0].content if res.candidates else None
            if reply is None or not reply.parts:
                outcome = "The operator model returned nothing."
                break
            contents.append(reply)
            calls = [p.function_call for p in reply.parts if p.function_call]
            if not calls:
                outcome = "".join(p.text or "" for p in reply.parts if not p.thought).strip() or "Done."
                break
            parts = []
            for call in calls:
                fn = tools.get(call.name or "")
                if fn is None:
                    result: dict[str, Any] = {"error": f"No tool {call.name}"}
                else:
                    try:
                        result = await fn(**dict(call.args or {}))
                    except asyncio.CancelledError:
                        raise
                    except TypeError as err:
                        result = {"error": f"Bad arguments: {err}"}
                    except Exception as err:
                        result = {"error": f"{type(err).__name__}: {str(err)[:300]}"}
                if os.environ.get("MAC_DEBUG"):
                    print(f"plex: operator {call.name}({json.dumps(dict(call.args or {}), default=str)[:120]}) -> "
                          f"{json.dumps(result, default=str)[:160]}", flush=True)
                parts.append(types.Part(function_response=types.FunctionResponse(id=call.id, name=call.name, response=result)))
            contents.append(types.Content(role="user", parts=parts))
            _prune(contents)
        else:
            outcome = f"I stopped after {max_steps} steps without finishing."
    finally:
        task.on_screen = False
        await conn.bridge.send_json({"type": "operator", "active": False, "task_id": task.id})
    total = time.monotonic() - started
    model_s = sum(t for k, t in op.timings if k == "model")
    cli_s = sum(t for k, t in op.timings if k.startswith(("desktop", "browser")))
    timing = {"total_s": round(total, 1), "model_s": round(model_s, 1), "cli_s": round(cli_s, 1), "turns": steps,
              "cli_calls": sum(1 for k, _ in op.timings if k.startswith(("desktop", "browser")))}
    print(f"plex: operator job done in {timing['total_s']}s ({timing['turns']} turns, model {timing['model_s']}s, "
          f"{timing['cli_calls']} CLI calls {timing['cli_s']}s)", flush=True)
    for path in op.saved:
        name = path.rsplit("/", 1)[-1]
        conn.tasks and conn.tasks.show_view(task, {"type": "file", "key": path, "title": name, "path": path,
                                                   "detail": "Saved in Documents › Plex"})
    out: dict[str, Any] = {"outcome": outcome, "timing": timing}
    if op.saved:
        out["saved"] = op.saved
    return out


async def operate_tool(job: str, tool_context: ToolContext, surface: str = "auto") -> dict[str, Any]:
    """Do something in an app or on a website for the user, through the Mac's accessibility tree
    (native apps) or Plex's browser (websites, where they stay signed in): download a statement,
    check a bill on the biller's site, fill a form, enter numbers in Numbers. It asks before
    anything irreversible and hands over for sign-ins. Use it only when no money or account tool
    can do it; never to pay (payments go through pay / pay_bill).

    Args:
        job: One clear job with every detail ("In the Plex browser, open comcast.com, sign in if
            needed, and read the amount and due date of the latest bill").
        surface: auto, desktop (a native app) or browser (a website).
    """
    conn, task = for_worker(tool_context)
    await report(conn, task, "mac", "Working on your screen", job[:80])
    return await operate(conn, task, job, surface)


operate_tool.__name__ = "operate"


# --- the screenshot fallback (Slice's computer.py) ---------------------------------------------------

_SCREEN_SYSTEM = """\
You operate the user's Mac for them by looking at screenshots and using the
mouse and keyboard (macOS: cmd is the command key). Work step by step and
check each screenshot before the next action.

Rules:
- Before anything that can't be undone (pay, book, send, post, submit,
  delete), call ask_permission with one short question and wait.
- If you need something only the user knows, call ask_user.
- Never solve a CAPTCHA, never type a password or card number. If a login,
  CAPTCHA or payment form blocks you, stop and say so.
- Stay on the job: never open developer tools, settings or other apps.
- When the job is done or you're blocked, answer in one or two plain
  sentences: what you did, and anything left for the user.
"""

_SCREEN_CUSTOM = [
    types.FunctionDeclaration(
        name="ask_permission",
        description="Ask the user a yes-or-no question before an irreversible step. Returns {approved}.",
        parameters=types.Schema(type="OBJECT", properties={"question": types.Schema(type="STRING")}, required=["question"]),
    ),
    types.FunctionDeclaration(
        name="ask_user",
        description="Ask the user for something only they know. Returns {answer}.",
        parameters=types.Schema(type="OBJECT", properties={"question": types.Schema(type="STRING")}, required=["question"]),
    ),
]
KEEP_SCREENSHOTS = 3


async def _screenshot(conn: Connection) -> tuple[bytes, str, str] | None:
    """(image, mime type, front browser page address or "")."""
    shot = await conn.bridge.call("screenshot", {"for": "operator"}, timeout=15)
    if shot.get("error") or not shot.get("image"):
        return None
    return base64.b64decode(shot["image"]), shot.get("mime") or "image/jpeg", str(shot.get("url") or "")


def _prune_shots(contents: list[types.Content]) -> None:
    seen = 0
    for content in reversed(contents):
        for part in content.parts or []:
            if part.inline_data is not None:
                seen += 1
                if seen > KEEP_SCREENSHOTS:
                    part.inline_data = None
                    part.text = "(older screenshot removed)"
            fr = part.function_response
            if fr is not None and fr.parts:
                seen += 1
                if seen > KEEP_SCREENSHOTS:
                    fr.parts = None


async def operate_by_screen(conn: Connection, task: Task, job: str, max_steps: int = MAX_STEPS) -> str:
    """Gemini computer use over screenshots: the fallback for UIs without an accessibility tree.
    Coordinates are 0-999; the Mac's `computer` tool scales them. Every action result carries the
    front page's `url` (Gemini rejects results without it when custom functions sit beside it)."""
    assert conn.tasks
    shot = await _screenshot(conn)
    if shot is None:
        return "I can't see the screen. Plex needs Screen Recording permission."
    config = types.GenerateContentConfig(
        system_instruction=_SCREEN_SYSTEM,
        tools=[types.Tool(computer_use=types.ComputerUse(environment="ENVIRONMENT_DESKTOP")),
               types.Tool(function_declarations=_SCREEN_CUSTOM)],
    )
    contents: list[types.Content] = [
        types.Content(role="user", parts=[types.Part(text=job), types.Part.from_bytes(data=shot[0], mime_type=shot[1])])
    ]
    state = {"step": 0, "approved_at": -10}
    for step in range(max_steps):
        state["step"] = step
        res = await _hedged(SCREEN_MODEL, SCREEN_FALLBACK, contents, config)
        reply = res.candidates[0].content if res.candidates else None
        if reply is None:
            return "The computer-use model returned nothing."
        contents.append(reply)
        calls = [p.function_call for p in reply.parts or [] if p.function_call]
        if not calls:
            return "".join(p.text or "" for p in reply.parts or [] if not p.thought).strip() or "Done."
        results: list[tuple[types.FunctionCall, dict[str, Any]]] = []
        for call in calls:
            outcome = await _screen_act(conn, task, call, state)
            if outcome is None:
                return "Stopped: you said no."
            results.append((call, outcome))
        shot = await _screenshot(conn)
        parts = []
        for i, (call, outcome) in enumerate(results):
            outcome.setdefault("url", shot[2] if shot else "")
            image = None
            if shot is not None and i == len(results) - 1:
                image = [types.FunctionResponsePart(inline_data=types.FunctionResponseBlob(mime_type=shot[1], data=shot[0]))]
            parts.append(types.Part(function_response=types.FunctionResponse(id=call.id, name=call.name, response=outcome, parts=image)))
        contents.append(types.Content(role="user", parts=parts))
        _prune_shots(contents)
    return f"I stopped after {max_steps} steps without finishing."


async def _screen_act(conn: Connection, task: Task, call: types.FunctionCall, state: dict[str, int]) -> dict[str, Any] | None:
    """Run one action. None means the user said no to it."""
    assert conn.tasks
    args = dict(call.args or {})
    safety = args.pop("safety_decision", None)
    intent = str(args.pop("intent", "") or "")
    acknowledged = False
    if isinstance(safety, dict) and safety.get("decision") == "require_confirmation":
        if state["step"] - state["approved_at"] > 1:
            question = f"Okay to {intent[0].lower() + intent[1:]}?" if intent else "Okay to take the next step on screen?"
            if not await conn.tasks.confirm_action(task, question, str(safety.get("explanation") or "")):
                return None
            state["approved_at"] = state["step"]
        acknowledged = True
    name = call.name or ""
    if name == "ask_permission":
        approved = await conn.tasks.confirm_action(task, str(args.get("question") or "Go ahead?"))
        if approved:
            state["approved_at"] = state["step"]
        outcome: dict[str, Any] = {"approved": approved}
    elif name == "ask_user":
        outcome = {"answer": await conn.tasks.ask(task, str(args.get("question") or ""))}
    elif name == "take_screenshot":
        outcome = {"ok": True}
    elif name == "wait":
        await asyncio.sleep(min(int(args.get("seconds") or 1), 5))
        outcome = {"ok": True}
    else:
        outcome = await conn.bridge.call("computer", {"action": name, "intent": intent, **args}, timeout=15)
        await report(conn, task, "mac", intent or name.replace("_", " ").capitalize())
        await asyncio.sleep(0.6)
    if acknowledged:
        outcome["safety_acknowledgement"] = True
    return outcome


TOOLS = [operate_tool]

"""The link to one connected Mac: tool calls out, tool results back.

Tools that need the Mac (what's on screen, the calendar, a CLI call) call
`conn.bridge.call(...)`, which sends a `tool_call` over the WebSocket and waits
for the app's `tool_result` with the same id. Routines that run in the cloud with no
Mac connected get a `NullBridge`: every Mac tool answers with an error, frames go nowhere.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from fastapi import WebSocket

# A tool the Mac doesn't answer in this long gets an error instead of hanging the turn.
CALL_TIMEOUT_S = 20.0


class MacBridge:
    def __init__(self, ws: WebSocket | None) -> None:
        self.ws = ws
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._send_lock = asyncio.Lock()
        self.closed = False

    @property
    def has_mac(self) -> bool:
        return not self.closed

    async def send_json(self, msg: dict[str, Any]) -> None:
        if self.closed or self.ws is None:
            return
        async with self._send_lock:
            try:
                await self.ws.send_json(msg)
            except Exception as err:  # the socket closed under us
                print(f"plex: send to the Mac failed: {type(err).__name__}", flush=True)

    async def send_audio(self, pcm: bytes) -> None:
        if self.closed or self.ws is None:
            return
        async with self._send_lock:
            try:
                await self.ws.send_bytes(pcm)
            except Exception:
                pass

    async def call(self, name: str, args: dict[str, Any] | None = None, timeout: float = CALL_TIMEOUT_S) -> dict[str, Any]:
        """Run a tool on the Mac and return its result (or {"error": ...})."""
        if self.closed:
            return {"error": "The Mac is not connected."}
        call_id = uuid.uuid4().hex[:12]
        future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[call_id] = future
        try:
            await self.send_json({"type": "tool_call", "id": call_id, "name": name, "args": args or {}})
            return await asyncio.wait_for(future, timeout)
        except TimeoutError:
            return {"error": f"The Mac did not answer {name} within {int(timeout)} s."}
        finally:
            self._pending.pop(call_id, None)

    def resolve(self, call_id: str, result: dict[str, Any] | None, error: str | None) -> None:
        future = self._pending.get(call_id)
        if future and not future.done():
            future.set_result({"error": error} if error else (result if isinstance(result, dict) else {"result": result}))

    async def activity(self, kind: str, label: str, detail: str | None = None, task_id: str | None = None) -> None:
        """A line for the island's activity list, e.g. kind="money", label="Checked the Food pot"."""
        await self.send_json({"type": "activity", "kind": kind, "label": label, "detail": detail, "task_id": task_id})

    def cancel_all(self) -> None:
        self.closed = True
        for future in self._pending.values():
            if not future.done():
                future.set_result({"error": "The Mac disconnected."})
        self._pending.clear()


class NullBridge(MacBridge):
    """No Mac: cloud routine runs."""

    def __init__(self) -> None:
        super().__init__(None)
        self.closed = True

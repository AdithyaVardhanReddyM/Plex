"""One connected Mac (or the cloud, for routines that run without one): who it is, what
the brain knows about them, and its tasks.

The talker's tools find it through the talker's ADK session id; the worker's
tools through the worker session of the task they run in. The scheduler finds the
connected Macs through `macs()`.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable

from google.adk.tools import ToolContext

from .bridge import MacBridge, NullBridge

if TYPE_CHECKING:
    from .tasks import Task, TaskManager


@dataclass
class Connection:
    bridge: MacBridge
    user_id: str = "anonymous"
    name: str = ""
    timezone: str | None = None
    tasks: "TaskManager | None" = None
    # Speaks to the user through the talker when no talker tool call is waiting.
    notify_talker: Callable[[str], None] | None = None
    # When the user last spoke or typed (monotonic), so a yes to a task is theirs, not the talker's.
    last_input_at: float = 0.0
    # agent:snapshot and memory:core, refreshed on hello and before each worker session.
    snapshot: dict[str, Any] = field(default_factory=dict)
    core_memories: list[dict[str, Any]] = field(default_factory=list)
    cloud: bool = False
    # What the user actually said or typed, newest last: (monotonic time, words). A task keeps
    # the words that started it, so a receipt's `why` is theirs, not the model's paraphrase.
    heard: list[tuple[float, str]] = field(default_factory=list)

    @property
    def has_mac(self) -> bool:
        return self.bridge.has_mac

    def hear(self, text: str) -> None:
        text = " ".join(text.split())
        if text and not text.startswith("[") and (not self.heard or self.heard[-1][1] != text):
            self.heard = [*self.heard[-19:], (time.monotonic(), text)]

    def last_said(self, within_s: float = 180.0) -> str | None:
        """The user's latest words, if they spoke or typed recently."""
        if self.heard and time.monotonic() - self.heard[-1][0] <= within_s:
            return self.heard[-1][1]
        return None


_by_talker_session: dict[str, Connection] = {}
_by_worker_session: dict[str, tuple[Connection, "Task"]] = {}
_macs: list[Connection] = []
_cloud: Connection | None = None


def register_talker(session_id: str, conn: Connection) -> None:
    _by_talker_session[session_id] = conn


def unregister_talker(session_id: str) -> None:
    _by_talker_session.pop(session_id, None)


def register_worker(session_id: str, conn: Connection, task: "Task") -> None:
    _by_worker_session[session_id] = (conn, task)


def unregister_worker(session_id: str) -> None:
    _by_worker_session.pop(session_id, None)


def add_mac(conn: Connection) -> None:
    if conn not in _macs:
        _macs.append(conn)


def remove_mac(conn: Connection) -> None:
    if conn in _macs:
        _macs.remove(conn)


def macs() -> list[Connection]:
    return [c for c in _macs if c.has_mac]


def mac() -> Connection | None:
    """The most recently connected Mac, if any."""
    live = macs()
    return live[-1] if live else None


def cloud() -> Connection:
    """The connection cloud routine runs use when no Mac is connected."""
    global _cloud
    if _cloud is None:
        from .tasks import TaskManager

        _cloud = Connection(bridge=NullBridge(), user_id="cloud", cloud=True)
        _cloud.tasks = TaskManager(_cloud)
    return _cloud


def for_talker(tool_context: ToolContext) -> Connection:
    conn = _by_talker_session.get(tool_context.session.id)
    if conn is None:
        raise RuntimeError("No Mac is connected to this session.")
    return conn


def for_worker(tool_context: ToolContext) -> tuple[Connection, "Task"]:
    found = _by_worker_session.get(tool_context.session.id)
    if found is None:
        raise RuntimeError("This tool only runs inside a task.")
    return found


async def report(conn: Connection, task: "Task | None", kind: str, label: str, detail: str | None = None,
                 step_kind: str = "tool") -> None:
    """One line for the island's activity list and, inside a task, its card (and its routine run)."""
    await conn.bridge.activity(kind, label, detail, task.id if task else None)
    if task and conn.tasks:
        conn.tasks.step(task, f"{label} ({detail})" if detail else label, kind=step_kind)

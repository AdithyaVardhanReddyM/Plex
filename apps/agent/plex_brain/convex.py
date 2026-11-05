"""Async Convex HTTP client for the brain.

Every brain function in packages/backend takes `secret` (PLEX_AGENT_SECRET, checked by
convex/lib/agentAuth.ts requireAgent). `query`, `mutation` and `action` add it; the
`public_*` variants call the window's functions (no secret, they act as the viewer: Adi
in guest mode).

    POST {CONVEX_URL}/api/query|mutation|action  {"path", "args", "format": "json"}
      -> {"status": "success", "value"} | {"status": "error", "errorMessage"}
"""

from __future__ import annotations

import os
from typing import Any

import httpx

TIMEOUT_S = 30.0
_client: httpx.AsyncClient | None = None


class ConvexError(RuntimeError):
    pass


def url() -> str:
    return os.environ.get("CONVEX_URL", "http://127.0.0.1:3210").rstrip("/")


def secret() -> str:
    return os.environ.get("PLEX_AGENT_SECRET", "")


def configured() -> bool:
    return bool(os.environ.get("CONVEX_URL") and secret())


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=TIMEOUT_S)
    return _client


def _clean(args: dict[str, Any]) -> dict[str, Any]:
    """Convex validators reject `null` for optional fields: drop Nones."""
    return {k: v for k, v in args.items() if v is not None}


async def _call(kind: str, path: str, args: dict[str, Any], *, with_secret: bool, timeout: float | None = None) -> Any:
    body_args = _clean(args)
    if with_secret:
        body_args["secret"] = secret()
    try:
        res = await _http().post(f"{url()}/api/{kind}", json={"path": path, "args": body_args, "format": "json"},
                                 timeout=timeout or TIMEOUT_S)
    except httpx.HTTPError as err:
        raise ConvexError(f"Convex is unreachable at {url()}: {type(err).__name__}") from err
    try:
        data = res.json()
    except ValueError as err:
        raise ConvexError(f"Convex answered {res.status_code} without JSON for {path}") from err
    if data.get("status") != "success":
        raise ConvexError(f"{path}: {str(data.get('errorMessage') or data)[:400]}")
    return data.get("value")


async def query(path: str, timeout: float | None = None, **args: Any) -> Any:
    return await _call("query", path, args, with_secret=True, timeout=timeout)


async def mutation(path: str, timeout: float | None = None, **args: Any) -> Any:
    return await _call("mutation", path, args, with_secret=True, timeout=timeout)


async def action(path: str, timeout: float | None = None, **args: Any) -> Any:
    return await _call("action", path, args, with_secret=True, timeout=timeout or 90.0)


async def public_query(path: str, **args: Any) -> Any:
    return await _call("query", path, args, with_secret=False)


async def public_mutation(path: str, **args: Any) -> Any:
    return await _call("mutation", path, args, with_secret=False)


async def healthy() -> bool:
    """Convex answers and accepts the secret."""
    try:
        await query("agent:snapshot", timeout=4)
        return True
    except ConvexError:
        return False


async def log(kind: str, title: str, detail: str | None = None, **ids: Any) -> None:
    """A line in Today's feed (agent:log). Never fails the caller."""
    try:
        await mutation("agent:log", kind=kind, title=title, detail=detail, **ids)
    except ConvexError as err:
        print(f"plex: agent:log failed: {err}", flush=True)

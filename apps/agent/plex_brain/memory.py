"""Memory: what Plex knows about the user, explicit and editable (Convex `memories`).

- embed(): gemini-embedding-001 at 768 dims (the vector index in Convex is 768).
- remember(): a fact the user said (or reflect() learned). A memory whose cosine with an
  existing one is above DEDUPE_COSINE updates that one instead of adding a twin.
- recall(): vector search (memory:search), and the hits' `uses` go up.
- core(): pinned plus the most used memories, for the talker's and the worker's
  instructions ("What you know about them"). Memories edited in the window come back
  with an empty embedding; core() re-embeds them.
- reflect(): after a task or a routine run, Flash proposes at most 3 new durable facts
  (structured output), each one remembered with the same dedupe.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any, Literal

from google import genai
from google.adk.tools import ToolContext
from google.genai import types
from pydantic import BaseModel, Field

from . import convex

EMBED_MODEL = os.environ.get("PLEX_EMBED_MODEL", "gemini-embedding-001")
EMBED_DIMS = 768
REFLECT_MODEL = os.environ.get("PLEX_REFLECT_MODEL", "gemini-3.8-flash")
DEDUPE_COSINE = 0.92
KINDS = ("fact", "preference", "person", "merchant", "habit", "note")

_genai: genai.Client | None = None
_pending: set[asyncio.Task[Any]] = set()


def _client() -> genai.Client:
    global _genai
    if _genai is None:
        _genai = genai.Client(location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"))
    return _genai


async def embed(texts: list[str], task: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    res = await _client().aio.models.embed_content(
        model=EMBED_MODEL,
        contents=texts,
        config=types.EmbedContentConfig(output_dimensionality=EMBED_DIMS, task_type=task),
    )
    return [list(e.values or []) for e in res.embeddings or []]


async def embed_one(text: str, task: str = "RETRIEVAL_DOCUMENT") -> list[float]:
    return (await embed([text], task))[0]


async def search(vector: list[float], limit: int = 5) -> list[dict[str, Any]]:
    return list(await convex.action("memory:search", embedding=vector, limit=limit) or [])


async def remember(text: str, kind: str = "fact", about: str | None = None, source: str = "said",
                   confidence: float = 0.9, pinned: bool | None = None) -> dict[str, Any]:
    """Insert a memory, or update its near-twin. Returns {"memoryId", "updated"}."""
    text = text.strip()
    if not text:
        return {"error": "Nothing to remember."}
    kind = kind if kind in KINDS else "fact"
    vector = await embed_one(text)
    hits = await search(vector, limit=1)
    if hits and float(hits[0].get("score") or 0) >= DEDUPE_COSINE:
        twin = hits[0]
        await convex.mutation("memory:patch", memoryId=twin["_id"], text=text, embedding=vector,
                              confidence=max(confidence, 0.0), touch=True)
        return {"memoryId": twin["_id"], "updated": True, "was": twin.get("text")}
    memory_id = await convex.mutation("memory:insert", kind=kind, text=text, about=about or None, source=source,
                                      confidence=confidence, embedding=vector, pinned=pinned)
    return {"memoryId": memory_id, "updated": False}


async def recall(query: str, limit: int = 5) -> list[dict[str, Any]]:
    vector = await embed_one(query, task="RETRIEVAL_QUERY")
    hits = [h for h in await search(vector, limit=limit) if float(h.get("score") or 0) >= 0.55]
    for hit in hits[:3]:
        try:
            await convex.mutation("memory:patch", memoryId=hit["_id"], touch=True)
        except convex.ConvexError:
            pass
    return [{k: h.get(k) for k in ("_id", "kind", "text", "about", "pinned", "score")} for h in hits]


async def core() -> list[dict[str, Any]]:
    """Pinned and most-used memories; re-embeds the ones edited in the window."""
    data = await convex.query("memory:core")
    if isinstance(data, dict):
        memories = list(data.get("memories") or data.get("core") or [])
        stale = list(data.get("needsEmbedding") or [])
    else:
        memories, stale = list(data or []), []
    if stale:
        asyncio.get_running_loop().create_task(_reembed(stale))
    return memories


async def _reembed(stale: list[dict[str, Any]]) -> None:
    try:
        vectors = await embed([m.get("text") or "" for m in stale])
        for m, vector in zip(stale, vectors):
            await convex.mutation("memory:patch", memoryId=m["_id"], embedding=vector)
        print(f"plex: re-embedded {len(stale)} edited memories", flush=True)
    except Exception as err:
        print(f"plex: re-embedding failed: {type(err).__name__}: {err}", flush=True)


def core_lines(memories: list[dict[str, Any]]) -> str:
    if not memories:
        return "nothing yet"
    return "\n".join(f"- {m.get('text')}" + (f" ({m['about']})" if m.get("about") else "") for m in memories[:16])


class _Fact(BaseModel):
    kind: Literal["fact", "preference", "person", "merchant", "habit", "note"]
    text: str = Field(description="One plain sentence about the user, e.g. 'Pays rent to Sam Okafor on the 1st'.")
    about: str = Field(default="", description="A person's or merchant's name, if it's about one.")
    confidence: float = Field(ge=0, le=1)


class _Reflection(BaseModel):
    facts: list[_Fact] = Field(default_factory=list, max_length=3)


_REFLECT = """\
Below is a task Plex (a personal money and errands agent) just did for the user. Pick out
at most 3 NEW durable facts about the user worth remembering for next time: people they pay
or split with (and their emails), merchants and billers, amounts that recur, preferences
about money and approvals, habits. Only what the task shows as true, not guesses; nothing
one-off (today's weather, a single search). If nothing is worth keeping, return no facts.

What Plex already knows:
{known}

The task:
{transcript}
"""


async def reflect(transcript: str, source: str = "learned") -> list[dict[str, Any]]:
    try:
        known = core_lines(await core())
    except convex.ConvexError:
        known = "unknown"
    res = await _client().aio.models.generate_content(
        model=REFLECT_MODEL,
        contents=_REFLECT.format(known=known, transcript=transcript[:6000]),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_Reflection,
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW),
        ),
    )
    parsed = res.parsed if isinstance(res.parsed, _Reflection) else _Reflection.model_validate_json(res.text or "{}")
    saved = []
    for fact in parsed.facts[:3]:
        if fact.confidence < 0.6:
            continue
        saved.append({"text": fact.text, **await remember(fact.text, fact.kind, fact.about or None,
                                                         source if source in ("learned", "routine", "email") else "learned",
                                                         fact.confidence)})
    return saved


async def reflect_safely(transcript: str, source: str = "learned") -> None:
    try:
        saved = await reflect(transcript, source)
        if saved:
            print(f"plex: learned {len(saved)} memories: {[s['text'] for s in saved]}", flush=True)
            await convex.log("memory", f"Learned {len(saved)} thing{'s' if len(saved) != 1 else ''}",
                             "; ".join(s["text"] for s in saved)[:300])
    except Exception as err:
        print(f"plex: reflect failed: {type(err).__name__}: {err}", flush=True)


# --- tools ---------------------------------------------------------------------------------


async def _remember_tool(text: str, kind: str, about: str) -> dict[str, Any]:
    try:
        out = await remember(text, kind, about or None, "said")
    except Exception as err:
        return {"error": f"Couldn't save it: {type(err).__name__}: {str(err)[:200]}"}
    await convex.log("memory", "Remembered", text[:200])
    return {"saved": text, **out}


async def remember_this(text: str, tool_context: ToolContext, kind: str = "fact", about: str = "") -> dict[str, Any]:
    """Remember something the user told you about themselves, the people they pay, their bills or
    how they like money handled ("my landlord is Sam Okafor", "always ask me before anything over
    $100"). It shows in Plex's Memory, where they can edit it.

    Args:
        text: One plain sentence, in the third person ("Pays rent to Sam Okafor on the 1st").
        kind: fact, preference, person, merchant, habit or note.
        about: The person's or merchant's name, when it's about one.
    """
    from .connection import for_talker, for_worker

    try:
        conn, task = for_worker(tool_context)
    except RuntimeError:
        # The talker: embedding, dedupe and saving take a few seconds; the voice shouldn't wait.
        for_talker(tool_context)
        job = asyncio.get_running_loop().create_task(_remember_tool(text, kind, about))
        _pending.add(job)
        job.add_done_callback(_pending.discard)
        return {"saving": text, "note": "It's being saved to their Memory now; just say what you'll remember."}
    out = await _remember_tool(text, kind, about)
    if task and conn.tasks and not out.get("error"):
        conn.tasks.step(task, f"Remembered: {text[:80]}")
    return out


async def recall_memory(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Look up what Plex remembers about something: a person, a merchant, an account, a habit
    ("who's my landlord", "Comcast", "roommates' emails").

    Args:
        query: What to look for, in a few words.
    """
    try:
        return {"memories": await recall(query)}
    except Exception as err:
        return {"error": f"{type(err).__name__}: {str(err)[:200]}"}


TOOLS = [remember_this, recall_memory]

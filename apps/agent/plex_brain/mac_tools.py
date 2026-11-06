"""The worker's tools that run on the user's Mac (apps/mac/Sources/Tools/*).

Reads go straight through. Anything that sends or changes something asks the
user first (`confirm_action`), so the worker never needs to ask twice. `app_usage`
(when an app was last opened, to spot unused subscriptions) and `read_file` (a dropped
receipt or bill) are Plex's additions (docs/plex-mac.md §4).
"""

from __future__ import annotations

import base64
import json
from typing import Any

from google import genai
from google.adk.tools import ToolContext
from google.genai import types

from . import convex
from .connection import for_worker, report

VISION_MODEL = "gemini-3.8-flash"
_genai: genai.Client | None = None


def _client() -> genai.Client:
    global _genai
    if _genai is None:
        _genai = genai.Client(location="global")
    return _genai


async def _mac(tool_context: ToolContext, name: str, args: dict[str, Any] | None = None, *, label: str, timeout: float = 20) -> dict[str, Any]:
    conn, task = for_worker(tool_context)
    result = await conn.bridge.call(name, args or {}, timeout=timeout)
    await report(conn, task, "mac", label, result.get("error"))
    return result


async def _confirm(tool_context: ToolContext, title: str, detail: str = "", *, asked_by: tuple[str, ...] = ()) -> bool:
    """Ask before writing to the user's Mac, unless they asked for exactly this in their own words
    ("…and put it in my calendar"): then the yes is already theirs, and asking again is noise."""
    conn, task = for_worker(tool_context)
    assert conn.tasks
    said = " ".join(task.said).lower()
    if asked_by and any(word in said for word in asked_by):
        conn.tasks.step(task, "You asked for this", kind="info")
        return True
    return await conn.tasks.confirm_action(task, title, detail)


async def what_is_in_front(tool_context: ToolContext) -> dict[str, Any]:
    """The app the user has in front, its window title and the page address in a browser."""
    return await _mac(tool_context, "frontmost_app", label="Looked at the front app")


async def look_at_screen(question: str, tool_context: ToolContext) -> dict[str, Any]:
    """Take a screenshot and answer a question about what's on it (a bill open in the browser,
    a bank page, a receipt, an error).

    Args:
        question: What you need to know from the screen.
    """
    conn, task = for_worker(tool_context)
    shot = await conn.bridge.call("screenshot", {}, timeout=15)
    if shot.get("error"):
        await report(conn, task, "mac", "Couldn't see the screen", shot["error"])
        return shot
    image = base64.b64decode(shot["image"])
    res = await _client().aio.models.generate_content(
        model=VISION_MODEL,
        contents=[types.Content(role="user", parts=[
            types.Part(text=f"This is the user's screen. {question} Answer briefly and concretely."),
            types.Part.from_bytes(data=image, mime_type=shot.get("mime") or "image/jpeg"),
        ])],
    )
    await report(conn, task, "mac", "Looked at your screen")
    return {"answer": (res.text or "").strip()}


async def calendar_events(tool_context: ToolContext, days_ahead: int = 7, search: str = "") -> dict[str, Any]:
    """Events from the Mac's Calendar (iCloud, Google or Exchange calendars added to the Mac).

    Args:
        days_ahead: How many days from now to look (1-60).
        search: Only events whose title or notes contain this.
    """
    return await _mac(tool_context, "calendar_events", {"days": max(1, min(days_ahead, 60)), "search": search}, label="Checked your calendar")


async def add_calendar_event(title: str, start: str, end: str, tool_context: ToolContext, location: str = "", notes: str = "") -> dict[str, Any]:
    """Add an event to the Mac's Calendar (asks the user first).

    Args:
        title: Event title.
        start: Local start, ISO 8601 ("2026-10-23T20:00").
        end: Local end, ISO 8601.
        location: Optional place or address.
        notes: Optional notes.
    """
    if not await _confirm(tool_context, f"Add “{title}” to your calendar?", f"{start} to {end} {location}".strip(),
                          asked_by=("calendar",)):
        return {"cancelled": True}
    return await _mac(tool_context, "calendar_add", {"title": title, "start": start, "end": end, "location": location, "notes": notes}, label=f"Added {title} to your calendar")


async def reminders(tool_context: ToolContext, list_name: str = "", include_done: bool = False) -> dict[str, Any]:
    """What's on the user's Reminders lists (the Mac's Reminders app, iCloud lists included).

    Args:
        list_name: Only this list ("Groceries"); every list when empty.
        include_done: Also the ones already ticked off in the last two weeks.
    """
    return await _mac(tool_context, "reminders_list", {"list": list_name, "done": include_done}, label="Checked your reminders")


async def add_reminder(title: str, tool_context: ToolContext, due: str = "", notes: str = "", list_name: str = "") -> dict[str, Any]:
    """Add a reminder to the Mac's Reminders (asks the user first).

    Args:
        title: What to remember ("Pick up the cake").
        due: Optional local time to be reminded, ISO 8601 ("2026-10-29T17:00"), or a date ("2026-10-29").
        notes: Optional notes.
        list_name: Optional list to put it on; the default list otherwise.
    """
    when = f"{due}" + (f", on {list_name}" if list_name else "")
    if not await _confirm(tool_context, f"Add “{title}” to your reminders?", when.strip(", "), asked_by=("remind",)):
        return {"cancelled": True}
    return await _mac(tool_context, "reminders_add", {"title": title, "due": due, "notes": notes, "list": list_name},
                      label=f"Added {title} to Reminders")


async def complete_reminder(title: str, tool_context: ToolContext) -> dict[str, Any]:
    """Tick off a reminder by its title (asks the user first).

    Args:
        title: The reminder's title, or enough of it to find it.
    """
    if not await _confirm(tool_context, f"Tick off “{title}”?"):
        return {"cancelled": True}
    return await _mac(tool_context, "reminders_complete", {"title": title}, label=f"Ticked off {title}")


async def find_notes(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Search the Mac's Notes by title and text; gives each note's id, title, folder and a snippet.

    Args:
        query: Words in the note ("packing list", "Sam's address").
    """
    return await _mac(tool_context, "notes_search", {"query": query}, label=f'Searched your notes for "{query}"', timeout=30)


async def read_note(note: str, tool_context: ToolContext) -> dict[str, Any]:
    """The full text of one note in the Mac's Notes.

    Args:
        note: Its id from find_notes, or its exact title.
    """
    return await _mac(tool_context, "notes_read", {"note": note}, label="Read a note", timeout=30)


async def add_note(title: str, body: str, tool_context: ToolContext) -> dict[str, Any]:
    """Write a new note in the Mac's Notes (a plan, a list, an idea; asks the user first).

    Args:
        title: The note's title.
        body: Its text; one item per line for a list.
    """
    if not await _confirm(tool_context, f"Write the note “{title}”?", body[:600]):
        return {"cancelled": True}
    return await _mac(tool_context, "notes_add", {"title": title, "body": body}, label=f"Wrote {title} in Notes", timeout=30)


async def find_contact(name: str, tool_context: ToolContext) -> dict[str, Any]:
    """Look someone up in the Mac's Contacts (phone numbers, emails, address, birthday).

    Args:
        name: Their name or part of it.
    """
    return await _mac(tool_context, "contacts_search", {"query": name}, label=f"Looked up {name} in Contacts")


async def find_on_map(query: str, tool_context: ToolContext, near: str = "") -> dict[str, Any]:
    """Apple Maps search for an address or a specific business (a branch, a pharmacy, a post office).

    Args:
        query: What to find ("the nearest UPS store").
        near: Optional area to search around.
    """
    return await _mac(tool_context, "maps_search", {"query": query, "near": near}, label=f'Searched Maps for "{query}"')


async def send_imessage(to: str, text: str, tool_context: ToolContext) -> dict[str, Any]:
    """Send an iMessage or SMS from the Mac's Messages app (asks the user first).

    Args:
        to: Phone number or email of the recipient (look it up with find_contact).
        text: The message.
    """
    if not await _confirm(tool_context, f"Send this to {to}?", text):
        return {"cancelled": True}
    return await _mac(tool_context, "messages_send", {"to": to, "text": text}, label=f"Messaged {to}")


async def send_file_imessage(to: str, path: str, tool_context: ToolContext, text: str = "") -> dict[str, Any]:
    """Send a file (a receipt, a statement) by iMessage, with an optional message (asks first).

    Args:
        to: Phone number or email of the recipient (look it up with find_contact).
        path: The file's path on the Mac.
        text: A short message to go with it.
    """
    name = path.rsplit("/", 1)[-1]
    if not await _confirm(tool_context, f"Send {name} to {to}?", text):
        return {"cancelled": True}
    return await _mac(tool_context, "messages_send_file", {"to": to, "path": path, "text": text}, label=f"Sent {name} to {to}")


async def draft_email_in_mail(to: str, subject: str, body: str, tool_context: ToolContext, attachment: str = "") -> dict[str, Any]:
    """Open a ready-to-send draft in the Mac's Mail app (the user presses Send themselves).

    Args:
        to: Recipient email.
        subject: Subject line.
        body: Plain-text body.
        attachment: Optional path of a file on the Mac to attach.
    """
    return await _mac(tool_context, "mail_draft", {"to": to, "subject": subject, "body": body, "attachment": attachment},
                      label="Opened an email draft in Mail")


async def open_link(url: str, tool_context: ToolContext) -> dict[str, Any]:
    """Open a web page in the user's browser.

    Args:
        url: The full https:// address.
    """
    return await _mac(tool_context, "open_url", {"url": url}, label="Opened a link")


async def open_app(name: str, tool_context: ToolContext) -> dict[str, Any]:
    """Open (or bring to the front) an app on the Mac by name: Safari, Notes, Slack, Messages,
    Numbers, Mail… For doing things inside the app, use operate instead.

    Args:
        name: The app's name as it appears in the Applications folder ("Numbers").
    """
    return await _mac(tool_context, "open_app", {"name": name}, label=f"Opened {name}")


async def app_usage(apps: list[str], tool_context: ToolContext) -> dict[str, Any]:
    """When the user last opened some apps on this Mac (from macOS's own records), to spot a
    subscription they pay for but don't use ("Figma", "Adobe Lightroom").

    Args:
        apps: App names as in the Applications folder.
    """
    out = await _mac(tool_context, "app_usage", {"apps": apps[:20]}, label="Checked when you last used " + ", ".join(apps[:3]))
    seen = [{"app": str(u.get("app")), "lastUsedAt": int(u["lastUsedAt"])}
            for u in (out.get("usage") or []) if isinstance(u, dict) and u.get("lastUsedAt")]
    if seen:
        # The measured date goes onto the matching subscription, so Money and Insights show it too.
        try:
            await convex.mutation("subscriptions:noteUsage", usage=seen)
        except convex.ConvexError as err:
            print(f"plex: subscriptions:noteUsage failed: {err}", flush=True)
    return out


async def read_file(path: str, tool_context: ToolContext, question: str = "") -> dict[str, Any]:
    """Read a file on the Mac: a dropped receipt, a bill PDF or photo, a CSV statement. Images
    and PDFs are read with vision; the answer has the merchant, date, items and totals.

    Args:
        path: The file's full path ("/Users/adi/Downloads/receipt.jpg").
        question: What you need from it ("the total and each person's items").
    """
    conn, task = for_worker(tool_context)
    result = await conn.bridge.call("read_file", {"path": path}, timeout=30)
    name = path.rsplit("/", 1)[-1]
    await report(conn, task, "mac", f"Read {name}", result.get("error"))
    if result.get("error"):
        return result
    if result.get("text") is not None:
        return {"text": str(result["text"])[:20000], "mime": result.get("mime")}
    if not result.get("image"):
        return {"error": f"{name} has no text or image Plex can read."}
    data = base64.b64decode(result["image"])
    ask = question or "List the merchant, the date, every line item with its price, tax, tip and the total."
    res = await _client().aio.models.generate_content(
        model=VISION_MODEL,
        contents=[types.Content(role="user", parts=[
            types.Part(text=f"This is a file the user gave you ({name}). {ask} Amounts exactly as printed. Answer as compact JSON."),
            types.Part.from_bytes(data=data, mime_type=result.get("mime") or "image/jpeg"),
        ])],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    try:
        return {"read": json.loads(res.text or "{}"), "mime": result.get("mime")}
    except json.JSONDecodeError:
        return {"read": (res.text or "").strip(), "mime": result.get("mime")}


TOOLS = [
    what_is_in_front, look_at_screen, calendar_events, add_calendar_event,
    reminders, add_reminder, complete_reminder, find_notes, read_note, add_note, find_contact,
    find_on_map, send_imessage, send_file_imessage, draft_email_in_mail, open_link, open_app,
    app_usage, read_file,
]

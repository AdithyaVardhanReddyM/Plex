"""Insights: pages of charts and tables the worker builds to answer a money question.

The worker picks widgets from a closed vocabulary (convex/schema.ts `insightWidget`): receipts
(the web Ledger's grid / chart / stat specs over live receipts), pots, bills and subscriptions
(bound to live data), a timeline and a headline figure (values the worker worked out from other
sources, like the Mac's calendar). Convex stores the page (insights:save); the Mac's Insights
page shows the web's /insights route, which draws it. The notch gets an "Insights" card that
opens it, and the Mac's window jumps to it.
"""

from __future__ import annotations

import datetime as dt
import json
from typing import Any
from zoneinfo import ZoneInfo

from google.adk.tools import ToolContext

from . import convex
from .connection import for_worker, report


def _ms(when: Any, timezone: str | None) -> int | None:
    """A timeline item's time: ms, or an ISO date / datetime in the user's timezone."""
    if isinstance(when, (int, float)) and when > 10**11:
        return int(when)
    try:
        d = dt.datetime.fromisoformat(str(when).strip())
    except ValueError:
        return None
    if d.tzinfo is None:
        try:
            d = d.replace(tzinfo=ZoneInfo(timezone)) if timezone else d.astimezone()
        except Exception:
            d = d.astimezone()
        if len(str(when).strip()) <= 10:
            d = d.replace(hour=12)
    return int(d.timestamp() * 1000)


def _clean(widgets: list[dict[str, Any]], timezone: str | None) -> list[dict[str, Any]]:
    """Light repairs before Convex validates: drop empty keys, turn dates into ms, round cents."""
    out = []
    for w in widgets:
        if not isinstance(w, dict) or not w.get("kind"):
            continue
        w = {k: v for k, v in w.items() if v not in (None, "", [])}
        if w["kind"] == "receipts":
            spec = w.get("spec") or {k: w.pop(k) for k in list(w) if k not in ("kind", "note", "spec")}
            spec.setdefault("filter", {})
            w = {"kind": "receipts", "spec": spec, **({"note": w["note"]} if w.get("note") else {})}
        if w["kind"] == "timeline":
            items = []
            for it in w.get("items") or []:
                at = _ms(it.get("at") or it.get("date"), timezone)
                if at is None:
                    continue
                item = {"at": at, "label": str(it.get("label") or ""), "kind": it.get("kind") or "event"}
                for key in ("detail", "tone"):
                    if it.get(key):
                        item[key] = it[key]
                if it.get("amountCents") is not None:
                    item["amountCents"] = int(round(float(it["amountCents"])))
                items.append(item)
            w["items"] = sorted(items, key=lambda i: i["at"])
        if w["kind"] == "figure" and w.get("valueCents") is not None:
            w["valueCents"] = int(round(float(w["valueCents"])))
        out.append(w)
    return out


async def show_insights(title: str, widgets_json: str, tool_context: ToolContext, summary: str = "",
                        insights_id: str = "") -> dict[str, Any]:
    """Build a page of charts and tables in the Insights window to answer a money question ("how
    did I do this month", "plan my week", "where does my money go"). It opens on the user's Mac.
    Gather the facts first (recent_money, money_overview, calendar_events, app_usage), then pick
    3 to 7 widgets that answer the question; lead with a figure or two. Data widgets draw live
    data, so you only choose the view. To update a page after acting on it (a new saving), call
    again with its insights_id and the whole new list.

    Args:
        title: The page's title ("October so far", "Your week").
        widgets_json: JSON list of widgets, each one of:
            {"kind":"figure","title":"Spent this month","valueCents":231800,"caption":"11% under October","tone":"good|warn|neutral"}
              (or "value":"74 days" instead of valueCents; state only numbers you worked out from tools)
            {"kind":"receipts","spec":{"kind":"chart","title":"Spending by pot","filter":{"sinceDays":30,"direction":"out"},
              "chart":{"type":"donut|bar|column|line|area","groupBy":"category|day|week|party|state|kind","measure":"sum|count"}}}
            {"kind":"receipts","spec":{"kind":"grid","title":"Every payment","filter":{"sinceDays":30},
              "columns":["when","party","why","rule","category","amount"],"sort":{"column":"amount","desc":true}}}
            {"kind":"receipts","spec":{"kind":"stat","title":"Food","filter":{"sinceDays":30,"categories":["Food"]},
              "stat":{"measure":"sum|count|avg","compareToPrevious":true}}}
              (receipt filters: sinceDays, categories (pot names), parties, kinds, states, direction in|out, search)
            {"kind":"pots","title":"Pots","pots":["Food","Shopping"]}   (omit pots for all)
            {"kind":"bills","title":"Bills due","days":14}
            {"kind":"subscriptions","title":"Subscriptions","flag":["Frame Studio","Cloudnest"]}
            {"kind":"timeline","title":"This week","items":[{"at":"2026-11-12","label":"Northwave Internet",
              "amountCents":8420,"kind":"bill|event|payment|plan","detail":"Bills pot","tone":"warn"}]}
            Every widget may have a "note": one short line on why it matters.
        summary: One or two sentences: what the page shows and what you'd do about it.
        insights_id: To replace an existing page's widgets, its id from an earlier call.
    """
    conn, task = for_worker(tool_context)
    try:
        widgets = json.loads(widgets_json)
        assert isinstance(widgets, list) and widgets
    except Exception:
        return {"error": "widgets_json must be a JSON list of widgets (see the tool's description)."}
    widgets = _clean(widgets, conn.timezone)
    question = task.said[0] if task.said else None
    try:
        page_id = await convex.mutation("insights:save", id=insights_id or None, title=title, question=question,
                                        summary=summary or None, widgets=widgets)
    except convex.ConvexError as err:
        return {"error": f"The page didn't save: {str(err)[:500]}",
                "next": "Fix the widgets to match the shapes in the tool's description and call again."}
    page_id = str(page_id)
    assert conn.tasks
    conn.tasks.show_view(task, {"type": "insights", "key": "insights", "title": title, "id": page_id,
                                "detail": summary or f"{len(widgets)} views"})
    await conn.bridge.send_json({"type": "insights", "id": page_id, "title": title})
    await report(conn, task, "plex", "Updated Insights" if insights_id else "Built Insights", title)
    return {"ok": True, "insights_id": page_id,
            "note": "It's open in the Insights window. Say what it shows in a sentence; don't read the widgets out."}


TOOLS = [show_insights]

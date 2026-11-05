"""The worker's money tools, over Convex agentMoney:* (the brain never calls PayPal).

Convex runs the policy engine (convex/lib/policy.ts evaluate()), writes the receipt and
calls PayPal. The model only fills in the amount, the payee and why (in the user's words).

A payment that needs approval comes back from agentMoney:pay as
{ok: false, outcome: "needs_approval", askId}: the task shows the money card in the notch
(Allow / Deny / Always), waits for whichever answer comes first (notch, voice or window),
and on Allow calls pay again with approvalAskId. When money moves, the notch gets a
`receipt` frame and the task card carries the receipt.

A routine's guardrails are enforced here on top of the policy: a run never spends more than
maxSpendCents, only from potName, and with approval "always" every payment asks first.
"""

from __future__ import annotations

import json
from typing import Any

from google.adk.tools import ToolContext

from . import convex
from .connection import Connection, for_worker, report
from .tasks import Task


def usd(cents: int | float | None) -> str:
    return f"${(cents or 0) / 100:,.2f}"


async def snapshot() -> dict[str, Any]:
    return dict(await convex.query("agent:snapshot") or {})


async def _receipt_frame(receipt_id: str, fallback: dict[str, Any]) -> dict[str, Any]:
    try:
        r = await convex.public_query("receipts:get", id=receipt_id) or {}
    except convex.ConvexError:
        r = {}
    return {
        "id": receipt_id,
        "amountCents": r.get("amountCents", fallback.get("amountCents")),
        "payee": r.get("payeeLabel") or fallback.get("payee"),
        "why": r.get("why") or fallback.get("why"),
        "ruleText": (r.get("rule") or {}).get("text") or fallback.get("ruleText"),
        "state": r.get("state") or "sent",
        "kind": r.get("kind") or fallback.get("kind"),
        "paypalId": ((r.get("paypal") or {}).get("payoutBatchId") or (r.get("paypal") or {}).get("orderId")
                     or fallback.get("paypalId")),
    }


def _guard(task: Task, pot_name: str, amount_cents: int) -> str | None:
    g = task.guardrails or {}
    if g.get("potName") and pot_name.strip().lower() != str(g["potName"]).strip().lower():
        return f"This routine may only spend from the {g['potName']} pot."
    if g.get("maxSpendCents") is not None and amount_cents > int(g["maxSpendCents"]):
        return f"This routine may spend at most {usd(g['maxSpendCents'])} per run."
    if g.get("approval") == "never_money":
        return "This routine isn't allowed to move money."
    return None


async def pay_flow(conn: Connection, task: Task, args: dict[str, Any]) -> dict[str, Any]:
    """agentMoney:pay with the approval round trip and the receipt frame."""
    assert conn.tasks
    payee = str(args["payee"]).strip().lower()
    pots = {str(p.get("name") or "").lower() for p in (conn.snapshot or {}).get("pots") or []}
    if payee in pots or "saving" in payee or payee in ("me", "myself", "my account"):
        # The user's own pot is not a payee: pay would send real money to someone else.
        await report(conn, task, "money", "That's one of your pots", args["payee"], step_kind="money")
        return {"ok": False, "outcome": "wrong_tool",
                "note": "That payee is one of the user's own pots. Nothing moved. Use move_between_pots instead."}
    blocked = _guard(task, args["potName"], int(args["amountCents"]))
    if blocked:
        await report(conn, task, "money", "Stopped by the routine's guardrail", blocked, step_kind="money")
        return {"ok": False, "outcome": "deny", "ruleText": blocked, "note": "Nothing was paid."}
    if (task.guardrails or {}).get("approval") == "always":
        if not await conn.tasks.confirm_action(task, f"Pay {args['payee']} {usd(args['amountCents'])} from {args['potName']}?",
                                               f"This routine always asks first. Why: {args['why']}"):
            return {"ok": False, "outcome": "declined", "note": "The user said no; nothing was paid."}

    await report(conn, task, "money", f"Checking the {args['potName']} pot's rules", f"{usd(args['amountCents'])} to {args['payee']}",
                 step_kind="money")
    # Who's asking, for the approval card (and a routine run waits on it).
    source: dict[str, Any] = {"kind": "routine" if task.run_id else "task",
                              "label": (task.routine or {}).get("name") or task.title, "taskId": task.id}
    if task.run_id:
        source["runId"] = task.run_id
    args = {**args, "source": source}
    res = dict(await convex.action("agentMoney:pay", **args) or {})
    if not res.get("ok") and res.get("outcome") == "needs_approval" and res.get("askId"):
        ask_id = str(res["askId"])
        await report(conn, task, "money", "Needs your OK", res.get("ruleText"), step_kind="money")
        answer = await conn.tasks.wait_approval(task, ask_id, {
            "amountCents": args["amountCents"], "payee": args["payee"], "ruleText": res.get("ruleText"), "potName": args["potName"],
        })
        if not answer["approved"]:
            return {"ok": False, "outcome": "declined", "ruleText": res.get("ruleText"),
                    "note": "The user said no. Nothing was paid; say so plainly."}
        res = dict(await convex.action("agentMoney:pay", **args, approvalAskId=ask_id) or {})
        if not res.get("ok") and res.get("receiptId"):
            # Convex's safety net (settleApproval) paid it first: same receipt, never twice.
            res.update(ok=True, outcome="allow")
        if answer["always"]:
            res["always"] = f"From now on, {args['payee']} up to {usd(args['amountCents'])} goes through without asking."

    if res.get("ok") and res.get("receiptId"):
        receipt = await _receipt_frame(str(res["receiptId"]), {**args, "ruleText": res.get("ruleText"), "paypalId": res.get("paypalId")})
        await conn.tasks.show_receipt(task, receipt)
        await report(conn, task, "money", f"Paid {args['payee']} {usd(args['amountCents'])}", res.get("ruleText"), step_kind="money")
        res["note"] = "Money moved; a receipt is in the notch. Say the amount, the payee and the rule in one sentence."
        if str(res.get("paypalId") or "").startswith("SIM-"):
            res["note"] += " PayPal isn't configured, so this was a simulated payout: say so."
    elif res.get("outcome") == "deny":
        await report(conn, task, "money", "Blocked by your rules", res.get("ruleText"), step_kind="money")
        res["note"] = "Blocked by the user's rule. Nothing was paid. Tell them which rule; don't try another pot unless they ask."
    elif not res.get("ok"):
        await report(conn, task, "money", "Payment didn't go through", str(res.get("error") or res.get("outcome")), step_kind="error")
        res["note"] = "Nothing was paid. Say what went wrong in plain words."
    return res


# --- tools -----------------------------------------------------------------------------------


async def money_overview(tool_context: ToolContext) -> dict[str, Any]:
    """The user's money right now: pots (balance, what's spent, their rules), bills due in the
    next two weeks, subscriptions (price rises, unused ones) and anything waiting on them."""
    conn, task = for_worker(tool_context)
    data = await snapshot()
    conn.snapshot = data
    await report(conn, task, "money", "Looked at your pots and bills")
    return data


async def check_spend(pot_name: str, amount_cents: int, payee: str, tool_context: ToolContext, category: str = "") -> dict[str, Any]:
    """Ask the policy engine whether a payment would go through, need the user's OK, or be blocked,
    without paying. Use it to answer "can I…" questions.

    Args:
        pot_name: The pot it would come from ("Food").
        amount_cents: The amount in integer cents ($84.20 is 8420).
        payee: Who would be paid.
        category: Optional spending category ("Utilities").
    """
    conn, task = for_worker(tool_context)
    res = await convex.query("agentMoney:check", potName=pot_name, amountCents=int(amount_cents), payee=payee,
                             category=category or None)
    await report(conn, task, "money", f"Checked the {pot_name} pot's rules", (res or {}).get("outcome"), step_kind="money")
    return res


async def pay(kind: str, pot_name: str, amount_cents: int, payee: str, why: str, tool_context: ToolContext,
              payee_email: str = "", category: str = "", bill_id: str = "") -> dict[str, Any]:
    """Pay someone from one of the user's pots. Convex checks the pot's rules: it goes through,
    asks the user (the notch shows Allow / Deny / Always, and this waits for the answer) or is
    blocked. Never say money moved unless this returns ok with a receiptId. Don't ask the user to
    confirm first yourself; the rules decide when to ask.

    Args:
        kind: bill (a bill in their list; pass bill_id), send (money to a person) or purchase.
        pot_name: The pot it comes from, exactly as named in money_overview.
        amount_cents: Integer cents ($84.20 is 8420).
        payee: Who gets paid ("Sam Okafor", "Comcast").
        why: The user's own words, quoted from the task as they said them ("Pay the Comcast bill"), not your summary.
        payee_email: The payee's PayPal email, if known (from memory or the bill).
        category: Optional spending category.
        bill_id: For kind=bill, the bill's _id from money_overview.
    """
    conn, task = for_worker(tool_context)
    if kind not in ("bill", "send", "purchase"):
        return {"error": "kind must be bill, send or purchase"}
    args = {"kind": kind, "potName": pot_name, "amountCents": int(amount_cents), "payee": payee, "why": why,
            "payeeEmail": payee_email or None, "category": category or None, "billId": bill_id or None}
    return await pay_flow(conn, task, args)


def _find_bill(bills: list[dict[str, Any]], payee: str) -> dict[str, Any] | None:
    words = [w for w in payee.lower().replace("bill", "").split() if len(w) > 2]
    best, score = None, 0
    for b in bills:
        hay = f"{b.get('payee', '')} {b.get('category', '')}".lower()
        hits = sum(1 for w in words if w in hay)
        if hits > score:
            best, score = b, hits
    return best


def _bill_pot(pots: list[dict[str, Any]], bill: dict[str, Any]) -> str | None:
    names = [str(p.get("name") or "") for p in pots]
    for want in ("Bills", str(bill.get("category") or ""), "Utilities", "Home"):
        for name in names:
            if want and name.lower() == want.lower():
                return name
    return None


async def pay_bill(payee: str, why: str, tool_context: ToolContext, pot_name: str = "") -> dict[str, Any]:
    """Pay one of the user's bills by its payee ("the Comcast bill", "rent"). Finds the bill in
    their list (amount, due date), then pays it like `pay` (rules, approval card, receipt).

    Args:
        payee: The biller or the kind of bill ("Comcast", "internet", "rent").
        why: The user's own words, quoted from the task as they said them, not your summary.
        pot_name: The pot to pay from; leave empty to use their bills pot, if they have one.
    """
    conn, task = for_worker(tool_context)
    data = await snapshot()
    bill = _find_bill(list(data.get("billsDue") or []), payee)
    if bill is None:
        # Not due in the next two weeks: the whole list (bills:list, as the viewer).
        every = [b for b in await convex.public_query("bills:list") or []]
        match = _find_bill(every, payee)
        if match is not None and match.get("status") == "paid":
            return {"ok": False, "outcome": "already_paid", "payee": match.get("payee"), "amountCents": match.get("amountCents"),
                    "note": "That bill is already paid; nothing to do. Say so."}
        bill = match
        if bill is not None:
            import datetime as _dt
            bill = {**bill, "due": _dt.datetime.fromtimestamp((bill.get("dueAt") or 0) / 1000).strftime("%Y-%m-%d")}
    if bill is None:
        return {"error": f"No unpaid bill matches {payee!r}.",
                "bills": [{k: b.get(k) for k in ("payee", "amountCents", "due")} for b in data.get("billsDue") or []]}
    pots = list(data.get("pots") or [])
    pot = pot_name or _bill_pot(pots, bill)
    if not pot:
        return {"error": "Which pot should this come from?", "pots": [p.get("name") for p in pots],
                "next": "ask_user which pot to pay it from (offer the pots by name), then call pay_bill again with pot_name."}
    note = None
    if bill.get("usualCents") and bill["amountCents"] > bill["usualCents"] * 1.15:
        note = f"This bill is {usd(bill['amountCents'])}, more than the usual {usd(bill['usualCents'])}."
    await report(conn, task, "money", f"Found the {bill.get('payee')} bill", f"{usd(bill.get('amountCents'))}, due {bill.get('due')}")
    args = {"kind": "bill", "potName": pot, "amountCents": int(bill["amountCents"]), "payee": str(bill.get("payee")),
            "why": why, "category": bill.get("category") or None, "billId": bill.get("_id"),
            "payeeEmail": bill.get("payeeEmail") or None}
    res = await pay_flow(conn, task, args)
    if note:
        res["spike"] = note
    return res


async def request_money(people_json: str, why: str, tool_context: ToolContext, note: str = "") -> dict[str, Any]:
    """Ask people to pay the user back (a split): one PayPal invoice per person, each with a receipt.
    Asks the user before sending.

    Args:
        people_json: JSON list of {"name", "email", "items": [{"name", "amountCents"}]}.
        why: The user's own words ("split last night's dinner").
        note: Optional message on the invoices.
    """
    conn, task = for_worker(tool_context)
    assert conn.tasks
    try:
        people = json.loads(people_json)
        assert isinstance(people, list) and people
    except Exception:
        return {"error": "people_json must be a JSON list of {name, email, items: [{name, amountCents}]}"}
    lines = [f"{p.get('name')}: {usd(sum(int(i.get('amountCents') or 0) for i in p.get('items') or []))}" for p in people]
    if not await conn.tasks.confirm_action(task, f"Send PayPal requests to {len(people)} {'person' if len(people) == 1 else 'people'}?",
                                           "\n".join(lines)):
        return {"ok": False, "cancelled": True}
    # agentMoney:request takes one line item per person: each person's items become one line.
    items = [{"name": ", ".join(str(i.get("name") or "Share") for i in p.get("items") or [])[:120] or "Share",
              "amountCents": sum(int(i.get("amountCents") or 0) for i in p.get("items") or [])} for p in people]
    res = await convex.action(
        "agentMoney:request",
        **{"from": [{"name": str(p.get("name") or ""), "email": str(p.get("email") or "")} for p in people]},
        items=items, why=why, note=note or None,
    )
    await report(conn, task, "money", f"Sent {len(people)} PayPal requests" if (res or {}).get("ok") else "Requests didn't go out",
                 step_kind="money")
    return res


async def cancel_subscription(merchant: str, why: str, tool_context: ToolContext) -> dict[str, Any]:
    """Cancel one of the user's subscriptions by its merchant ("the design tool", "Figma"). Asks
    the user first, then cancels (through PayPal when it's billed there) with a receipt.

    Args:
        merchant: The merchant or what it is.
        why: The user's own words.
    """
    conn, task = for_worker(tool_context)
    assert conn.tasks
    data = await snapshot()
    subs = list(data.get("subscriptions") or [])
    words = [w for w in merchant.lower().split() if len(w) > 2]
    match = max(subs, key=lambda s: sum(w in f"{s.get('merchant', '')} {s.get('plan', '')}".lower() for w in words), default=None)
    if match is None or not any(w in f"{match.get('merchant', '')} {match.get('plan', '')}".lower() for w in words):
        return {"error": f"No active subscription matches {merchant!r}.", "subscriptions": [s.get("merchant") for s in subs]}
    if not await conn.tasks.confirm_action(task, f"Cancel {match['merchant']} ({usd(match.get('amountCents'))}/{match.get('cadence', 'month')})?",
                                           why):
        return {"ok": False, "cancelled": True}
    res = dict(await convex.action("agentMoney:cancelSubscription", subscriptionId=match["_id"], why=why) or {})
    if res.get("ok") and res.get("receiptId"):
        await conn.tasks.show_receipt(task, await _receipt_frame(str(res["receiptId"]), {
            "amountCents": 0, "payee": match["merchant"], "why": why, "kind": "subscription", "ruleText": "You asked to cancel"}))
    await report(conn, task, "money", f"Cancelled {match['merchant']}" if res.get("ok") else f"Couldn't cancel {match['merchant']}",
                 res.get("error"), step_kind="money")
    return res


async def recent_money(tool_context: ToolContext, days: int = 30) -> dict[str, Any]:
    """Recent receipts and transactions (what was paid, to whom, from which pot, and why).

    Args:
        days: How far back (1-90).
    """
    conn, task = for_worker(tool_context)
    res = await convex.query("agentMoney:recent", days=max(1, min(int(days), 90)))
    await report(conn, task, "money", f"Looked at the last {days} days of receipts")
    return res


async def move_between_pots(from_pot: str, to_pot: str, amount_cents: int, why: str, tool_context: ToolContext) -> dict[str, Any]:
    """Move money between two of the user's own pots ("move half of what's left in Food to Savings").
    Pots are envelopes inside the user's own balance: nothing leaves it and no one is paid, so no
    approval is needed. Work out the amount from money_overview first when it's "half of what's left".

    Args:
        from_pot: The pot to take it from ("Food").
        to_pot: The pot to put it in ("Savings").
        amount_cents: Integer cents, more than 0.
        why: The user's own words for why.
    """
    conn, task = for_worker(tool_context)
    blocked = _guard(task, from_pot, int(amount_cents))
    if blocked:
        await report(conn, task, "money", "Stopped by the routine's guardrail", blocked, step_kind="money")
        return {"ok": False, "error": blocked}
    res = dict(await convex.mutation("agentMoney:move", fromPot=from_pot, toPot=to_pot, amountCents=int(amount_cents), why=why) or {})
    if res.get("ok"):
        await report(conn, task, "money", f"Moved {usd(int(amount_cents))} from {from_pot} to {to_pot}",
                     f"{to_pot} now has {usd(int(res['to']['balanceCents']))}", step_kind="money")
        res["note"] = "Moved between the user's own pots (no payment, nothing left their balance). Say the amount and the new balance."
    else:
        await report(conn, task, "money", "Couldn't move it", str(res.get("error")), step_kind="error")
    return res


TOOLS = [money_overview, move_between_pots, check_spend, pay, pay_bill, request_money, cancel_subscription, recent_money]

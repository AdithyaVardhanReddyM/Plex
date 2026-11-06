# Plex for Mac: what it can do, and the demo scenarios

Written 6 Nov 2026 from the code as it stands (`apps/mac`, `apps/agent`, `packages/backend`). Part 1 is the
capability map. Part 2 is the proposed demo scenarios, each with the exact tool trace and what still needs building.
Part 3 is what to remove or hide. Part 4 is the order of work.

The Mac app stays separate from the web app: no tasks, causes, proofs or NGO anything. The only thing it shares with the
web is the user's receipts and pots.

## Status, 6 Nov evening: the recommended seven

Checked with the real brain (Vertex Gemini), Convex, PayPal sandbox and agent-browser, driven by
`apps/agent/scripts/fake_mac.py` (the Mac app's protocol, real CLI calls, stubbed Mac apps).

| | Scenario | Where it stands |
|---|---|---|
| A1 | Class booking | **Runs end to end** (~90 s): operator books on `claycommons.localhost:3000`, $65 trips Shopping's ask-over-$50, Payout with reference `CC-…`, the page flips to booked, calendar event added. Now checks the calendar for a clash first and uses Adi's real name and email. |
| A2 | Parking ticket photo | **Runs end to end** (~100 s): reads the ticket, looks up `LP-4417-2290` + plate on `lakeport.localhost:3000`, checks $68 against the ticket, pays from Bills with the citation as reference, reads the confirmation. Ticket image: open `lakeport.localhost:3000/?view=ticket` and screenshot it. |
| B1 | Utility guard | **Code path checked, not run live** (needs Gmail connected). Email payload → `record_bill` (usual and spike computed in code) → pay or hold-and-ask → Gmail draft + reminder. Set `PLEX_MAIL_POLL_S=30` for filming. |
| B3 | Portal biller | **Runs end to end** as a real routine run once signed in: routine compiled without a time question, "the usual" allows 10%, $62.14 paid from Bills. The login hand-off card itself wasn't exercised (the test signed in first). |
| C1 | Invoice paid → Tax, Lena | **Runs end to end** with a replayed `INVOICING.INVOICE.PAID`: real sandbox invoice, $1,200 lands in Work, $360 to Tax, $252 Payout to Lena, run record and message. A new routine on the same event now offers to replace "Pass Lena her share". Live webhooks need `scripts/paypal-webhook-tunnel.sh`, which needs a newer ngrok (`brew upgrade ngrok`). |
| C3 | Receipts folder | **Fixed, not run live** (needs Sheets connected and receipt PDFs). The Mac only watched Downloads before; it now watches every folder routine's folder. |
| D1 | Month review and cut | **Runs end to end**: Insights page built in ~15 s, "Do both" cancels Frame Studio and downgrades Cloudnest on `cloudnest.localhost:3000` in one go, records the new price, updates the page with the saving. |

Built for these, all general (no scenario logic in the agent): receipts quote the user's own
words; payments carry a merchant reference (`receipts.reference`, `merchants:paymentFor`);
`record_bill`, `create_pot`, `update_subscription`; invoices paid into a pot; PayPal events hand
payer and amount to routines; the operator stops at payment steps and can save a page as PDF;
Insights (`show_insights` → `/insights` → the Mac's Insights page); the invented merchant sites
(`apps/web/src/components/sites`), each with `?reset` for rehearsals.

Still yours to do: connect Gmail and Sheets in Connections; create sandbox personal accounts for
the payees if Payouts should land somewhere visible (bookings@claycommons.example.com,
citations@lakeport.example.com, billing@brightline.example.com, Lena's email in memory); upgrade
ngrok for live webhooks. Rehearse from a clean world: `pnpm --filter @plex/backend exec convex run
seed:run '{"reset":true}'`, then open each site once with `?reset` in Plex's browser.

---

## 1. Capability map

### How you talk to it

- **Voice**: hold `fn + control`, speak, let go. Gemini Live (`gemini-3.8-live`) answers out loud. Push-to-talk, so
  it never listens on its own.
- **Type**: hover the notch and type.
- **Drop a file** on the notch: a receipt photo, a bill PDF. The talker starts a task with it.
- The **talker** only does quick things itself (money questions from `agent:snapshot`, remember/recall, answer an ask
  by voice, "what's in front of me"). Everything else becomes a **background task** run by the **worker**
  (`gemini-3.8-flash`). The talker keeps talking while the worker works.

### What the worker can do (its tools, grouped)

| Area | Tools | Notes |
|---|---|---|
| Money | `money_overview`, `check_spend`, `pay` (bill / send / purchase), `pay_bill`, `request_money`, `cancel_subscription`, `recent_money`, `move_between_pots` | All go through Convex `agentMoney:*`. `pay` is a **PayPal Payout** from the Plex sandbox account to the payee's email. `request_money` is one **PayPal Invoice** per person. `cancel_subscription` calls PayPal Subscriptions cancel when the id is real. Moving between pots is bookkeeping, no PayPal call. |
| Policy | enforced in `convex/lib/policy.ts evaluate()` | Rules: daily / per-purchase / monthly limits, ask-over, block-category, allow-merchants, quiet hours, **auto_approve** ("Always"), pause-all. Deterministic. The model never decides. |
| Approvals | notch card Allow / Deny / Always, Needs you page, voice | A money approval is an `approvals` row plus an `asks` row. Answering anywhere resolves it. "Always" writes an `auto_approve` rule. |
| Receipts | every payment | `why` in the user's words, `rule`, `evidence`, PayPal id. Foil-edge card slides into the notch for 6 s. |
| Memory | `remember_this`, `recall_memory`, reflect after each task | Vector search (gemini-embedding-001). Editable, pinnable, forgettable in the window. Pinned memories are always in context. |
| Routines | `create_routine`, `list_routines`, `run_routine_now`, `tell_user` | Compiled once into When / If / Then (`spec`). Triggers: **schedule**, **email** (Gmail polled every 5 min), **paypal** (webhook event queues a run), **folder** (the Mac watches a folder), manual. Guardrails: pot, max spend per run, approval always / over limit / never money. Missed-while-asleep policy. Full run history. |
| Connected accounts (Composio) | Gmail search / draft / send; Google Calendar events / free time / add; Slack search / send; Notion search / read / create; Drive search; Docs find / read / create; Sheets find / read / add rows / create; `find_app_action` + `run_app_action` for anything else in the catalog | Needs `COMPOSIO_MAC_API_KEY` (set) and the user to connect each app once in Connections. |
| Mac apps | Calendar, Reminders, Notes, Contacts, Maps (search, ETA), Messages (text, file), Mail draft, open link / app, `app_usage` (Spotlight last-used date per app), `read_file` (PDF / image with vision), `look_at_screen`, `what_is_in_front` | `app_usage` is the clever one: "you haven't opened Frame Studio in 74 days" from the real Mac. |
| Computer use (operator) | `operate(job, surface)`: a separate LLM loop with **desktop** tools (agent-desktop over the accessibility tree: snapshot, find, click, type, set value, press, launch, scroll) and **browser** tools (agent-browser driving Plex's own Chrome profile over CDP: open, snapshot, click, fill, type, press, get text, wait, back), plus `ask_permission`, `ask_user`, `hand_over` (takeover / login card), screenshot fallback | Both CLIs are installed on this Mac. Never types passwords, card numbers or one-time codes, never solves CAPTCHAs: it hands over, the user signs in once in the Plex browser profile, the session persists. Up to 40 steps per job. |
| Web | `search_the_web` (Google Search grounding) | A biller's support number, a fee, a price. |
| Notch cards | task progress, approval, question (options or typed), takeover, receipt, routine pill, **note** (copyable text), **file**, **timeline** | No tables or charts yet. |

### The main window

Today (greeting, Needs you, coming up, recent activity, pots) · Needs you · Routines (list, When / If / Then detail with
run history, New routine sheet with compile → review → save, Run now, on/off) · Activity · Money (pots with rules,
bills with spike %, subscriptions with price rises and last-used, recent receipts, "Open the Ledger" to the web) ·
Memory (search, by kind, edit / pin / forget) · Connections (Composio apps, Mac permissions, agent-desktop and
agent-browser status) · Settings (brain and Convex addresses, voice, talk keys, pause all spending).

### PayPal, really

`packages/paypal` has: Orders create, **Payouts** create, **Invoices** create, webhook verify. Convex receives
webhooks (`PAYMENT.CAPTURE.*`, `PAYMENT.PAYOUTS-ITEM.*`, and any event a routine's `paypal` trigger names). Not in the
client yet: invoice list / send reminder, refunds, subscriptions create (the MCP has all of them).

### The seeded world (Adi, Oakland)

Pots: Food, Shopping ("Up to $120 per purchase. Ask me before anything over $50. Never buy subscriptions without
asking."), Bills ("up to $3,000 a month, ask over $100, pay Sam Okafor up to $1,850 without asking"), Work, Savings,
plus Errands and Giving from the web side. Bills: Sam Okafor rent $1,850 on the 1st; Northwave Internet $84.20
(usually $79); Pacific Power $212 (usually $96, a spike); Brightline Mobile; Harbor Mutual insurance; Ironleaf
Fitness. Subscriptions: Reelhouse, Tunewell, Cloudnest ($2.99 → $4.99), Frame Studio (unused 74 days), The Daily
Tide, Greenplate meal kit, Tunnelbird VPN. Routines: pay rent when everyone's in; Friday money check-in; pay
utilities unless they spike; watch my subscriptions; pass Lena her 30% share. 14 memories (landlord, roommates and
emails, Lena's share, "approve anything over $100", "pay bills two days early").

### Gaps that matter for a demo

1. **No charts or grids in the Mac app.** The web Ledger has AG Grid + AG Charts with an Analyst that emits typed
   widget specs (`lib/ledgerSpec.ts`: grid / chart / stat over receipts). The Mac has nothing visual beyond lists.
2. **A "purchase" is a Payout** to the merchant's PayPal email, not a checkout. Fine for the demo if the merchant is
   ours and confirms the order when the payout lands (webhook).
3. **Webhooks need a public URL.** The local anonymous Convex can't be reached by PayPal. Any invoice-paid or
   payout-status flow needs the Convex deployment hosted (or a tunnel) before it can be rehearsed.
4. **Payees need sandbox accounts** to see real Payouts and Invoices land (billers, roommates, Lena, the shop). The
   fallback `PAYPAL_DEMO_PAYEE_EMAIL` catches everything otherwise, which is fine for receipts but weak on camera.
5. **Nothing writes bills from the brain** (`bills` has only `list`). A "bill came in" flow needs `bills:add` /
   `bills:patch` for the agent.
6. **Invoice reminders and listing** aren't in `@plex/paypal` yet (easy to add).

---

## 2. Demo scenarios

Each scenario is written as the moment it would be filmed, then the clever part, then the trace and what's missing.
Brands and people are the seeded invented ones; Adi lives in Oakland with roommates Maya, Jonah and Priya, pays rent
to Sam Okafor, and does freelance work with a contractor, Lena Varga. ✅ exists today (untested end to end),
🔧 needs building.

The tool set, for reference: PayPal Payouts (`pay`), Invoices (`request_money`), Subscriptions cancel; Gmail,
Google Calendar, Sheets, Docs, Drive, Slack, Notion; Mac Calendar, Reminders, Notes, Contacts, Maps, Messages, Mail
drafts, `read_file` (vision on PDFs and photos), `app_usage`; the operator over agent-desktop (native apps) and
agent-browser (Plex's own Chrome profile); web search; memory; routines with schedule, email, PayPal-webhook and folder
triggers.

### A. Computer use + payment, with the agent doing something clever

#### A1. Book the Saturday class, but check the calendar first

**Scene.** *"Book me into the pottery class at Clay Commons on Saturday and put it in my calendar."* Plex: *"Saturday's
10 o'clock runs till noon and you've got brunch with Maya at 11. There's a 2 pm, want that one?"* *"Yes."* The Plex
browser opens the studio's booking page, picks 2 pm, fills name and email, reaches "Pay $65". The approval card:
**$65 · Clay Commons · Shopping · Ask before anything over $50**. Allow. Payout, receipt. The confirmation code is read
off the page, a Calendar event appears with the studio's address and a 20-minute drive time note, and a Reminder is set
for Friday night: "Bring an apron".

**Clever.** It reads the user's calendar before spending, resolves the conflict with one question, and finishes the
job after the payment (calendar, address from Maps, reminder), not just the payment.

**Trace.** `calendar_events(days_ahead=7)` ✅ → `operate(browser: read slots)` ✅ → `ask_user(options)` ✅ →
`operate(browser: book 2 pm, fill name and email, stop at pay)` ✅ → `pay(purchase, Shopping, 6500, "Clay Commons")`
→ policy → approval → Payout → receipt ✅ → `operate(browser: read confirmation)` ✅ → `find_on_map` ✅ →
`add_calendar_event` ✅ → `add_reminder` ✅. 🔧 the studio's booking page (one route in `apps/web`, "Pay with Plex"
shows a reference, flips to confirmed when the receipt exists).

#### A2. The parking ticket, from a photo

**Scene.** Adi drops a photo of a parking ticket on the notch. Plex: *"Oakland citation, sixty-eight dollars, it
doubles after the 19th. Pay it from Bills?"* *"Yes."* The Plex browser opens the city's payment portal, enters the
citation number and plate, and stops: the portal says $68 and the ticket says $68, so it pays. Receipt in the notch.
Plex: *"Paid, confirmation 7Q2K. I saved the confirmation to your Receipts folder."* A file card shows the PDF.

**Clever.** It reads the deadline and the doubling rule off the ticket, checks the portal's amount against the ticket
before paying, and keeps the proof. If the portal said a different amount, it would stop and ask.

**Trace.** `read_file(photo)` ✅ → `confirm_action` (the pot's rules decide; $68 is under the Bills pot's $100 ask
line, so the only question is "pay it?", and the money step then goes through without a card) ✅ →
`operate(browser: enter citation and plate, read amount, don't pay)` ✅ → `pay(bill, Bills, 6800, "City of Oakland
Parking")` → Payout → receipt ✅ → `operate(browser: mark as paid with the Plex reference, read confirmation)` 🔧 the
portal page → `save_file` ✅. Needs a ticket photo asset (invented city, invented plate).

#### A3. The cabin deposit, split four ways

**Scene.** *"Book the Tahoe cabin we looked at for the 20th to the 22nd and split the deposit with Maya, Jonah and
Priya."* Plex opens the listing in its browser, reads the price and the cancellation policy, fills the booking form,
and comes back: *"Four hundred deposit, free cancellation until the 13th. Pay it and request a hundred from each of
them?"* Allow. Payout (approval card, since it's over $50), receipt. Three PayPal invoices go out with the listing
name on them. Calendar gets the trip, a Reminder lands on the 12th: "Last day to cancel Tahoe for free". Plex: *"Done.
I'll tell you when they've paid."*

**Clever.** It reads the fine print (the free-cancellation date) and turns it into a reminder, and it treats one
request as two money movements with the right instrument for each: a Payout out, Invoices in.

**Trace.** `operate(browser: listing, price, policy, fill form)` ✅ → `confirm_action` ✅ → `pay(purchase, Shopping,
40000, "Hollow Pine Cabins")` → approval → Payout → receipt ✅ → `recall_memory(roommates' emails)` ✅ →
`request_money(3 people)` → 3 Invoices ✅ → `add_calendar_event` ✅ → `add_reminder` ✅. 🔧 the listing page. "I'll
tell you when they've paid" is a PayPal `INVOICING.INVOICE.PAID` webhook, hosted Convex needed.

*Also considered:* the desk-lamp reorder with price comparison across three shops (fine, but A1 to A3 each show
something the lamp doesn't).

### B. Bills and reminding

#### B1. The utility guard: pay the normal one, hold the spike

**Scene.** Routine "Pay utility bills unless they spike" is on. Two emails arrive while Adi works. Northwave Internet,
$84.20: a pill under the notch, **Paid Northwave $84.20 · within your Bills rules**, then the receipt card. No
interruption. Pacific Power, $212.40: the pill says **Held Pacific Power $212 · 2.2× usual**, and an ask lands in Needs
you: *"Pacific Power is $212.40, usually $96. Pay, hold, or ask them why?"* Adi, by voice: *"Hold it and ask them
why."* Plex drafts the email to Pacific Power in Gmail, quoting the last three bills, and sets a Reminder for two days
before it's due.

**Clever.** The spike check is a number, not a vibe: it compares with the stored usual amount. Same routine, two
outcomes, and the held one becomes a draft and a reminder instead of a dead end.

**Trace.** Email trigger (Gmail poll) ✅ → `read_file` on the PDF ✅ → compare with `usualCents` ✅ → `pay_bill` →
Payout → receipt ✅ / `ask_user(options)` ✅ → `gmail_draft` ✅ → `add_reminder` ✅. 🔧 `bills:add` and `bills:patch`
so the bill from the email becomes a row with its due date. 🔧 a script that sends the two demo emails on cue.

#### B2. The shared bill: pay it, split it, chase it

**Scene.** The Pacific Power bill (a normal month, $96) arrives. The routine "Split the power bill with the flat"
pays it from Bills and sends Maya, Jonah and Priya a PayPal request for $24 each with the bill PDF attached. Five
days later only Priya has paid. The routine sends the other two a PayPal reminder and tells Adi: *"Maya and Jonah
haven't paid their $24 for the power bill, I've sent them a reminder."* The Money page shows the bill as paid and the
three requests with their states: paid, reminded, reminded.

**Clever.** It's the whole life of a shared bill, not one payment. It knows who owes what from memory (the shares),
and it chases without being asked.

**Trace.** Email trigger ✅ → `pay_bill` ✅ → `request_money(3 people, note, attachment)` ✅ (attachments 🔧) → 5 days
later a schedule step `check invoices` 🔧 (invoice list in `@plex/paypal`) → `send reminder` 🔧 → `tell_user` ✅.
Webhook for "paid" needs hosted Convex.

#### B3. The biller that only has a portal

**Scene.** *"Brightline never emails me the bill. Every fifth, check my balance on their site and pay it if it's the
usual."* Plex compiles the routine. First run: the Plex browser opens Brightline's account page and hits the login.
The takeover card: **Sign in to Brightline in the Plex browser. Plex doesn't type passwords; sign in once and it keeps
the session.** Adi signs in, taps I've done it. The operator reads the balance ($62.14, usual $62), pays, reads the
confirmation. Next month there's no card at all: a pill, **Paid Brightline $62.14**, and the receipt.

**Clever.** Computer use that gets quieter with time: one hand-off, then it's hands-free. And it never sees the
password.

**Trace.** `create_routine` ✅ → schedule trigger, `runWhere: mac` ✅ → `operate(browser)` with `hand_over(login)` ✅
→ `pay_bill` → Payout → receipt ✅ → `operate(browser: mark paid, confirmation)` 🔧 the portal page. Two runs filmed
(first with the hand-off, the second silent) or the second one simulated by running it again.

*Also considered:* a cash-flow lookahead in the Friday check-in ("Bills pot has $1,210 but $1,968 is due in nine
days; top it up from Savings?"). Good as one line inside D3, not a scenario on its own.

### C. Creating a workflow

#### C1 (small business). "When a client pays me, set aside tax, pay Lena, log it."

**Scene.** *"Whenever one of my invoices gets paid, put thirty percent in Tax, pay Lena her thirty percent of the
rest, and add a row to my income sheet."* Plex: *"On it."* The confirm card shows the routine as When / If / Then:
**When** a PayPal invoice is paid · **If** Work has the money · **Then** move 30% to Tax → pay Lena Varga 30% of the
rest → add a row to "Income 2026" → tell you. Guardrail: Work pot, the pot's rules decide. *"Save it."* Then, on
camera, a client pays the sandbox invoice for $1,200. Within seconds the pill shows **Client paid $1,200 · $360 to Tax
· Lena paid $252**, the receipt slides in, and the row appears in Sheets on the second screen.

**Clever.** The money that comes in is split by rule the moment it lands. No bookkeeping on Sunday night.

**Trace.** `create_routine` → `compile` → `confirm_action` → `routines:saveFromBrain` ✅ → webhook
`INVOICING.INVOICE.PAID` → queued run ✅ → `move_between_pots` ✅ → `pay(send, Work, Lena, email from memory)` → Payout
→ receipt ✅ → `sheets_add_rows` ✅ → `tell_user` ✅. 🔧 Tax pot in the seed, hosted Convex for the webhook (or `Run now`
with a fake payload for rehearsal).

#### C2 (small business). Deposits for a photographer

**Scene.** Adi shoots portraits on weekends. *"When someone books a session on my calendar, send them a PayPal
invoice for a hundred-dollar deposit. If it isn't paid two days before, text me."* The When / If / Then card: **When**
every hour · **If** a calendar event titled "Session" has no deposit invoice yet · **Then** find the client's email in
the event → send a $100 PayPal invoice → add a note to the event → two days before, if unpaid, text you. Saved. A new
"Session: Dana Reyes" appears on the calendar; a minute later the pill says **Deposit invoice sent to Dana Reyes**, and
the calendar event gains "Deposit: requested".

**Clever.** The calendar becomes the booking system. No new tool for the client, no form.

**Trace.** `create_routine` ✅ (hourly schedule; there's no calendar trigger, and the check step filters) →
`google_calendar_events` or `calendar_events` ✅ → `request_money(1 person)` → Invoice ✅ → `calendar_add` 🔧 (needs
an "update event notes" tool, or `remember_this` that the deposit was requested) → later `check invoice paid` 🔧
(invoice status in `@plex/paypal`) → `send_imessage` ✅.

#### C3 (home or business). The receipts folder that does the bookkeeping

**Scene.** *"Whenever a receipt lands in my Receipts folder, read it and add it to my expenses sheet with the vendor,
date, amount and a category. If it's over two hundred, tell me."* Saved as a folder routine. Adi drags three PDFs into
`~/Documents/Receipts`: a hardware shop, a train ticket, a laptop stand. Three pills, three rows in Sheets, one note
on the notch: **Laptop stand $219 · over your $200 line**. Sheets on the second screen shows the three rows, category
filled in.

**Clever.** A folder on the Mac is the inbox. Vision reads the receipts; nothing is typed. It's the mundane thing
small businesses pay a bookkeeper for.

**Trace.** `create_routine` → folder trigger (the Mac watches it, `runWhere: mac`) ✅ → `folder_event` → run →
`read_file(pdf)` ✅ → `sheets_add_rows` ✅ → `tell_user` when over the line ✅. Everything exists; needs three receipt
PDFs as assets and Sheets connected.

*Also considered (home):* "On the 25th, request everyone's share of rent and utilities; on the 1st, pay Sam only if
everyone's paid, otherwise text me who hasn't." This is B2 plus the seeded rent routine; keep it as a spare.

### D. The star: everything together, autonomous, visual

#### D1. "How did I do this month, and what should I cut?"

**Scene.** Sunday. *"How did I do this month, and what should I cut?"* The **Insights** page opens in the main window
and fills in: a stat row (spent $2,318 · saved $240 · bills due $296), a donut by pot, a daily spend line with rent
labelled, and a grid of every receipt with the rule that let it through. Plex, out loud: *"Twenty-three eighteen,
eleven percent under October. Two things: Frame Studio is fifteen a month and you haven't opened it in seventy-four
days, and Cloudnest went from three to five dollars. Cancel Frame Studio and put Cloudnest back on the cheaper plan?"*
*"Do both."* The cancel confirm card → Allow → PayPal cancel → a system receipt. The Plex browser opens Cloudnest's
account page, hits the login, the takeover card appears, Adi signs in, taps I've done it, the operator downgrades the
plan after an `ask_permission`. A new stat tile: **Saving $17 a month**.

**Clever.** The analysis uses a signal only a Mac agent has (`app_usage`, the real last-opened date), the widgets are
generated for the question, and it finishes by acting with the right instrument for each: an API cancel for one, the
browser for the other.

**Trace.** `recent_money(30)` + `money_overview` + `app_usage([...])` ✅ → `build_insights(specs)` 🔧 (the worker emits
specs in the Ledger's typed vocabulary: stat, chart, grid; Convex stores them for the Mac's Insights page) → the Mac
renders them 🔧 → `cancel_subscription("Frame Studio")` ✅ → `operate(browser, hand_over login, downgrade)` ✅ with an
invented Cloudnest account page 🔧 → `tell_user` ✅.

#### D2. "Get me ready for my quarterly tax."

**Scene.** Adi, the freelancer, in early January. *"Get me ready for my quarterly estimated tax."* Insights fills
with a grid of every paid invoice this quarter by client, a column chart of income by month, a grid of deductible
expenses by category from the receipts, and a stat: **Set aside so far $2,340 · estimate due $2,760 · short $420**.
Plex: *"You billed nine thousand two hundred this quarter and two clients still owe you three thousand one hundred,
Dana Reyes forty days overdue. Your Tax pot is four hundred twenty short of the estimate. Want me to send Dana and
Marcus a reminder, move the four twenty from Work, and export the quarter as a PDF for your accountant?"* *"Yes."*
Two PayPal reminders go out, the pot move happens, a file card appears with the PDF, and a Reminder is set for the
15th. Plex read the due date off the web.

**Clever.** It joins PayPal invoices (income in), receipts (expenses out) and pots (what's set aside) into one answer
and then clears the whole to-do list, with the web search for the real deadline.

**Trace.** `list invoices` 🔧 (`@plex/paypal`) + `recent_money(90)` ✅ + `money_overview` ✅ → `build_insights` 🔧 →
`search_the_web("Q4 estimated tax due date")` ✅ → `confirm_action` ✅ → `send reminder` 🔧 → `move_between_pots` ✅ →
`save_file(pdf)` ✅ (🔧 a PDF export of the widgets, or a Sheets export via `sheets_create` ✅) → `add_reminder` ✅.

#### D3. "Plan my week's money."

**Scene.** Sunday evening. *"Plan my week."* Insights shows a week timeline: Thursday Northwave $84 and Maya's
birthday dinner, Friday the Tahoe trip, Saturday the pottery class; under it, the pots as bars. Plex: *"Food has
eighty-nine left for the week and you've got Maya's dinner Thursday, probably sixty. Shopping has forty-two and the
pottery class is sixty-five, so that'll ask you on Saturday. Northwave's eighty-four is covered. Suggest moving sixty
from Savings to Food and forty to Shopping, and I'll pay Northwave on Wednesday, two days early like you asked."*
*"Do it."* Two pot moves, a scheduled payment, and a Reminder: "Transfer back to Savings on the 1st". The timeline
updates.

**Clever.** Money and calendar in one picture. The plan comes from what's booked, what's due, the pot rules, and a
memory ("pay bills two days early"), and it names the moment a rule will ask before it happens.

**Trace.** `calendar_events(7)` ✅ + `money_overview` ✅ + `recall_memory("bills early")` ✅ → `build_insights(timeline,
bars)` 🔧 (a `timeline` widget kind, the notch already has a timeline card) → `confirm_action` ✅ →
`move_between_pots` ×2 ✅ → `create_routine("Wednesday, pay Northwave")` (once) ✅ → `add_reminder` ✅.

**Rendering Insights.** The Mac has no charts or grids. Two ways:
- **Native** (Swift Charts and `Table`): matches the window, no AG Grid.
- **Web view** of a new `/insights` route in `apps/web` that renders the same typed specs the web Ledger already
  renders with AG Grid and AG Charts. Interactive grids for free, one spec vocabulary across web and Mac, and the AG
  Grid sponsor prize stays in reach. **Recommended.** The Mac window hosts it in a `WKWebView` with Plex chrome
  around it; it is the user's own receipts, not the web app's tasks or causes.

### Recommended set for the video

A1 (class with the calendar check) · A2 (parking ticket from a photo) · B1 (utility guard) · B3 (portal biller with
one hand-off) · C1 (freelancer's invoice-paid chain) · C3 (receipts folder) · D1 (month review and cut) with D3's
week plan as the alternate star. A3, B2, C2 and D2 are spares that reuse the same build.

## 3. What to remove or hide in the Mac app

- The "Open the Ledger" button on Money and in Settings → replaced by the Insights page.
- Errands and Giving pots in `agent:snapshot` and the Mac's pot lists (they belong to the web's tasks and causes).
  Show Food, Shopping, Bills, Work, Savings, and Tax if C1 is in.
- Any mention of tasks, causes, proofs or the NGO in the Mac copy and seed activity rows.
- Composio catalog: show Gmail, Google Calendar, Google Sheets, Slack, Notion, Drive, Docs. Drop anything else the
  catalog lists that no scenario uses.
- Mac tools nothing uses on camera (Music now-playing, Maps ETA) can stay in code; they cost nothing. Only trim
  the Connections page copy if it lists them.
- Decide whether Activity stays as its own page or folds into Today. Today already shows recent activity; a separate
  Activity page is a long list. Recommendation: keep it, it's where run history across routines lives.

## 4. Order of work

1. **Pick the scenarios** (this doc): the recommended set at the end of §2, or your own mix.
2. **Make the stack run end to end once**, before new features: Convex + brain + Mac app, talk to it, pay the Northwave
   bill by voice, see the receipt. Fix what breaks. Decide hosted Convex vs tunnel for webhooks.
3. **Seed and sandbox**: Tax pot, home address memory, March lamp receipt, sandbox personal accounts for Maya, Jonah,
   Lena, Northlight, Sam; receipt photo and two bill PDFs as assets.
4. **Backend**: `bills:add` / `patch` for the agent; invoice list + reminder in `@plex/paypal` (B2 / D2 only);
   `insights` widget specs for the Mac user (reuse `ledgerSpec`, a `pin` scoped to Insights).
5. **Web**: the invented pages the chosen scenarios drive (a booking page, a city portal, a biller portal, a Cloudnest
   account page), each with a "Pay with Plex" reference that flips to paid when the receipt exists; the `/insights` route.
6. **Mac**: Insights page (web view), remove the web links, hide the web pots, polish the cards the scenarios use.
7. **Rehearse each scenario** with the real brain, time it, trim the prompts and the spoken lines, then film.

# Plex Ledger: how it uses AG Grid and AG Charts

The Ledger is where every Plex payment ends up: one place to ask "where did my money go, and what did it do?" It is built on **AG Grid Community 36** and **AG Charts Community 14**, themed to the Plex design system, with an agent that builds the views.

Code: `apps/web/src/components/ledger/` (UI) and `packages/backend/convex/ledger.ts`, `lib/ledgerSpec.ts`, `lib/ledgerAi.ts` (data and agents).

## Three dashboards, one data model

The Ledger has a role switch: **Personal** (pots, spending, splits), **Task poster** (money in each state, proof pass rates, top workers) and **Cause** (donation feed, shifts funded and paid, donor leaderboard). All three read the same `receipts` table, so a coffee an agent bought and a cleanup shift a donor funded show up in the same grid with the same columns: when, who, why (the user's own words), the rule that allowed it, the agent that acted, the state, the amount.

## The receipts grid

`receipts-grid.tsx` is the centerpiece. What it does with AG Grid:

- **Custom cell renderers for every column.** A party cell with an avatar and the payment kind, the user's "why" in quotes, the rule with a shield icon, the agent as a chip ("Claude (MCP)"), the receipt state as a colored pill, and a signed, tabular amount. No column is a plain string.
- **Quick filter** wired to the search box, plus an **external filter** for the state tabs (Held, Moved, Refunded, Disputed), each tab showing its live count.
- **A pinned bottom row** with the count and the net total of whatever is filtered.
- **Row click opens the full Receipt** in a side panel, with single-row selection kept in sync.
- **CSV export** of the current view.
- **Change highlighting**: when a PayPal webhook or a payout moves a receipt's state, the row flashes in place (Convex pushes the update live).
- **Measured before first paint**, so the grid fits its card at every width.

Only the modules the Ledger needs are registered (`ag.ts`), so the bundle stays small.

## Theming

`ag.ts` builds `plexGridTheme` with the **Theming API** (`themeQuartz.withParams`) from the app's own CSS tokens: canvas header, ink text, hairline rows, the database-green accent for focus and selection, and no wrapper border so the grid sits inside the app's cards. `plexChartTheme` does the same for AG Charts: the green scale for money that moved, steel blue for money that's held, the app's font and gridlines.

## Custom widgets

Built from AG Grid and AG Charts:

- **Pot gauges**: each pot's spend against its monthly limit, a ring plus an AG Charts sparkline of the last 14 days.
- **Spend by day**: a stacked AG Charts column chart by pot, pinnable.
- **Who owes what**: a dinner split as a scoreboard (who settled, who was nudged), not a collections report.
- **Top workers** (poster view): an AG Grid with rating, proof pass rate, an in-cell AG Charts trend of what they've been paid, and the total.
- **Money flow, proof wall and proof verdicts** (poster view): where every funded task's money is now, the submitted proof with its AI verdicts, and pass/fail/unsure counts in AG Charts.
- **Donation feed, donor leaderboard and shifts funded and done** (cause view): grids with custom cells, the feed flashing as gifts arrive.

## The agent team

- **Plex Analyst** (`lib/ledgerAi.ts`). "Ask the Ledger" sends the question to an agent that answers in a sentence and returns one or two **widget specs** from a closed vocabulary (`lib/ledgerSpec.ts`): a grid with columns, filter and sort, a chart with a type, grouping and measure, or a stat. The client renders the specs live with AG Grid and AG Charts over the viewer's own receipts. The agent never writes UI or queries, and the same pure functions run on the server, so the numbers in its answer match the widget. Pin a widget and it stays on that role's dashboard. Gemini (through the Vercel AI SDK) does the parsing with structured output; without a key a deterministic intent parser handles the demo questions, and the answer says so.
- **Watchdog** (`ledger.ts`). Watches the receipt stream that PayPal webhooks keep current and raises alerts a person would want: a refund spike, proofs failing in one neighborhood, a purchase far above the usual, a shift that's short of funding. Each alert is computed, not guessed, and carries the widget that shows it ("Show me").
- **Action tools.** Release, refund and send-a-reminder buttons on the Ledger are scoped by role and always confirm first. Today they record a hand-off; the live capture, payout and refund run from the task page.
- **Agent bridge.** `ledger.ask` accepts `via: "mcp"`, so a question an agent asks over MCP appears live on an open Ledger.

## Mapping to AG Studio

The widget specs map one to one onto AG Studio widget definitions (a grid with column defs and a filter model, a chart with a series and grouping), and `LEDGER_AGENT_TOOLS` names the tool surface (`create_widget`, `pin_widget`, `ask_ledger`) so the Analyst can run as a custom agent in the Studio Agent Framework. The runner is a plain function (question and scoped data in, typed result out) for that reason. Plex ships on the Community editions, so there's no watermark; an Enterprise license would add row grouping and master/detail through `AgGridProvider`.

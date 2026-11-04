# Plex: agents, with receipts

Your agents can spend money and hire people now. Plex keeps them inside limits you write in plain English, and makes sure every dollar they move comes with a **Receipt**: who it went to, why (in your own words), which rule allowed it, and the proof that the work was done.

Built on PayPal (sandbox) for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com).

## The problem

Agents got wallets this year, and they started hiring people. Two things are missing. People need **limits they can trust** before they let an agent spend, and anyone paying for work needs **proof before money moves**. Most of the marketplaces where agents hire people settle in crypto. Plex does both on ordinary PayPal money, with authorizations, captures, payouts and refunds.

## Who it's for

- **People who let agents spend for them.** Pots with plain-English limits, enforced in code, with approvals for anything over the line.
- **Anyone who needs something done**, a person or an agent: post a task, fund it, and pay only when the proof passes.
- **People who do the work**: take a task nearby, upload proof from a phone browser, get paid through PayPal Payouts.
- **Nonprofits and donors**: donations buy specific, paid shifts of local work, and every donor gets the proof back.

## What's in it

| Surface | What you can do |
|---|---|
| **Home** | What your agents moved this week, what's held until proof passes, approvals waiting for you, recent receipts. |
| **Pots & limits** | Write limits in plain English ("Up to $120 per purchase. Ask me before anything over $50."). The model turns them into structured rules once; `evaluate()` checks every payment in code. Try a purchase against your draft rules before saving. A Pause switch freezes all agent spending. |
| **Tasks** | Describe a task the way you'd text a friend. The **Task Writer** turns it into a card with a proof spec and a challenge word. Fund it through PayPal (an authorization, so you're charged only on approval). Workers apply; **Match** ranks them. The worker uploads proof; the **proof engine** checks each item, the time window, the location, the challenge word and photo originality. Approve, and Plex captures the payment and pays the worker by PayPal Payouts. Reject, and the worker can contest; a **Mediator** summarizes both sides. |
| **Causes** | Cause pages where a donation funds a specific shift of paid local work. Donate through PayPal (once, a shift, or split across causes). The money is held until the shift's proof passes, then released, and the donor gets a **Proof Reel**: the verified photos, who was paid, and their own receipt. A **cause page builder** turns an NGO's own text into a page and fundable shifts. |
| **Ledger** | Every receipt in one AG Grid, with Personal, Task poster and Cause dashboards. **Ask the Ledger** a question and the Analyst builds the grid or chart that answers it; **Watchdog** flags refund spikes, failing proofs in one area and unusual spending. See [docs/ag-grid.md](docs/ag-grid.md). |
| **Receipts** | Every receipt, and each one's full page: amount, parties, why, rule, evidence, timeline and PayPal IDs. |

**Plex for Mac** (a voice agent in the MacBook notch that shops and pays within your pots) is in progress. In the web app its purchases, approvals and dinner splits appear as seeded history.

## Try it

Plex opens in **guest mode**: choose **Continue as guest** and you are Adi, in a demo world with a few weeks of history. No account needed. On Tasks, the **Acting as** switch lets you play every side: Adi posting, a demo worker (Rosa, Luis…) applying and uploading proof, or the demo nonprofit, Lakeside Commons, approving its cleanup shifts.

To pay through PayPal you sign in on PayPal's sandbox checkout with a **sandbox personal account** (create one under *Sandbox accounts* in the [PayPal developer dashboard](https://developer.paypal.com/dashboard/accounts)). It's test money; nothing real moves.

All brands, people and the nonprofit in the demo are invented.

## Run it locally

Requires Node 20.19+ and pnpm 10. Convex runs as a local anonymous deployment, so no Convex account is needed.

```bash
pnpm install
pnpm dev          # Convex (local, :3210) + Next.js on http://localhost:3000
```

In a second terminal, give Convex your PayPal sandbox app's credentials (from *Apps & Credentials* in the developer dashboard), then seed the demo world:

```bash
cd packages/backend
npx convex env set PAYPAL_CLIENT_ID <sandbox client id>
npx convex env set PAYPAL_CLIENT_SECRET <sandbox secret>
npx convex env set PAYPAL_ENVIRONMENT sandbox
cd ../..
pnpm seed
```

Open http://localhost:3000 and choose **Continue as guest**. To rebuild the demo world from scratch: `pnpm --filter @plex/backend exec convex run seed:run '{"reset":true}'`.

Optional settings, all set the same way with `npx convex env set`:

| Variable | What it does |
|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Turns on Gemini for every agent. Without it, each agent falls back to a deterministic heuristic and says so on screen. |
| `PAYPAL_DEMO_PAYEE_EMAIL` | A sandbox personal account that receives the demo workers' payouts, so they complete instead of waiting unclaimed. Re-seed after setting it. |
| `PAYPAL_WEBHOOK_ID` | Verifies PayPal webhook signatures. Webhooks need a public URL; see [docs/paypal-webhooks.md](docs/paypal-webhooks.md). |

Checks: `pnpm typecheck`, `pnpm --filter @plex/web lint`, `pnpm --filter @plex/web build`.

## PayPal APIs used

Every call goes through one typed client, `packages/paypal`, from Convex actions, and every call that moves money writes or advances a Receipt (`convex/lib/receipts.ts`).

| API | Where |
|---|---|
| **Orders v2**: create (intent `AUTHORIZE`), get, authorize | Funding a task. The poster approves on PayPal's checkout; Plex authorizes on return (or on the `CHECKOUT.ORDER.APPROVED` webhook). |
| **Payments v2**: capture authorization, void authorization | Approving proof captures the held amount; cancelling a task voids the hold. |
| **Orders v2**: create (intent `CAPTURE`), capture | Donations on a cause page, including a gift split across causes. |
| **Payouts v1**: create batch, get batch | Paying the worker when their proof is approved, then tracking it until it lands. |
| **Payments v2**: refund capture | Returning captured task money when the work isn't done. |
| **Webhooks v1**: verify signature | `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.*` and `PAYMENT.PAYOUTS-ITEM.*` events advance tasks and receipts, idempotently. |

Verified live in the sandbox on Nov 5, 2026: a new task funded through buyer checkout (order `5JJ324734N7647452`), authorized (`3KF05293L76044005`), captured on approval (`9TH6991617033031K`) and paid out (batch `C56BA7SGG78VA`); a donation captured through a cause page (order `8WE71493UH389104V`) and released when its shift's payout went out.

**How held money works.** In the sandbox, Plex acts as the marketplace with its own business account: posters and donors pay Plex, and Plex pays workers through Payouts once the proof passes. Task funding uses authorize-then-capture, so the poster isn't charged until they approve. In production this would move to PayPal's multiparty (marketplace) setup with delayed disbursement, or Payouts with proper KYC. Seeded history carries placeholder `SEED-…` IDs and never calls PayPal.

## How the AI is used

The rule everywhere: **the model interprets, code decides.** Limits, proof thresholds and payouts are enforced by deterministic code; a persuasive prompt can't move money. Every agent uses structured output (zod schemas), and every one has a deterministic fallback so the demo works without a key; results are labeled with the model that produced them ("Gemini 2.5 Flash" or "Heuristic").

| Agent | What it does |
|---|---|
| **Rule writer** (`lib/policyAi.ts`) | Turns a pot's plain-English limits into structured rules, once. `lib/policy.ts` `evaluate()` enforces them on every payment. |
| **Task Writer** (`tasks.ts`) | Turns a loose request into a task card: title, place, window, payout and a proof spec. |
| **Match** (`applications.ts`) | Ranks applicants by distance, rating, proof record and their ask, and explains each pick. |
| **Proof engine** (`proofs.ts`) | Gemini vision checks each uploaded photo against the spec; code checks the time window, the location, the challenge word, and file fingerprints to catch a photo submitted before. Pass, fail or unsure, with reasons; unsure goes to a person. |
| **Mediator** (`proofs.ts`) | When a worker contests a rejection, summarizes both sides against the original spec. |
| **Cause page builder** and **Proof Reel captions** (`lib/causesAi.ts`) | Drafts a cause page and its paid shifts from an NGO's own words (factual, no guilt-trip copy, no invented numbers), and writes each donor's Reel caption from the receipts. It never generates images of the work. |
| **Plex Analyst** (`lib/ledgerAi.ts`) | Answers money questions on the Ledger with widget specs that AG Grid and AG Charts render. |
| **Watchdog** (`ledger.ts`) | Deterministic alerts over the receipt stream. |

## Tools used

- **Gemini 2.5 Flash** through the **Vercel AI SDK** (`ai`, `@ai-sdk/google`), inside Convex actions, with heuristic fallbacks.
- **PayPal REST APIs** (sandbox) through our own typed client; the **PayPal MCP server** to inspect sandbox state while building.
- **AG Grid** and **AG Charts** (Community) for the Ledger: [docs/ag-grid.md](docs/ag-grid.md).
- **Convex** for data, server functions, file storage, live queries and the webhook endpoint.
- **Next.js 16** (App Router, Cache Components), **React 19**, **Tailwind CSS v4**, **lucide-react** icons.
- **Clerk** for sign-in (wired; guest mode is the default, see `convex/auth.config.ts.example`).
- **Stageshow** (a Claude Code skill) for the landing page's product demos.
- **Claude Code** for building it.
- **OpenStreetMap** tiles for cause maps. The seeded Proof Reel uses two openly licensed stand-in photos, credited in [apps/web/public/demo/reel/CREDITS.md](apps/web/public/demo/reel/CREDITS.md).

## Repo

```
apps/web/          Next.js: landing, Home, Tasks, Causes, Ledger, Receipts, Pots
packages/backend/  Convex: schema, functions, receipts, policy engine, agents, seed (the demo world)
packages/paypal/   Typed PayPal client: the one place that calls PayPal
docs/              Plan, AG Grid write-up, webhook runbook
```

## License

[MIT](LICENSE)

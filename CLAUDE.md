# Plex

PayPal AI Hackathon entry: **agents, with receipts.** Product plan: [docs/Plex-Project-Plan.md](docs/Plex-Project-Plan.md). Requirements, judging and deadline (Nov 13, 2026, 1:30am IST): [HACKATHON.md](HACKATHON.md).

## Repo

```
apps/web/          Next.js 16 (App Router, cacheComponents), Tailwind v4: landing, Tasks, Causes, Ledger
apps/mcp/          Plex for Claude: an MCP server over the agent API
packages/backend/  Convex: schema, functions, receipts, policy engine, seed (the demo world)
packages/paypal/   Typed PayPal client: the one place that calls PayPal (fetch only, sandbox)
docs/              Plan and runbooks
```

- `pnpm dev` from the root starts Convex (a local anonymous deployment, no account needed) and Next on :3000.
- `pnpm start` (`scripts/start.sh`) starts Convex and Next on :3000 and seeds on the first run (`--no-web` for Convex only). Not `pnpm up`: that's pnpm's alias for update.
- `pnpm seed` creates the demo world. Rebuild it with `pnpm --filter @plex/backend exec convex run seed:run '{"reset":true}'`.
- Checks: `pnpm typecheck` (all packages) and `pnpm --filter @plex/web lint`, then `pnpm --filter @plex/web build`. Run all of them before every commit.
- Commit small and often, with Conventional Commits (`feat(tasks): …`, `fix(web): …`).

## Core ideas the code must keep

- **No money moves without a Receipt.** Every PayPal call that moves money writes or advances a `receipts` row through `convex/lib/receipts.ts` (`writeReceipt`, `advanceReceipt`), with `why` (the user's own words), `rule` and `evidence`. Show it with `ReceiptCard` / `ReceiptRow` from `apps/web/src/components/receipt/receipt.tsx`.
- **Limits are enforced in code.** The model only turns plain English into `rules` once; `convex/lib/policy.ts` `evaluate()` decides. Never let a prompt decide whether money may move.
- **Money is integer cents** everywhere. Format with `formatCents` / `<Amount>`.
- **Sign-in is required (for now).** `src/proxy.ts` sends signed-out visitors on app routes to `/sign-in`; only `/`, the auth pages and `/sites/*` are public. `getViewer(ctx)` in `convex/lib/viewer.ts` returns the signed-in user, or null. Guest mode (signed-out callers act as the seeded demo user Adi) comes back for the judges before the deadline: set `PLEX_GUEST_MODE=true` in Convex, make the proxy's routes public and restore the Continue as guest buttons.

## Backend conventions (Convex)

- One file per surface: `tasks.ts`, `causes.ts`, `ledger.ts`, `campaigns.ts`, … Shared helpers go in `convex/lib/`.
- The schema in `convex/schema.ts` is grouped by surface. Add tables or fields **at the end of your surface's section** only, to keep merges clean.
- PayPal calls run in Convex **actions** via `@plex/paypal` (`PayPalClient.fromEnv()`); they then call internal mutations to write state and receipts. Set the env vars in the Convex deployment: `pnpm --filter @plex/backend exec convex env set PAYPAL_CLIENT_ID …` (also `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT=sandbox`).
- AI uses **Gemini through the Vercel AI SDK** (`ai`, `@ai-sdk/google`) inside Convex actions, with `GOOGLE_GENERATIVE_AI_API_KEY` set in Convex. Use structured output (`generateObject` with zod) for anything the code acts on. When the key is missing, fall back to a deterministic heuristic so the demo still works, and label the result as such.
- Clerk auth is wired but off until keys exist: see `convex/auth.config.ts.example` and the providers in `apps/web/src/components/providers.tsx`.

## Web conventions (Next.js 16)

- Read `apps/web/node_modules/next/dist/docs/` before using an API you're unsure about. This Next has breaking changes: middleware is `src/proxy.ts`, and `cacheComponents` is on.
- App screens live under `src/app/(app)/<surface>/`. Each `page.tsx` is a small server file (metadata) that renders a `"use client"` view using Convex hooks. The `(app)` layout already renders pages client-only inside Suspense, so time-relative values and Convex data are safe there.
- Dynamic routes: don't `await params` at the top of a page. Pass the promise into `<Suspense>`: `{params.then(({ id }) => <View id={id} />)}` (see `receipts/[id]/page.tsx`).
- Outside `(app)` (for example the landing page), never call `Date.now()`, `Math.random()` or `new Date()` during render. Use `useHydrated()` from `components/client-only.tsx` or a Suspense boundary.
- Import the API as `import { api } from "@/lib/convex"`, with types `Doc` / `Id` from the same module.

## UI work

- **Whenever you build or change any UI, load the `stageshow` skill first and follow it.** That covers app screens, landing pages, hero and feature illustrations, bento grids, product demos and animations, and stills for the Devpost page and demo video.
- For marketing visuals and demo animations, follow its full workflow: start from the closest gold example, use its kit, and film the result with `--gate` before handing over.
- For the real, working app UI, apply its craft and framing rules (`references/craft.md`, `references/framing.md`): restraint, hierarchy, spacing, real icons, no stock AI sparkles or purple.
- **The web app is the product.** Plex for Mac and its Python brain were removed on 7 Nov 2026: no buyer-side API spends a consumer's PayPal wallet, so its purchase demo always ended in a hand-over, and the web app is what judges can open. Don't reintroduce a desktop client; agents reach Plex through the agent API and `apps/mcp`.
- **Design system:** light only. Tokens live in `apps/web/src/app/globals.css`: canvas `#f6f8f7`, ink, the brand mint→aqua scale (token names `green-*`, from the palette #EBFFFA #C6FCE5 #6EF3D6 #0DCEDA; fills 300–500 take ink text, never white; text on white uses 700/800) for money that moved, and metallic steel blue (`steel-*`, plus the `--metal` gradient) for money that's held and for the receipt's foil edge. Use the tokens, never raw hex.
- Use the primitives in `src/components/ui/` (`Button`, `Card`, `CardHeader`, `Badge`, `Avatar`, `Input`, `Textarea`, `Label`, `Skeleton`, `EmptyState`, `PageHeader`, `Amount`) before writing new ones. Icons: `lucide-react`, 16px, `strokeWidth={1.9}`, one set only.
- Button roles: `primary` (ink) for the main action, `brand` (green) only when money moves (fund, approve, release, donate), `secondary` and `ghost` for the rest.
- **Logo:** an aqua arc, a mint band and an ink corner, plus the "Plex" logotype. Files: `apps/web/public/brand/plex-logo.svg` (mark) and `plex-logo-full.svg`; the favicon is `apps/web/src/app/icon.svg`. Use `Wordmark` / `LogoMark` (`components/shell/wordmark.tsx`). Their ink parts take the text color, so the logo works on dark grounds. All brands, people and the NGO in the demo are invented.

## PayPal

- Sandbox only. Credentials go in `.env` (see `.env.example`) and in the Convex env, never in code or commits.
- Seeded PayPal IDs (`SEED-…`) are placeholders for history. New flows must create real sandbox orders, authorizations, captures, payouts and invoices.
- Use the local PayPal MCP tools (`mcp__paypal__*`, configured in `.mcp.json`) to inspect sandbox state while building. The hosted `plugin:paypal:paypal-sandbox` server currently fails every call.
- When the MCP token expires (401 errors), run `scripts/refresh-paypal-token.sh`, then restart the app.

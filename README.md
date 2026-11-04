# Plex — agents, with receipts

Your agents can now spend money and hire people. Plex makes sure every dollar they move comes with a receipt: who it went to, why, which rule allowed it, and the proof that the work was done. Built on PayPal (sandbox) for the PayPal AI Hackathon.

> Work in progress. The full write-up, tools used and PayPal API map come with the submission.

## Run it locally

Requires Node 20.19+ and pnpm 10.

```bash
pnpm install
cp .env.example .env          # PayPal sandbox Client ID and Secret
pnpm dev                      # Convex (local) + Next.js on http://localhost:3000
pnpm seed                     # in a second terminal: creates the demo world
```

Then open http://localhost:3000 and choose **Continue as guest**.

## Layout

- `apps/web`: Next.js app (Tasks, Causes, Ledger, landing)
- `packages/backend`: Convex schema and functions, receipts, policy engine, seed data
- `packages/paypal`: typed PayPal client (Orders, Payments, Payouts, Invoicing, Reporting, Webhooks)

## License

MIT

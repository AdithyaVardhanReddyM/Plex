import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, ReceiptText, ShieldCheck, Wallet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";
import { HeroWithReplay } from "@/components/marketing/hero-demo";
import { Bento } from "@/components/marketing/bento";

export const metadata: Metadata = {
  title: { absolute: "Plex · Agents, with receipts" },
};

const STEPS = [
  {
    icon: ShieldCheck,
    title: "Policy",
    body: "You write limits in plain English. Plex reads them once into rules, and code checks every payment against them.",
  },
  {
    icon: BadgeCheck,
    title: "Proof",
    body: "Work for hire is held until the proof passes: photos, a challenge code, the time and place.",
  },
  {
    icon: Wallet,
    title: "PayPal",
    body: "Money moves through PayPal: authorized up front, captured or paid out only when the rule and the proof agree.",
  },
  {
    icon: ReceiptText,
    title: "Receipt",
    body: "Every payment gets a receipt: who, how much, why in your words, the rule that allowed it, and the evidence.",
  },
];

const APIS = [
  { name: "Orders v2", use: "Authorize, then capture: task funding, agent checkout, donations" },
  { name: "Payouts", use: "Paying workers, creators and field partners when proof passes" },
  { name: "Invoicing", use: "Dinner splits and freelance-style tasks, with reminders" },
  { name: "Subscriptions", use: "Recurring donations and plans an agent may never start alone" },
  { name: "Refunds and Disputes", use: "Money returned when proof fails, disputes shown in the Ledger" },
  { name: "Webhooks", use: "Receipts advance as PayPal confirms each step" },
  { name: "Transaction Search", use: "Reconciling the Ledger against PayPal's own records" },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Plex home">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-1 text-[14px] text-muted md:flex">
            <a href="#surfaces" className="rounded-sm px-3 py-1.5 hover:text-ink">Surfaces</a>
            <a href="#how" className="rounded-sm px-3 py-1.5 hover:text-ink">How it works</a>
            <a href="#paypal" className="rounded-sm px-3 py-1.5 hover:text-ink">Built on PayPal</a>
          </nav>
          <Link href="/home" className={buttonVariants({ variant: "primary", size: "sm" })}>
            Continue as guest
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-[1180px] items-center gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_640px] lg:gap-14 lg:pt-20 lg:pb-24">
          <div className="max-w-xl">
            <div className="text-[13px] font-medium text-green-700">A money layer for agents, built on PayPal</div>
            <h1 className="mt-4 text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] text-ink sm:text-[60px]">
              Agents, with receipts.
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-muted sm:text-[18px]">
              Your agents can spend money and hire people. Plex keeps them inside limits you write in plain English, and
              every dollar they move comes with a receipt: who it went to, why, which rule allowed it, and the proof.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/home" className={buttonVariants({ variant: "primary", size: "lg" })}>
                Continue as guest <ArrowRight />
              </Link>
              <a href="#how" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                How it works
              </a>
            </div>
            <p className="mt-4 text-[13px] text-faint">No account needed. You explore the PayPal sandbox as Adi.</p>
          </div>
          <HeroWithReplay />
        </section>

        {/* Surfaces */}
        <section id="surfaces" className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-4 pb-24 sm:px-6">
          <SectionHead
            eyebrow="Four surfaces, one ledger"
            title="Spend, hire, give, and see where it all went."
            body="Every surface writes to the same receipts, so a coffee your agent bought and a cleanup shift you funded read the same way."
          />
          <div className="mt-10">
            <Bento />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-20 sm:px-6">
            <SectionHead
              eyebrow="How it works"
              title="No money moves without a receipt."
              body="The model reads your words once. After that, deciding whether money may move is plain code, and PayPal moves it."
            />
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative rounded-lg border border-line bg-canvas/60 p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-md bg-surface text-ink-2 shadow-card ring-1 ring-line">
                      <s.icon className="size-4" strokeWidth={1.9} />
                    </span>
                    <span className="tabular text-[13px] text-faint">0{i + 1}</span>
                  </div>
                  <div className="mt-5 text-[16px] font-semibold tracking-[-0.01em] text-ink">{s.title}</div>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Built on PayPal */}
        <section id="paypal" className="mx-auto grid w-full max-w-[1180px] scroll-mt-20 gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <SectionHead
            eyebrow="Built on PayPal"
            title="PayPal moves the money."
            body="Plex calls PayPal's REST APIs in the sandbox. Seeded history carries placeholder IDs, and no real money moves."
          />
          <dl className="divide-y divide-line rounded-lg border border-line bg-surface shadow-card">
            {APIS.map((a) => (
              <div key={a.name} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
                <dt className="text-[14px] font-medium text-ink">{a.name}</dt>
                <dd className="text-[14px] leading-relaxed text-muted">{a.use}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Close */}
        <section className="mx-auto w-full max-w-[1180px] px-4 pb-20 sm:px-6">
          <div className="grid-ground flex flex-col items-start gap-6 rounded-xl border border-line bg-surface px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <div>
              <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-ink">Try Plex as Adi.</h2>
              <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
                Approve a purchase, rewrite a limit, post a task, fund a cleanup shift. Sandbox money, real receipts.
              </p>
            </div>
            <Link href="/home" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Continue as guest <ArrowRight />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-2 px-4 py-8 text-[13px] text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Wordmark size={16} />
          <span>PayPal AI Hackathon 2026 · Sandbox only · All brands, people and the nonprofit are invented.</span>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-2xl">
      <div className="text-[13px] font-medium text-green-700">{eyebrow}</div>
      <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[36px]">{title}</h2>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";
import { PayByPayPal, SignIn, SiteButton, shortDate, useSiteState } from "./kit";

/** Brightline Mobile: a phone carrier whose bill lives only on its account page (invented). */
const ACCENT = "#e4572e";
const BALANCE = 6214;
const ACCOUNT = "88213-0042";

type State = { email?: string; step: "account" | "pay" | "done"; month?: string; paypalId?: string | null };
const INITIAL: State = { step: "account" };

export function Brightline() {
  const [s, set] = useSiteState<State>("brightline", INITIAL);
  const [now] = useState(() => Date.now());
  const month = new Date(now).toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  // A new month is a new bill.
  const step = s.month && s.month !== month ? "account" : s.step;
  const due = new Date(now);
  due.setDate(15);
  if (due.getTime() < now - 86_400_000 * 20) due.setMonth(due.getMonth() + 1);
  const reference = `BL-${ACCOUNT.slice(0, 5)}-${month}`;
  const onPaid = useCallback((paypalId: string | null) => set({ step: "done", paypalId, month }), [set, month]);

  return (
    <div className="min-h-dvh bg-[#f6f6f4] text-black">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex h-16 max-w-[920px] items-center justify-between px-6">
          <div className="text-[20px] font-bold tracking-tight">
            <span style={{ color: ACCENT }}>bright</span>line
          </div>
          <div className="flex items-center gap-5 text-[14px] text-black/60">
            <span>Plans</span>
            <span>Phones</span>
            <span className="font-medium text-black">{s.email ? "My account" : "Sign in"}</span>
            {s.email ? (
              <button type="button" className="text-[13px] text-black/50" onClick={() => set({ email: undefined })}>
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {!s.email ? (
        <SignIn brand="Brightline" accent={ACCENT} note="See your bill, pay it and manage your lines." onSignIn={(email) => set({ email })} />
      ) : (
        <main className="mx-auto max-w-[920px] px-6 py-10">
          <div className="text-[13px] text-black/55">Account {ACCOUNT} · Unlimited Plus, 2 lines</div>
          <div className="mt-1 text-[28px] font-semibold tracking-tight">Hi Adi</div>

          <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            {step === "done" ? (
              <section aria-label="Payment received" className="rounded-xl border border-black/10 bg-white p-6">
                <div className="text-[13px] font-semibold tracking-wide text-emerald-700 uppercase">Payment received</div>
                <div className="mt-1 text-[24px] font-semibold">You&apos;re all paid up</div>
                <dl className="mt-5 grid grid-cols-[140px_minmax(0,1fr)] gap-y-2.5 text-[14px]">
                  <dt className="text-black/55">Amount</dt><dd>$62.14 by PayPal</dd>
                  <dt className="text-black/55">Confirmation</dt>
                  <dd className="font-mono font-semibold">{(s.paypalId ?? reference).slice(-8).toUpperCase()}</dd>
                  <dt className="text-black/55">Balance now</dt><dd>$0.00</dd>
                </dl>
              </section>
            ) : step === "pay" ? (
              <PayByPayPal
                amountCents={BALANCE}
                payee="Brightline Mobile"
                email="billing@brightline.example.com"
                reference={reference}
                accent={ACCENT}
                onPaid={onPaid}
              />
            ) : (
              <section aria-label="Current bill" className="rounded-xl border border-black/10 bg-white p-6">
                <div className="text-[13px] font-semibold tracking-wide text-black/50 uppercase">Balance due</div>
                <div className="mt-1 text-[40px] font-semibold tracking-tight tabular-nums">$62.14</div>
                <div className="text-[14px] text-black/60">Due {shortDate(due.getTime())}</div>
                <SiteButton accent={ACCENT} className="mt-6" onClick={() => set({ step: "pay", month })}>
                  Pay bill
                </SiteButton>
              </section>
            )}

            <section aria-label="Bill history" className="rounded-xl border border-black/10 bg-white p-6">
              <div className="text-[15px] font-semibold">Past bills</div>
              <div className="mt-3 divide-y divide-black/10 text-[14px]">
                {[
                  ["October", "$62.00"],
                  ["September", "$61.80"],
                  ["August", "$62.40"],
                ].map(([m, a]) => (
                  <div key={m} className="flex items-center justify-between py-2.5">
                    <span>{m}</span>
                    <span className="tabular-nums">
                      {a} <span className="ml-2 text-[12px] text-emerald-700">Paid</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      )}
    </div>
  );
}

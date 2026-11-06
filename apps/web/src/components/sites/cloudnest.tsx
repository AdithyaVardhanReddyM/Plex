"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { SignIn, SiteButton, shortDate, useSiteState } from "./kit";
import { cn } from "@/lib/utils";

/** Cloudnest: cloud storage whose plan you change on its own site (invented). */
const ACCENT = "#2563c9";
const USED_GB = 38.2;
const PLANS = [
  { id: "basic", name: "Basic", gb: 50, price: "$2.99" },
  { id: "plus", name: "Plus", gb: 200, price: "$4.99" },
  { id: "pro", name: "Pro", gb: 2000, price: "$9.99" },
] as const;
type PlanId = (typeof PLANS)[number]["id"];

type State = { email?: string; plan: PlanId; pending?: PlanId; switchedAt?: number };
const INITIAL: State = { plan: "plus" };

export function Cloudnest() {
  const [s, set] = useSiteState<State>("cloudnest", INITIAL);
  const [choosing, setChoosing] = useState<PlanId | null>(null);
  const [now] = useState(() => Date.now());
  const nextBill = new Date(now);
  nextBill.setMonth(nextBill.getMonth() + 1, 1);
  const current = PLANS.find((p) => p.id === s.plan)!;
  const target = choosing ? PLANS.find((p) => p.id === choosing)! : null;

  return (
    <div className="min-h-dvh bg-[#f5f7fb] text-black">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex h-16 max-w-[920px] items-center justify-between px-6">
          <div className="text-[20px] font-semibold tracking-tight" style={{ color: ACCENT }}>
            cloudnest
          </div>
          <div className="flex items-center gap-5 text-[14px] text-black/60">
            <span>Files</span>
            <span>Photos</span>
            <span className="font-medium text-black">{s.email ? "Account" : "Sign in"}</span>
            {s.email ? (
              <button type="button" className="text-[13px] text-black/50" onClick={() => set({ email: undefined })}>
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {!s.email ? (
        <SignIn brand="Cloudnest" accent={ACCENT} onSignIn={(email) => set({ email })} />
      ) : (
        <main className="mx-auto max-w-[920px] px-6 py-10">
          <div className="text-[28px] font-semibold tracking-tight">Your plan</div>

          {s.switchedAt ? (
            <div role="status" className="mt-5 flex items-center gap-2.5 rounded-lg bg-emerald-50 px-4 py-3 text-[14px] text-emerald-800">
              <Check size={16} strokeWidth={2.2} />
              You&apos;re on {current.name} ({current.gb} GB, {current.price}/month) from {shortDate(nextBill.getTime())}.
            </div>
          ) : null}

          <section aria-label="Storage" className="mt-6 rounded-xl border border-black/10 bg-white p-6">
            <div className="flex items-baseline justify-between">
              <div className="text-[15px] font-semibold">Storage</div>
              <div className="text-[14px] text-black/60">
                {USED_GB} GB of {current.gb} GB used
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (USED_GB / current.gb) * 100)}%`, background: ACCENT }} />
            </div>
            <div className="mt-4 text-[14px] text-black/70">
              {current.name} plan · {current.price} a month
              {s.plan === "plus" && !s.switchedAt ? <span className="text-black/50"> (was $2.99 until October 1)</span> : null}
            </div>
          </section>

          <section aria-label="Plans" className="mt-6 grid gap-4 sm:grid-cols-3">
            {PLANS.map((p) => {
              const isCurrent = p.id === s.plan;
              const fits = USED_GB <= p.gb;
              return (
                <div key={p.id} className={cn("rounded-xl border bg-white p-5", isCurrent ? "border-black/40" : "border-black/10")}>
                  <div className="flex items-center justify-between">
                    <div className="text-[16px] font-semibold">{p.name}</div>
                    {isCurrent ? <span className="text-[12px] font-medium text-black/55">Current plan</span> : null}
                  </div>
                  <div className="mt-2 text-[24px] font-semibold tabular-nums">
                    {p.price}
                    <span className="text-[14px] font-normal text-black/55">/month</span>
                  </div>
                  <div className="text-[13.5px] text-black/60">{p.gb >= 1000 ? `${p.gb / 1000} TB` : `${p.gb} GB`} of storage</div>
                  {!isCurrent ? (
                    <SiteButton
                      accent={ACCENT}
                      variant="outline"
                      className="mt-4 w-full"
                      disabled={!fits}
                      onClick={() => setChoosing(p.id)}
                      aria-label={`Switch to ${p.name}`}
                    >
                      {fits ? `Switch to ${p.name}` : "Too small for your files"}
                    </SiteButton>
                  ) : null}
                </div>
              );
            })}
          </section>

          {target ? (
            <div role="dialog" aria-label={`Switch to ${target.name}?`} className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-6">
              <div className="w-full max-w-[420px] rounded-xl bg-white p-6 shadow-xl">
                <div className="text-[18px] font-semibold">Switch to {target.name}?</div>
                <p className="mt-2 text-[14px] leading-relaxed text-black/70">
                  You&apos;ll pay {target.price} a month from {shortDate(nextBill.getTime())}. Your {USED_GB} GB fits in{" "}
                  {target.gb} GB, and nothing is deleted.
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <SiteButton accent={ACCENT} variant="outline" onClick={() => setChoosing(null)}>
                    Cancel
                  </SiteButton>
                  <SiteButton
                    accent={ACCENT}
                    onClick={() => {
                      set({ plan: target.id, switchedAt: Date.now() });
                      setChoosing(null);
                    }}
                  >
                    Switch plan
                  </SiteButton>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      )}
    </div>
  );
}

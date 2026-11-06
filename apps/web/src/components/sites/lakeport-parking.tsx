"use client";

import { useCallback, useMemo, useState } from "react";
import { Field, PayByPayPal, SiteButton, shortDate, useSiteState } from "./kit";

/** The City of Lakeport's parking citation portal (an invented city). */
const NAVY = "#1d3557";

/** The citations the portal knows about, by number. Days are relative to the first visit. */
const CITATIONS: Record<string, { plate: string; violation: string; where: string; amountCents: number; issuedDaysAgo: number; dueInDays: number }> = {
  "LP-4417-2290": {
    plate: "8KDN042",
    violation: "Expired meter",
    where: "2100 block of Harbor Avenue",
    amountCents: 6800,
    issuedDaysAgo: 2,
    dueInDays: 13,
  },
};
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

type State = {
  step: "lookup" | "found" | "pay" | "done";
  citation: string;
  plate: string;
  firstSeen?: number;
  paypalId?: string | null;
};
const INITIAL: State = { step: "lookup", citation: "", plate: "" };

export function LakeportParking({ view }: { view?: string }) {
  const [s, set, reset] = useSiteState<State>("lakeport", INITIAL);
  const [now] = useState(() => Date.now());
  const base = s.firstSeen ?? now;
  const [error, setError] = useState<string | null>(null);
  const number = Object.keys(CITATIONS).find((k) => norm(k) === norm(s.citation));
  const c = number ? CITATIONS[number] : undefined;
  const issued = base - (c?.issuedDaysAgo ?? 0) * 86_400_000;
  const due = base + (c?.dueInDays ?? 0) * 86_400_000;
  const onPaid = useCallback((paypalId: string | null) => set({ step: "done", paypalId }), [set]);
  const confirmation = useMemo(() => (s.paypalId ? s.paypalId.slice(-6).toUpperCase() : "LKP" + norm(s.citation).slice(-4)), [s.paypalId, s.citation]);

  if (view === "ticket") return <Ticket now={now} />;

  return (
    <div className="min-h-dvh bg-[#f3f5f8] text-black">
      <header style={{ background: NAVY }} className="text-white">
        <div className="mx-auto flex h-16 max-w-[880px] items-center justify-between px-6">
          <div>
            <div className="text-[12px] tracking-[0.12em] text-white/70 uppercase">City of Lakeport</div>
            <div className="text-[17px] font-semibold">Parking citations</div>
          </div>
          <div className="text-[13px] text-white/75">Pay · Contest · Payment plans</div>
        </div>
      </header>
      <main className="mx-auto max-w-[880px] px-6 py-10">
        {s.step === "lookup" ? (
          <form
            aria-label="Find your citation"
            className="rounded-lg border border-black/10 bg-white p-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (!c || norm(c.plate) !== norm(s.plate)) {
                setError("We couldn't find a citation with that number and plate. Check both and try again.");
                return;
              }
              setError(null);
              set({ step: "found", citation: number!, firstSeen: s.firstSeen ?? now });
            }}
          >
            <div className="text-[20px] font-semibold">Pay a parking citation</div>
            <p className="mt-1 text-[14px] text-black/60">The citation number is at the top right of your ticket.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field id="lp-citation" label="Citation number" value={s.citation} onChange={(citation) => set({ citation })} />
              <Field id="lp-plate" label="License plate" value={s.plate} onChange={(plate) => set({ plate })} />
            </div>
            {error ? <p role="alert" className="mt-4 text-[14px] text-red-700">{error}</p> : null}
            <SiteButton accent={NAVY} type="submit" className="mt-6">Look up citation</SiteButton>
          </form>
        ) : null}

        {(s.step === "found" || s.step === "pay") && c ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-label="Citation details" className="rounded-lg border border-black/10 bg-white p-6">
              <div className="text-[13px] font-semibold tracking-wide text-black/50 uppercase">Citation {number}</div>
              <dl className="mt-4 grid grid-cols-[130px_minmax(0,1fr)] gap-y-2.5 text-[14px]">
                <dt className="text-black/55">Plate</dt><dd className="font-mono">{c.plate} (CA)</dd>
                <dt className="text-black/55">Violation</dt><dd>{c.violation}</dd>
                <dt className="text-black/55">Location</dt><dd>{c.where}</dd>
                <dt className="text-black/55">Issued</dt><dd>{shortDate(issued)}</dd>
                <dt className="text-black/55">Amount due</dt><dd className="font-semibold">$68.00</dd>
                <dt className="text-black/55">Pay by</dt><dd>{shortDate(due)}</dd>
              </dl>
              <p className="mt-5 rounded-md bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900">
                After {shortDate(due)} the fine doubles to $136.00.
              </p>
              {s.step === "found" ? (
                <div className="mt-6 flex gap-3">
                  <SiteButton accent={NAVY} onClick={() => set({ step: "pay" })}>Pay $68.00</SiteButton>
                  <SiteButton accent={NAVY} variant="outline" onClick={reset}>Not my citation</SiteButton>
                </div>
              ) : null}
            </section>
            {s.step === "pay" ? (
              <PayByPayPal
                amountCents={c.amountCents}
                payee="City of Lakeport Parking"
                email="citations@lakeport.example.com"
                reference={number!}
                accent={NAVY}
                onPaid={onPaid}
              />
            ) : null}
          </div>
        ) : null}

        {s.step === "done" && c ? (
          <section aria-label="Payment confirmation" className="rounded-lg border border-black/10 bg-white p-6">
            <div className="text-[13px] font-semibold tracking-wide text-emerald-700 uppercase">Paid in full</div>
            <div className="mt-1 text-[24px] font-semibold">Citation {number} is closed</div>
            <dl className="mt-5 grid grid-cols-[150px_minmax(0,1fr)] gap-y-2.5 text-[14px]">
              <dt className="text-black/55">Confirmation</dt><dd className="font-mono font-semibold">{confirmation}</dd>
              <dt className="text-black/55">Amount paid</dt><dd>$68.00 by PayPal</dd>
              <dt className="text-black/55">Plate</dt><dd className="font-mono">{c.plate}</dd>
              <dt className="text-black/55">Paid on</dt><dd>{shortDate(now)}</dd>
            </dl>
            <p className="mt-5 text-[13.5px] text-black/60">Keep this page for your records. No further action is needed.</p>
            <button type="button" onClick={reset} className="mt-5 text-[13px] font-medium" style={{ color: NAVY }}>
              Pay another citation
            </button>
          </section>
        ) : null}
      </main>
    </div>
  );
}

/** The paper ticket itself (`?view=ticket`), to photograph or drop on Plex. */
function Ticket({ now }: { now: number }) {
  const issued = now - 2 * 86_400_000;
  const due = now + 13 * 86_400_000;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#d9d4c7] p-10">
      <div className="w-[380px] rotate-[-1.5deg] bg-[#fffdf5] p-6 font-mono text-[13px] text-black shadow-xl">
        <div className="flex items-start justify-between border-b-2 border-black pb-3">
          <div>
            <div className="text-[11px] tracking-[0.2em] uppercase">City of Lakeport</div>
            <div className="text-[16px] font-bold">Notice of parking violation</div>
          </div>
          <div className="text-right text-[11px]">CITATION NO.<div className="text-[15px] font-bold">LP-4417-2290</div></div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-y-1.5">
          <span>DATE</span><span>{shortDate(issued)}</span>
          <span>PLATE / STATE</span><span>8KDN042 / CA</span>
          <span>MAKE</span><span>HONDA</span>
          <span>LOCATION</span><span>2100 HARBOR AVE</span>
          <span>VIOLATION</span><span>EXPIRED METER</span>
        </div>
        <div className="mt-4 border-y-2 border-black py-2 text-[18px] font-bold">AMOUNT DUE $68.00</div>
        <div className="mt-2 text-[12px] leading-snug">
          PAY BY {shortDate(due).toUpperCase()}. AFTER THIS DATE THE PENALTY DOUBLES TO $136.00. PAY ONLINE AT LAKEPORT CITY
          PARKING CITATIONS.
        </div>
      </div>
    </div>
  );
}

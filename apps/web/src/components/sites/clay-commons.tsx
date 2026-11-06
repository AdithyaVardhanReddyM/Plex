"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarDays, Clock, MapPin } from "lucide-react";
import { Field, PayByPayPal, SiteButton, longDate, newReference, nextWeekday, useSiteState } from "./kit";

/** Clay Commons: a community pottery studio's class booking (invented). */
const ACCENT = "#b4532a";
const PRICE = 6500;
const ADDRESS = "1418 Alder Street, Oakland, CA 94607";
const SESSIONS = [
  { id: "am", label: "10:00 am – 12:00 pm", start: 10, spots: 3 },
  { id: "pm", label: "2:00 pm – 4:00 pm", start: 14, spots: 6 },
] as const;

type State = {
  step: "pick" | "details" | "pay" | "done";
  session?: string;
  name: string;
  email: string;
  reference?: string;
  paypalId?: string | null;
};
const INITIAL: State = { step: "pick", name: "", email: "" };

export function ClayCommons() {
  const [s, set, reset] = useSiteState<State>("claycommons", INITIAL);
  const [now] = useState(() => Date.now());
  const day = useMemo(() => nextWeekday(6, now), [now]);
  const session = SESSIONS.find((x) => x.id === s.session);
  const onPaid = useCallback((paypalId: string | null) => set({ step: "done", paypalId }), [set]);

  return (
    <div className="min-h-dvh bg-[#faf6f1] text-black">
      <header className="border-b border-black/10 bg-[#faf6f1]">
        <div className="mx-auto flex h-16 max-w-[960px] items-center justify-between px-6">
          <div className="font-serif text-[22px] font-semibold tracking-tight" style={{ color: ACCENT }}>
            Clay Commons
          </div>
          <nav className="flex gap-6 text-[14px] text-black/60">
            <span className="font-medium text-black">Classes</span>
            <span>Open studio</span>
            <span>Gift cards</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[960px] px-6 py-10">
        <div className="text-[13px] font-medium tracking-wide text-black/50 uppercase">Beginner class</div>
        <div className="mt-1 font-serif text-[34px] leading-tight font-semibold tracking-tight">Wheel throwing, Saturday</div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-black/65">
          <span className="flex items-center gap-1.5"><CalendarDays size={16} strokeWidth={1.9} />{longDate(day)}</span>
          <span className="flex items-center gap-1.5"><Clock size={16} strokeWidth={1.9} />2 hours, clay and firing included</span>
          <span className="flex items-center gap-1.5"><MapPin size={16} strokeWidth={1.9} />{ADDRESS}</span>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            {s.step === "pick" ? (
              <section aria-label="Sessions" className="flex flex-col gap-3">
                {SESSIONS.map((x) => (
                  <div key={x.id} className="flex items-center justify-between gap-4 rounded-xl border border-black/10 bg-white px-5 py-4">
                    <div>
                      <div className="text-[16px] font-semibold">{x.label}</div>
                      <div className="text-[13px] text-black/55">{x.spots} spots left · $65 per person</div>
                    </div>
                    <SiteButton accent={ACCENT} onClick={() => set({ step: "details", session: x.id })} aria-label={`Book ${x.label}`}>
                      Book
                    </SiteButton>
                  </div>
                ))}
              </section>
            ) : null}

            {s.step === "details" && session ? (
              <form
                aria-label="Your details"
                className="rounded-xl border border-black/10 bg-white p-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (s.name.trim() && s.email.includes("@")) set({ step: "pay", reference: s.reference ?? newReference("CC") });
                }}
              >
                <div className="text-[16px] font-semibold">Your details</div>
                <div className="mt-1 text-[13.5px] text-black/60">{longDate(day)}, {session.label}</div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field id="cc-name" label="Full name" value={s.name} onChange={(name) => set({ name })} autoComplete="name" />
                  <Field id="cc-email" label="Email" type="email" value={s.email} onChange={(email) => set({ email })} autoComplete="email" />
                </div>
                <div className="mt-6 flex gap-3">
                  <SiteButton accent={ACCENT} type="submit">Continue to payment</SiteButton>
                  <SiteButton accent={ACCENT} variant="outline" onClick={() => set({ step: "pick" })}>Back</SiteButton>
                </div>
              </form>
            ) : null}

            {s.step === "pay" && session && s.reference ? (
              <PayByPayPal
                amountCents={PRICE}
                payee="Clay Commons Studio"
                email="bookings@claycommons.example.com"
                reference={s.reference}
                accent={ACCENT}
                onPaid={onPaid}
              />
            ) : null}

            {s.step === "done" && session ? (
              <section aria-label="Booking confirmed" className="rounded-xl border border-black/10 bg-white p-6">
                <div className="text-[13px] font-semibold tracking-wide text-emerald-700 uppercase">You&apos;re booked</div>
                <div className="mt-1 font-serif text-[26px] font-semibold">See you {longDate(day)}</div>
                <dl className="mt-5 grid grid-cols-[130px_minmax(0,1fr)] gap-y-2.5 text-[14px]">
                  <dt className="text-black/55">Confirmation</dt><dd className="font-mono font-semibold">{s.reference}</dd>
                  <dt className="text-black/55">When</dt><dd>{session.label}</dd>
                  <dt className="text-black/55">Where</dt><dd>{ADDRESS}</dd>
                  <dt className="text-black/55">Name</dt><dd>{s.name}</dd>
                  <dt className="text-black/55">Paid</dt><dd>$65.00 by PayPal</dd>
                </dl>
                <p className="mt-5 rounded-lg bg-[#faf6f1] px-4 py-3 text-[14px] text-black/75">
                  Bring an apron and keep your nails short. Free cancellation until Thursday at 6 pm.
                </p>
                <button type="button" onClick={reset} className="mt-5 text-[13px] font-medium" style={{ color: ACCENT }}>
                  Book another class
                </button>
              </section>
            ) : null}
          </div>

          <aside className="h-fit rounded-xl border border-black/10 bg-white p-5 text-[14px] text-black/70">
            <div className="font-semibold text-black">What to expect</div>
            <p className="mt-2 leading-relaxed">
              Two hours on the wheel with Mara, our head potter. You&apos;ll center, open and pull your first cylinders, and we
              fire your best piece for pickup two weeks later.
            </p>
            <div className="mt-4 border-t border-black/10 pt-4 text-[13px]">Small groups of eight. No experience needed.</div>
          </aside>
        </div>
      </main>
    </div>
  );
}

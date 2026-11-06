"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Check, Loader2 } from "lucide-react";
import { api } from "@/lib/convex";
import { cn, formatCents } from "@/lib/utils";

/**
 * Shared parts for the invented merchant sites in the demo world (`/sites/*`, also served at
 * `<site>.localhost:3000`). They are other companies' pages that Plex's operator drives in its own
 * browser: a booking, a city's citation portal, a biller's account, a cloud plan. None of them
 * takes card details. They ask to be paid by PayPal with a reference, the way a small business
 * shares its PayPal email, and see the payment arrive through `merchants:paymentFor`.
 */

/** A site's own state (signed in, the step it's on), kept in this browser like a real site's session. */
export function useSiteState<T extends object>(site: string, initial: T): [T, (patch: Partial<T>) => void, () => void] {
  const key = `plex-site:${site}`;
  const [state, setState] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? { ...initial, ...(JSON.parse(raw) as Partial<T>) } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // private window: the session lasts as long as the tab
    }
  }, [key, state]);
  const patch = useCallback((p: Partial<T>) => setState((s) => ({ ...s, ...p })), []);
  const reset = useCallback(() => setState(initial), [initial]);
  return [state, patch, reset];
}

/** A short reference like "CC-4821", made once per order. */
export function newReference(prefix: string) {
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/** The next given weekday (6 = Saturday) at noon local time, as ms. */
export function nextWeekday(day: number, from = Date.now()) {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7 || 7));
  return d.getTime();
}

export const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
export const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * "Pay by PayPal": who to pay, how much and the reference to put on it, then a live status that
 * turns to Received when a PayPal payment with that reference arrives.
 */
export function PayByPayPal({
  amountCents,
  payee,
  email,
  reference,
  accent,
  onPaid,
}: {
  amountCents: number;
  payee: string;
  email: string;
  reference: string;
  accent: string;
  onPaid: (paypalId: string | null) => void;
}) {
  const payment = useQuery(api.merchants.paymentFor, { reference });
  const paid = payment && payment.amountCents >= amountCents;
  useEffect(() => {
    if (paid) {
      const t = setTimeout(() => onPaid(payment.paypalId), 900);
      return () => clearTimeout(t);
    }
  }, [paid, payment, onPaid]);

  return (
    <section aria-label="Payment" className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="text-[13px] font-semibold tracking-wide text-black/50 uppercase">Pay by PayPal</div>
      <div className="mt-2 text-[28px] font-semibold tracking-tight text-black tabular-nums">{formatCents(amountCents)}</div>
      <dl className="mt-5 grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-3 text-[14px]">
        <dt className="text-black/55">Pay to</dt>
        <dd className="min-w-0">
          <div className="font-medium text-black">{payee}</div>
          <div className="truncate text-black/70" aria-label="PayPal email">{email}</div>
        </dd>
        <dt className="text-black/55">Reference</dt>
        <dd>
          <span className="rounded-md bg-black/[0.05] px-2 py-1 font-mono text-[14px] font-semibold text-black" aria-label="Payment reference">
            {reference}
          </span>
          <div className="mt-1.5 text-[12.5px] text-black/55">Put this in the payment&apos;s note so we can match it.</div>
        </dd>
      </dl>
      <div
        role="status"
        className={cn(
          "mt-6 flex items-center gap-2.5 rounded-lg px-3.5 py-3 text-[14px]",
          paid ? "bg-emerald-50 text-emerald-800" : payment ? "bg-amber-50 text-amber-800" : "bg-black/[0.035] text-black/70",
        )}
      >
        {paid ? (
          <Check size={16} strokeWidth={2.2} />
        ) : (
          <Loader2 size={16} strokeWidth={2} className="animate-spin" style={{ color: accent }} />
        )}
        {paid
          ? `Payment received: ${formatCents(payment.amountCents)} by PayPal`
          : payment
            ? `We received ${formatCents(payment.amountCents)}; ${formatCents(amountCents - payment.amountCents)} is still due`
            : "Waiting for your payment. This page updates on its own when it arrives."}
      </div>
    </section>
  );
}

/** A plain sign-in form. Any email and password work in the demo; nothing is sent anywhere. */
export function SignIn({
  brand,
  accent,
  onSignIn,
  note,
}: {
  brand: string;
  accent: string;
  onSignIn: (email: string) => void;
  note?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form
      aria-label={`Sign in to ${brand}`}
      className="mx-auto mt-14 w-full max-w-[380px] rounded-xl border border-black/10 bg-white p-7 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim() && password) onSignIn(email.trim());
      }}
    >
      <div className="text-[20px] font-semibold tracking-tight text-black">Sign in to {brand}</div>
      {note ? <p className="mt-1.5 text-[13.5px] text-black/60">{note}</p> : null}
      <label className="mt-6 block text-[13px] font-medium text-black/70" htmlFor="site-email">
        Email
      </label>
      <input
        id="site-email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1.5 h-10 w-full rounded-lg border border-black/15 px-3 text-[14px] outline-none focus:border-black/40"
      />
      <label className="mt-4 block text-[13px] font-medium text-black/70" htmlFor="site-password">
        Password
      </label>
      <input
        id="site-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-1.5 h-10 w-full rounded-lg border border-black/15 px-3 text-[14px] outline-none focus:border-black/40"
      />
      <label className="mt-4 flex items-center gap-2 text-[13px] text-black/65">
        <input type="checkbox" defaultChecked className="size-4" /> Keep me signed in
      </label>
      <button
        type="submit"
        className="mt-6 h-10 w-full rounded-lg text-[14px] font-semibold text-white"
        style={{ background: accent }}
      >
        Sign in
      </button>
    </form>
  );
}

export function SiteButton({
  children,
  accent,
  className,
  variant = "solid",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { accent: string; variant?: "solid" | "outline" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-semibold whitespace-nowrap",
        variant === "solid" ? "text-white" : "border border-black/15 bg-white text-black",
        className,
      )}
      style={variant === "solid" ? { background: accent } : undefined}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-black/70" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-[14px] outline-none focus:border-black/40"
      />
    </div>
  );
}

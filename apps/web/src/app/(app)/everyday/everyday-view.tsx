"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BellRing, CalendarDays, CalendarPlus, CircleAlert, Clock, Loader2, Mail, PenLine, RefreshCw, Send, ShieldCheck, Unplug } from "lucide-react";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Input, Label, PageHeader, Skeleton, Switch, Textarea } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { AutoPayCard } from "@/components/money/autopay-card";
import { useAs } from "@/components/tasks/persona";
import { CheckList, errorMessage, verdictRows } from "@/components/tasks/task-ui";
import { cn, formatCents, relativeTime } from "@/lib/utils";

type Bill = FunctionReturnType<typeof api.everyday.bills>[number];
type Plan = FunctionReturnType<typeof api.everyday.planEvent>;
type Cal = NonNullable<FunctionReturnType<typeof api.everyday.calendar>>;

const STATUS: Record<Bill["status"], { label: string; tone: "neutral" | "green" | "steel" | "amber" | "red" }> = {
  not_a_bill: { label: "Not a bill", tone: "neutral" },
  needs_approval: { label: "Needs you", tone: "amber" },
  paying: { label: "Paying", tone: "steel" },
  paid: { label: "Paid", tone: "green" },
  declined: { label: "Declined", tone: "neutral" },
};

/** Everyday: Plex watches Gmail for bills (paying the safe ones by itself) and keeps Google Calendar. */
export function EverydayView() {
  const as = useAs();
  const o = useQuery(api.everyday.overview, { as });
  const bills = useQuery(api.everyday.bills, { as });
  const connect = useAction(api.everyday.connectStart);
  const confirmCheckout = useAction(api.everyday.confirmCheckout);
  const [busy, setBusy] = useState<string>();
  const [flash, setFlash] = useState<{ ok: boolean; text: string }>();

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setFlash(undefined);
    try {
      await fn();
    } catch (err) {
      setFlash({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(undefined);
    }
  }

  // Back from Google (connect) or from PayPal (a bill's checkout).
  const returned = useRef(false);
  useEffect(() => {
    if (returned.current) return;
    const p = new URLSearchParams(window.location.search);
    const google = p.get("google");
    const bill = p.get("bill") as Id<"gmailBills"> | null;
    const paypal = p.get("paypal");
    if (!google && !bill) return;
    returned.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    queueMicrotask(() => {
      if (google)
        setFlash(
          google === "connected"
            ? { ok: true, text: "Google is connected. Plex is reading your recent email for bills now." }
            : { ok: false, text: google === "cancelled" ? "You cancelled at Google. Nothing was connected." : "Google didn't finish connecting. Try again." },
        );
      if (bill && paypal === "return")
        void run("checkout", async () => {
          await confirmCheckout({ billId: bill, as });
          setFlash({ ok: true, text: "Paid. The receipt is in your ledger." });
        });
      if (bill && paypal === "cancel") setFlash({ ok: false, text: "You cancelled at PayPal. The bill is still waiting." });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const waiting = (bills ?? []).filter((b) => b.status === "needs_approval");
  const paid = (bills ?? []).filter((b) => b.status === "paid");

  return (
    <div className="animate-rise">
      <PageHeader
        title="Everyday"
        description="Plex watches your Gmail for bills, sends your invoices through PayPal and keeps your Google Calendar. A bill pays itself only when every check passes; anything new, large or unclear waits for one tap, with the reason."
      />

      {flash ? (
        <p className={cn("mb-5 flex items-start gap-2 text-[13px]", flash.ok ? "text-green-800" : "text-disputed")} role="status">
          {flash.ok ? <ShieldCheck className="mt-px size-4 flex-none" strokeWidth={1.9} /> : <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} />}
          {flash.text}
        </p>
      ) : null}

      {o === undefined ? (
        <Skeleton className="h-[320px] w-full rounded-lg" />
      ) : o === null ? null : !o.connected ? (
        <ConnectCard ready={o.ready} busy={busy === "connect"} onConnect={() => run("connect", async () => window.location.assign((await connect({ origin: window.location.origin, as })).url))} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6">
              <div className="text-[13px] font-medium text-ink-2">Waiting for you</div>
              <div className="mt-3 font-display text-[44px] leading-none font-extrabold tracking-[-0.04em] text-ink tabular">{bills === undefined ? "–" : waiting.length}</div>
              <div className="mt-2 text-[12.5px] text-muted">
                {waiting.length ? `${formatCents(waiting.reduce((s, b) => s + (b.amountCents ?? 0), 0))} in bills to approve` : "Nothing to approve"}
              </div>
            </Card>
            <Card className="p-6">
              <div className="text-[13px] font-medium text-ink-2">Paid from Gmail</div>
              <Amount cents={paid.reduce((s, b) => s + (b.amountCents ?? 0), 0)} size="xl" className="mt-3 block" />
              <div className="mt-2 text-[12.5px] text-muted">
                {paid.length} bill{paid.length === 1 ? "" : "s"} · {paid.filter((b) => b.autoPay).length} paid by themselves
              </div>
            </Card>
            <WatchCard o={o} />
          </div>

          {!o.autoPayOn ? <AutoPayCard returnPath="/everyday" className="mt-4" /> : null}

          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <section>
              <h2 className="mb-3 font-display text-[18px] font-bold tracking-[-0.02em] text-ink">Bills from Gmail</h2>
              {bills === undefined ? (
                <Skeleton className="h-40 w-full rounded-lg" />
              ) : bills.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<Mail />}
                    title="No bills yet"
                    body="Plex checks your inbox every 2 minutes for invoices and bills from the last week. Email yourself an invoice to try it."
                    className="py-10"
                  />
                </Card>
              ) : (
                <div className="grid gap-4">
                  {bills.map((b) => (
                    <BillCard key={b._id} bill={b} />
                  ))}
                </div>
              )}
            </section>
            <section>
              <h2 className="mb-3 font-display text-[18px] font-bold tracking-[-0.02em] text-ink">Calendar</h2>
              <CalendarCard />
            </section>
          </div>
        </>
      )}

      <InvoicesSection />
    </div>
  );
}

type InvoiceDraft = FunctionReturnType<typeof api.invoices.draft>;

const INVOICE_STATUS: Record<string, { label: string; tone: "neutral" | "green" | "steel" | "amber" | "red" }> = {
  sent: { label: "Sent", tone: "steel" },
  paid: { label: "Paid", tone: "green" },
  paid_out: { label: "Paid to you", tone: "green" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** Bills come in; invoices go out. Plain words in, a real PayPal invoice out, paid to you the minute it's paid. */
function InvoicesSection() {
  const as = useAs();
  const sent = useQuery(api.invoices.list, { as });
  const draft = useAction(api.invoices.draft);
  const send = useAction(api.invoices.send);
  const nudge = useAction(api.invoices.nudge);
  const [text, setText] = useState("");
  const [d, setD] = useState<InvoiceDraft>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [now] = useState(() => Date.now());

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="mb-3 font-display text-[18px] font-bold tracking-[-0.02em] text-ink">Invoices you send</h2>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="p-6">
          <Label htmlFor="inv-text">Who, for what, how much</Label>
          <Textarea
            id="inv-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Invoice Kettle Corner $180 for the logo and $60 for the menu, due Friday, to owner@kettlecorner.com"
          />
          <Button className="mt-3" variant={d ? "secondary" : "primary"} disabled={!!busy || text.trim().length < 8} onClick={() => run("draft", async () => setD(await draft({ text, as })))}>
            {busy === "draft" ? <Loader2 className="animate-spin" /> : <PenLine />} {d ? "Draft it again" : "Draft the invoice"}
          </Button>

          {d ? (
            <div className="mt-5 rounded-[14px] bg-canvas/80 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12px] text-faint">To</div>
                  <div className="truncate text-[14px] font-medium text-ink">
                    {d.toName ? `${d.toName} · ` : ""}
                    {d.to || "no email yet"}
                  </div>
                </div>
                <Amount cents={d.totalCents} size="lg" />
              </div>
              <ul className="mt-3 grid gap-1 text-[13px] text-ink-2">
                {d.items.map((i) => (
                  <li key={i.name} className="flex justify-between gap-3">
                    <span className="truncate">
                      {i.name}
                      {i.quantity > 1 ? ` × ${i.quantity}` : ""}
                    </span>
                    <span className="tabular">{formatCents(i.cents * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-[12.5px] text-muted">
                {d.dueDate ? `Due ${new Date(`${d.dueDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : "Due on receipt"}
                {d.note ? ` · “${d.note}”` : ""}
              </div>
              {d.problems.length ? (
                <p className="mt-3 text-[12.5px] text-disputed">{d.problems.join(" ")}</p>
              ) : (
                <Button
                  className="mt-4 w-full"
                  disabled={!!busy}
                  onClick={() =>
                    run("send", async () => {
                      await send({ to: d.to, toName: d.toName, items: d.items, dueDate: d.dueDate, note: d.note, as });
                      setD(undefined);
                      setText("");
                    })
                  }
                >
                  {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} Send it with PayPal
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
              Gemini drafts it, you check it, and PayPal emails your client a real invoice. Plex watches it: a reminder if it&apos;s late, and the minute it&apos;s paid, the money is paid out to your PayPal.
            </p>
          )}
          {error ? <p className="mt-3 text-[12.5px] text-disputed">{error}</p> : null}
        </Card>

        <Card className="p-2">
          {sent === undefined ? (
            <Skeleton className="m-3 h-24" />
          ) : sent.length === 0 ? (
            <EmptyState icon={<Send />} title="No invoices yet" body="Draft one on the left. It goes out as a real PayPal invoice." className="py-10" />
          ) : (
            sent.map((i) => {
              const st = INVOICE_STATUS[i.status] ?? INVOICE_STATUS.sent!;
              const overdue = i.status === "sent" && i.dueDate && Date.parse(`${i.dueDate}T23:59:59`) < now;
              return (
                <div key={i._id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-[12px] px-4 py-3 hover:bg-sunken/60">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-ink">{i.toName ?? i.to}</span>
                      <Badge tone={overdue ? "amber" : st.tone}>{overdue ? "Overdue" : st.label}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[12.5px] text-muted">
                      #{i.number ?? "…"} · {i.items.map((x) => x.name).join(", ")}
                      {i.dueDate ? ` · due ${new Date(`${i.dueDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                      {i.reminders ? ` · ${i.reminders} reminder${i.reminders > 1 ? "s" : ""} sent` : ""}
                    </div>
                    {i.problem ? <div className="mt-0.5 text-[12px] text-disputed">{i.problem}</div> : null}
                    <div className="mt-1.5 flex flex-wrap gap-3 text-[12.5px]">
                      {i.payUrl ? (
                        <a href={i.payUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-ink hover:underline">
                          Client&apos;s PayPal page <ArrowUpRight className="size-3" />
                        </a>
                      ) : null}
                      {i.status === "sent" ? (
                        <button type="button" disabled={!!busy} className="font-medium text-muted hover:text-ink disabled:opacity-50" onClick={() => run(i._id, () => nudge({ id: i._id, remind: true, as }))}>
                          {busy === i._id ? "Sending…" : "Send a reminder"}
                        </button>
                      ) : null}
                      {i.receiptId ? (
                        <Link href={`/receipts/${i.receiptId}`} className="font-medium text-green-700 hover:underline">
                          Receipt
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <Amount cents={i.totalCents} size="md" className={i.status === "paid_out" ? "text-green-800" : "text-ink"} />
                </div>
              );
            })
          )}
        </Card>
      </div>
    </section>
  );
}

function ConnectCard({ ready, busy, onConnect }: { ready: boolean; busy: boolean; onConnect: () => void }) {
  return (
    <Card className="p-7 sm:p-8">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <h2 className="font-display text-[26px] leading-tight font-bold tracking-[-0.03em] text-ink">Let Plex handle the everyday</h2>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted">
            Connect Google once. Plex reads your Gmail (read-only) for bills and invoices, and adds events to your Calendar when you ask. It never sends email.
          </p>
          <Button size="lg" className="mt-6" disabled={!ready || busy} onClick={onConnect}>
            {busy ? <Loader2 className="animate-spin" /> : null} Connect Google
          </Button>
          {!ready ? (
            <p className="mt-3 text-[12.5px] text-disputed">
              This deployment needs GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and CONNECTIONS_KEY first.
            </p>
          ) : null}
        </div>
        <div className="grid content-start gap-5">
          {[
            { icon: Mail, title: "Bills pay themselves, safely", body: "A payee you've paid before, under your limit, not a duplicate: Plex pays it through PayPal and files the receipt." },
            { icon: ShieldCheck, title: "Anything else asks first", body: "A new payee, a big amount or a missing detail waits for your tap, with the check that stopped it." },
            { icon: CalendarDays, title: "Calendar, in plain words", body: "“Lunch with Sam next Tuesday.” Plex finds a free time and adds it when you say so." },
          ].map((f) => (
            <div key={f.title} className="flex gap-3">
              <f.icon className="mt-0.5 size-[18px] flex-none text-green-700" strokeWidth={1.9} />
              <div>
                <div className="text-[14px] font-semibold text-ink">{f.title}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function WatchCard({ o }: { o: Extract<NonNullable<FunctionReturnType<typeof api.everyday.overview>>, { connected: true }> }) {
  const as = useAs();
  const scan = useAction(api.everyday.scanNow);
  const setWatching = useMutation(api.everyday.setWatching);
  const setLimit = useMutation(api.everyday.setBillLimit);
  const disconnect = useAction(api.everyday.disconnect);
  const [limit, setLimitText] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [note, setNote] = useState<string>();

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setNote(undefined);
    try {
      await fn();
    } catch (err) {
      setNote(errorMessage(err));
    } finally {
      setBusy(undefined);
    }
  }

  const limitValue = limit ?? String(o.autoPayUnderCents / 100);
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink-2">Watching Gmail</div>
          <div className="mt-1 truncate text-[14px] font-semibold text-ink">{o.email}</div>
        </div>
        <Switch checked={o.watching} onChange={(w) => run("watch", () => setWatching({ watching: w, as }))} label="Watch Gmail for bills" />
      </div>
      <div className="mt-2 text-[12.5px] text-muted">
        {o.lastScanNote ? <span className="text-disputed">{o.lastScanNote}</span> : o.lastScanAt ? `Checked ${relativeTime(o.lastScanAt)}` : "First check running"}
        {o.watching ? " · every 2 minutes" : " · paused"}
      </div>
      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run("limit", async () => {
            await setLimit({ cents: Math.round(Number(limitValue || 0) * 100), as });
            setLimitText(undefined);
          });
        }}
      >
        <div className="flex-1">
          <Label htmlFor="bill-limit">Pay by itself up to</Label>
          <Input id="bill-limit" inputMode="decimal" value={limitValue} onChange={(e) => setLimitText(e.target.value.replace(/[^\d.]/g, ""))} />
        </div>
        {limit !== undefined ? (
          <Button type="submit" size="md" variant="secondary" disabled={!!busy}>
            Save
          </Button>
        ) : null}
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!!busy}
          onClick={() =>
            run("scan", async () => {
              const r = await scan({ as });
              setNote(r.looked ? `Read ${r.looked} new email${r.looked === 1 ? "" : "s"}, found ${r.bills} bill${r.bills === 1 ? "" : "s"}.` : "No new bills.");
            })
          }
        >
          {busy === "scan" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check now
        </Button>
        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run("disconnect", () => disconnect({ as }))}>
          <Unplug /> Disconnect
        </Button>
      </div>
      {note ? <p className="mt-2 text-[12.5px] text-muted">{note}</p> : null}
    </Card>
  );
}

function BillCard({ bill }: { bill: Bill }) {
  const as = useAs();
  const approve = useAction(api.everyday.approve);
  const decline = useMutation(api.everyday.decline);
  const remind = useAction(api.everyday.remind);
  const [payTo, setPayTo] = useState(bill.payTo ?? "");
  const [amount, setAmount] = useState(bill.amountCents ? String(bill.amountCents / 100) : "");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const st = STATUS[bill.status];
  const waiting = bill.status === "needs_approval";
  const cents = Math.round(Number(amount || 0) * 100);

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-ink">{bill.vendor ?? bill.fromEmail}</span>
            <Badge tone={st.tone}>{bill.status === "paid" && bill.autoPay ? "Paid by itself" : st.label}</Badge>
          </div>
          <div className="mt-1 truncate text-[12.5px] text-muted">
            “{bill.subject}” · {bill.fromEmail} · {relativeTime(bill.receivedAt)}
          </div>
        </div>
        <div className="flex-none text-right">
          {bill.amountCents ? <Amount cents={bill.amountCents} size="lg" /> : <span className="text-[13px] text-faint">No amount</span>}
          {bill.dueDate ? (
            <div className="mt-0.5 flex items-center justify-end gap-1 text-[12px] text-muted">
              <Clock className="size-3" strokeWidth={2} /> Due {new Date(`${bill.dueDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          ) : null}
        </div>
      </div>

      {bill.summary ? <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">{bill.summary}</p> : null}

      <CheckList rows={verdictRows(bill.checks)} className="mt-3" />

      {bill.note ? (
        <p className="mt-2 flex items-start gap-2 text-[12.5px] text-refunded">
          <CircleAlert className="mt-px size-3.5 flex-none" strokeWidth={2} /> {bill.note}
        </p>
      ) : null}

      {waiting ? (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <div>
              <Label htmlFor={`pay-${bill._id}`}>Pay to (PayPal email)</Label>
              <Input id={`pay-${bill._id}`} value={payTo} onChange={(e) => setPayTo(e.target.value)} placeholder="billing@vendor.com" />
            </div>
            <div>
              <Label htmlFor={`amt-${bill._id}`}>Amount</Label>
              <Input id={`amt-${bill._id}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="brand"
              disabled={!!busy || cents < 100 || !payTo.includes("@")}
              onClick={() =>
                run("pay", async () => {
                  const r = await approve({ billId: bill._id, origin: window.location.origin, payTo: payTo.trim(), amountCents: cents, as });
                  if ("approveUrl" in r) window.location.assign(r.approveUrl);
                })
              }
            >
              {busy === "pay" ? <Loader2 className="animate-spin" /> : null} Pay {cents >= 100 ? formatCents(cents) : ""} with PayPal
            </Button>
            {bill.reminderLink ? (
              bill.reminderLink.startsWith("http") ? (
                <a href={bill.reminderLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 text-[13px] font-medium text-green-700">
                  <BellRing className="size-3.5" /> On your calendar <ArrowUpRight className="size-3.5" />
                </a>
              ) : (
                <span className="px-2 text-[13px] text-muted">On your calendar</span>
              )
            ) : (
              <Button variant="secondary" disabled={!!busy} onClick={() => run("remind", () => remind({ billId: bill._id, as }))}>
                {busy === "remind" ? <Loader2 className="animate-spin" /> : <BellRing />} Remind me {bill.dueDate ? "on the due date" : "tomorrow"}
              </Button>
            )}
            <Button variant="ghost" disabled={!!busy} onClick={() => run("decline", () => decline({ billId: bill._id, as }))}>
              Decline
            </Button>
          </div>
        </div>
      ) : bill.status === "paid" && bill.receiptId ? (
        <Link href={`/receipts/${bill.receiptId}`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-green-700">
          Paid {bill.payTo} through PayPal · receipt <ArrowUpRight className="size-3.5" />
        </Link>
      ) : bill.status === "paying" ? (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-steel-700">
          <Loader2 className="size-3.5 animate-spin" /> Paying through PayPal…
        </p>
      ) : null}
      {error ? <p className="mt-2 text-[12.5px] text-disputed">{error}</p> : null}
    </Card>
  );
}

const ASKS = ["Lunch with Sam next Tuesday", "30 minute call Thursday afternoon", "Gym for an hour tomorrow evening"];

function when(iso: string, timeZone: string, allDay = false) {
  const d = new Date(allDay ? `${iso}T12:00:00` : iso);
  return d.toLocaleString("en-US", {
    timeZone: allDay ? undefined : timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }),
  });
}

function CalendarCard() {
  const as = useAs();
  const load = useAction(api.everyday.calendar);
  const plan = useAction(api.everyday.planEvent);
  const add = useAction(api.everyday.addEvent);
  const [cal, setCal] = useState<Cal | null>();
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<Plan>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState<string>();

  useEffect(() => {
    let alive = true;
    load({ as })
      .then((c) => alive && setCal(c))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [load, as]);

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<CalendarDays />} title="Ask for a time" description={cal ? `Your calendar, ${cal.timeZone}` : "Google Calendar"} />
      <div className="px-6 pt-4 pb-6">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Coffee with Priya next week, 45 minutes" className="min-h-16" />
        <div className="mt-2 flex flex-wrap gap-2">
          {ASKS.map((a) => (
            <button key={a} type="button" onClick={() => setText(a)} className="rounded-full bg-sunken px-3 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:bg-line/60">
              {a}
            </button>
          ))}
        </div>
        <Button
          className="mt-4"
          disabled={!!busy || text.trim().length < 4}
          onClick={() =>
            run("plan", async () => {
              setAdded(undefined);
              setProposal(await plan({ text, as }));
            })
          }
        >
          {busy === "plan" ? <Loader2 className="animate-spin" /> : <CalendarPlus />} Find a time
        </Button>

        {proposal ? (
          <div className="mt-5 rounded-[14px] bg-canvas/80 p-4">
            <div className="text-[12px] font-medium text-faint">Free then · checked against {proposal.busyChecked} busy block{proposal.busyChecked === 1 ? "" : "s"}</div>
            <div className="mt-1 text-[16px] font-semibold text-ink">{proposal.title}</div>
            <div className="mt-0.5 text-[13.5px] text-ink-2">
              {when(proposal.start, proposal.timeZone)} – {new Date(proposal.end).toLocaleTimeString("en-US", { timeZone: proposal.timeZone, hour: "numeric", minute: "2-digit" })}
            </div>
            {proposal.attendees.length ? <div className="mt-1 text-[12.5px] text-muted">Invites {proposal.attendees.join(", ")}</div> : null}
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                disabled={!!busy}
                onClick={() =>
                  run("add", async () => {
                    const r = await add({ title: proposal.title, start: proposal.start, end: proposal.end, timeZone: proposal.timeZone, attendees: proposal.attendees, notes: proposal.notes, as });
                    setAdded(r.link ?? "added");
                    setProposal(undefined);
                    setText("");
                    setCal(await load({ as }));
                  })
                }
              >
                {busy === "add" ? <Loader2 className="animate-spin" /> : null} Add to calendar
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setProposal(undefined)}>
                Not this one
              </Button>
            </div>
          </div>
        ) : null}
        {added ? (
          <p className="mt-3 flex items-center gap-1.5 text-[13px] text-green-800">
            <ShieldCheck className="size-4" strokeWidth={1.9} /> Added to your calendar.
            {added.startsWith("http") ? (
              <a href={added} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium underline-offset-2 hover:underline">
                Open <ArrowUpRight className="size-3.5" />
              </a>
            ) : null}
          </p>
        ) : null}
        {error ? <p className="mt-3 text-[12.5px] text-disputed">{error}</p> : null}

        <div className="mt-6 text-[12.5px] font-medium text-faint">Next 7 days</div>
        {cal === undefined ? (
          <Skeleton className="mt-2 h-24 w-full" />
        ) : !cal || cal.events.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">Nothing on your calendar.</p>
        ) : (
          <ul className="mt-1 grid">
            {cal.events.map((e) => (
              <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-1.5">
                <a href={e.link} target="_blank" rel="noreferrer" className="truncate text-[13.5px] text-ink hover:underline">
                  {e.title}
                </a>
                <span className="text-[12.5px] text-muted tabular">{when(e.start, cal.timeZone, e.allDay)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

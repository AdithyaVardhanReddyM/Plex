"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Camera, CircleAlert, HandHeart, Loader2, Lock, MapPin, ShieldCheck } from "lucide-react";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, Input, Label, Meter, PageHeader, Skeleton, Textarea } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { PersonaSwitch, useAs } from "@/components/tasks/persona";
import { errorMessage } from "@/components/tasks/task-ui";
import { cn, formatCents, shortDate } from "@/lib/utils";

type Backable = FunctionReturnType<typeof api.backing.list>[number];
type Gift = FunctionReturnType<typeof api.backing.mine>[number];

const CHIPS = [500, 1000, 2500];

/** What a task is doing, in words, for its backers. */
function stage(t: Backable): { text: string; tone: "neutral" | "green" | "steel" | "amber" | "red" } {
  if (t.status === "draft") return { text: `${formatCents(Math.max(0, t.goalCents - t.raisedCents))} to go`, tone: "amber" };
  if (t.status === "open") return { text: "Fully backed · finding someone to do it", tone: "steel" };
  if (t.status === "assigned") return { text: `${t.worker?.name ?? "Someone"} is doing it`, tone: "steel" };
  if (t.status === "submitted" || t.status === "verifying") return { text: "Checking the photo proof", tone: "steel" };
  if (t.status === "approved" || t.status === "paid") return { text: "Done · proof passed", tone: "green" };
  if (t.status === "refunded") return { text: "Didn't happen · every hold voided", tone: "neutral" };
  return { text: t.status, tone: "neutral" };
}

/** Give: back real-world work, held by PayPal, charged only when its photo proof passes. */
export function GiveView() {
  const as = useAs();
  const tasks = useQuery(api.backing.list, {});
  const mine = useQuery(api.backing.mine, { as });
  const confirm = useAction(api.backing.confirm);
  const [flash, setFlash] = useState<{ ok: boolean; text: string }>();

  // Back from PayPal checkout.
  const returned = useRef(false);
  useEffect(() => {
    if (returned.current) return;
    returned.current = true;
    const p = new URLSearchParams(window.location.search);
    const backing = p.get("backing") as Id<"backings"> | null;
    const paypal = p.get("paypal");
    if (!backing) return;
    window.history.replaceState(null, "", window.location.pathname);
    queueMicrotask(() => {
      if (paypal !== "return") return setFlash({ ok: false, text: "You cancelled at PayPal. Nothing was held." });
      confirm({ backingId: backing, as }).then(
        (r) => setFlash(r.state === "not_approved" ? { ok: false, text: "PayPal didn't confirm the hold." } : { ok: true, text: "Held. You're charged only if the photo proof passes." }),
        (err) => setFlash({ ok: false, text: errorMessage(err) }),
      );
    });
  }, [confirm, as]);

  const open = (tasks ?? []).filter((t) => t.status === "draft");
  const rest = (tasks ?? []).filter((t) => t.status !== "draft");

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Charged only when the photo proof passes"
        title="Give"
        description="Back a piece of real work an organization needs done. PayPal holds your gift, not charges it. When the work's photo proof passes, everyone's holds are captured together and you get the photos. If it doesn't happen, every hold is voided."
        actions={<PersonaSwitch />}
      />

      {flash ? (
        <p className={cn("mb-5 flex items-start gap-2 text-[13px]", flash.ok ? "text-green-800" : "text-disputed")} role="status">
          {flash.ok ? <ShieldCheck className="mt-px size-4 flex-none" strokeWidth={1.9} /> : <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} />}
          {flash.text}
        </p>
      ) : null}

      {mine?.length ? (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-[18px] font-bold tracking-[-0.02em] text-ink">Your gifts</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {mine.map((g) => (
              <GiftCard key={g._id} g={g} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-display text-[18px] font-bold tracking-[-0.02em] text-ink">Back proven work</h2>
        {tasks === undefined ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-[320px] rounded-lg" />
            <Skeleton className="h-[320px] rounded-lg" />
          </div>
        ) : !open.length && !rest.length ? (
          <Card>
            <EmptyState icon={<HandHeart />} title="Nothing to back yet" body="Organizations open their real-world tasks for backing below." className="py-10" />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {[...open, ...rest].map((t) => (
              <BackCard key={t._id} t={t} onDone={setFlash} />
            ))}
          </div>
        )}
      </section>

      <OrgCard />
    </div>
  );
}

function Photos({ photos }: { photos: { label: string; url: string }[] }) {
  if (!photos.length) return null;
  return (
    <div className={cn("grid gap-2", photos.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
      {photos.slice(0, 4).map((p) => (
        <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-[12px] bg-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.label} className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
          <span className="absolute bottom-2 left-2 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">{p.label}</span>
        </a>
      ))}
    </div>
  );
}

function OrgLine({ t }: { t: Backable }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={t.org?.name ?? "Org"} color={t.org?.color} square size={30} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-ink">{t.org?.name ?? "An organization"}</div>
        <div className="flex items-center gap-1 truncate text-[12px] text-muted">
          {t.place ? (
            <>
              <MapPin className="size-3 flex-none" strokeWidth={2} /> {t.place} ·{" "}
            </>
          ) : null}
          {shortDate(t.windowStart)}
        </div>
      </div>
    </div>
  );
}

function BackCard({ t, onDone }: { t: Backable; onDone: (f: { ok: boolean; text: string }) => void }) {
  const as = useAs();
  const back = useAction(api.backing.back);
  const [cents, setCents] = useState(1000);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const s = stage(t);
  const remaining = Math.max(0, t.goalCents - t.raisedCents);
  const amount = custom ? Math.round(Number(custom) * 100) : Math.min(cents, remaining);
  const openForGifts = t.status === "draft";

  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <OrgLine t={t} />
        <Badge tone={s.tone}>{s.text}</Badge>
      </div>
      <h3 className="mt-4 font-display text-[20px] leading-tight font-bold tracking-[-0.025em] text-ink">{t.title}</h3>
      <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-ink-2">{t.story ?? t.description}</p>

      {t.photos.length ? (
        <div className="mt-4">
          <Photos photos={t.photos} />
          {t.verdict ? <p className="mt-2 text-[12px] text-muted">Proof passed at {Math.round(t.verdict.confidence * 100)}% · {t.verdict.summary}</p> : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {t.proofSpec.map((p) => (
            <span key={p.label} className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[11.5px] text-ink-2">
              <Camera className="size-3" strokeWidth={2} /> {p.label}
            </span>
          ))}
          <span className="px-1 py-1 text-[11.5px] text-faint">is what you&apos;ll see</span>
        </div>
      )}

      <div className="mt-auto pt-5">
        <div className="flex items-baseline justify-between text-[13px]">
          <span>
            <Amount cents={t.raisedCents} size="md" className="text-ink" /> <span className="text-muted">held of {formatCents(t.goalCents)}</span>
          </span>
          <span className="text-faint">
            {t.backers} backer{t.backers === 1 ? "" : "s"}
          </span>
        </div>
        <Meter value={Math.min(1, t.raisedCents / Math.max(1, t.goalCents))} tone="brand" className="mt-2" />

        {openForGifts ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {CHIPS.filter((c) => c <= Math.max(remaining, 500)).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCents(c);
                    setCustom("");
                  }}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition-colors",
                    !custom && cents === c ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-line hover:ring-line-strong",
                  )}
                >
                  {formatCents(c)}
                </button>
              ))}
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="Other"
                inputMode="decimal"
                aria-label="Other amount in dollars"
                className="h-8 w-20 text-[13px]"
              />
            </div>
            <Button
              variant="brand"
              className="mt-3 w-full"
              disabled={busy || amount < 100}
              onClick={async () => {
                setBusy(true);
                setError(undefined);
                try {
                  const r = await back({ taskId: t._id, amountCents: amount, origin: window.location.origin, as });
                  if ("approveUrl" in r) window.location.assign(r.approveUrl);
                  else {
                    onDone({ ok: true, text: `Held ${formatCents(r.cents)} with auto-pay. You're charged only if the photo proof passes.` });
                    setBusy(false);
                  }
                } catch (err) {
                  setError(errorMessage(err));
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Lock />} Hold {amount >= 100 ? formatCents(Math.min(amount, remaining)) : ""} with PayPal
            </Button>
            {error ? <p className="mt-2 text-[12.5px] text-disputed">{error}</p> : null}
          </>
        ) : (
          <Link href={`/tasks/${t._id}`} className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">
            Follow the task <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>
    </Card>
  );
}

function GiftCard({ g }: { g: Gift }) {
  const t = g.task;
  const line =
    g.state === "captured"
      ? `Charged ${formatCents(g.amountCents)}: the proof passed`
      : g.state === "voided"
        ? `${formatCents(g.amountCents)} voided: never charged`
        : `${formatCents(g.amountCents)} held, not charged · ${stage(t).text.toLowerCase()}`;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-ink">{t.title}</div>
          <div className={cn("mt-0.5 text-[12.5px]", g.state === "captured" ? "text-green-800" : g.state === "voided" ? "text-muted" : "text-steel-700")}>{line}</div>
        </div>
        {g.receiptId ? (
          <Link href={`/receipts/${g.receiptId}`} className="flex-none text-[12.5px] font-medium text-ink hover:underline">
            Receipt
          </Link>
        ) : null}
      </div>
      {t.photos.length ? (
        <div className="mt-4">
          <Photos photos={t.photos} />
          <p className="mt-2 text-[12px] text-muted">
            {t.worker ? `Done by ${t.worker.name}` : "Done"}
            {t.at ? ` · ${shortDate(t.at)}` : ""}
            {t.place ? ` · ${t.place}` : ""}. Your {formatCents(g.amountCents)} was {Math.round((g.amountCents / t.goalCents) * 100)}% of it.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

/** For organizations: open one of your real-world drafts to backers. */
function OrgCard() {
  const as = useAs();
  const drafts = useQuery(api.backing.myDrafts, { as });
  const open = useMutation(api.backing.open);
  const [taskId, setTaskId] = useState<string>("");
  const [story, setStory] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  if (!drafts?.length) return null;
  const pick = taskId || drafts[0]!._id;
  return (
    <Card className="mt-10 p-6">
      <div className="text-[14.5px] font-semibold text-ink">For organizations: let people back a task</div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Pick one of your drafts. Donors&apos; holds fund it together; nobody is charged unless the work&apos;s photo proof passes.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-end">
        <div>
          <Label htmlFor="org-task">Task</Label>
          <select
            id="org-task"
            value={pick}
            onChange={(e) => setTaskId(e.target.value)}
            className="h-9 w-full rounded-[10px] border border-line bg-surface px-2 text-sm text-ink shadow-card"
          >
            {drafts.map((d) => (
              <option key={d._id} value={d._id}>
                {d.title} · {formatCents(d.goalCents)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="org-story">Why it matters, in a sentence or two</Label>
          <Textarea id="org-story" rows={1} value={story} onChange={(e) => setStory(e.target.value)} className="min-h-9" placeholder="Saturday's shelter dinner is short 60 meals." />
        </div>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setNote(undefined);
            try {
              await open({ taskId: pick as Id<"tasks">, story, as });
              setStory("");
              setNote("It's open for backing above.");
            } catch (err) {
              setNote(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <HandHeart />} Open for backing
        </Button>
      </div>
      {note ? <p className="mt-2 text-[12.5px] text-muted">{note}</p> : null}
    </Card>
  );
}

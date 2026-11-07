"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BellRing, Check, Send } from "lucide-react";
import { api } from "@/lib/convex";
import { Avatar, Badge, Card, CardHeader } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { DisplayMoney } from "./kit";
import { cn, formatCents, relativeTime } from "@/lib/utils";
import { ConfirmDialog } from "./confirm";

type Personal = NonNullable<FunctionReturnType<typeof api.ledger.personal>>;
type Split = Personal["splits"][number];

const STATUS = {
  paid: { label: "Settled", icon: <Check size={14} strokeWidth={2.2} />, tone: "text-green-700" },
  sent: { label: "Invoice sent", icon: <Send size={13} strokeWidth={1.9} />, tone: "text-muted" },
  reminded: { label: "Nudged once", icon: <BellRing size={13} strokeWidth={1.9} />, tone: "text-muted" },
} as const;

/**
 * Who owes what, as a friendly scoreboard: everyone's share on one meter,
 * settled players first, a nudge for the rest. Not a collections report.
 */
export function Scoreboard({ split, viewerName, viewerColor, canRemind, onDone }: {
  split: Split;
  viewerName: string;
  viewerColor?: string;
  canRemind: boolean;
  onDone: (message: string) => void;
}) {
  const remind = useMutation(api.ledger.stubSendReminder);
  const [nudge, setNudge] = useState<Split["participants"][number] | null>(null);
  const owed = split.participants.reduce((s, p) => s + p.shareCents, 0);
  const back = split.participants.filter((p) => p.status === "paid").reduce((s, p) => s + p.shareCents, 0);
  const yours = split.totalCents - owed;
  const players = [...split.participants].sort((a, b) => Number(b.status === "paid") - Number(a.status === "paid") || b.shareCents - a.shareCents);
  const settled = players.filter((p) => p.status === "paid").length;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Who owes what"
        description={`${split.title} · ${relativeTime(split.occurredAt)}`}
        action={
          <Badge tone={settled === players.length ? "green" : "outline"} className="tabular">
            {settled} of {players.length} settled
          </Badge>
        }
      />

      {/* The meter: one segment per share */}
      <div className="px-6 pt-5">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <DisplayMoney cents={back} className="text-[40px] text-ink" />
            <span className="tabular text-[13px] text-muted">of {formatCents(owed)} back</span>
          </div>
          <span className="tabular text-[12.5px] font-medium text-ink-2">{Math.round((back / Math.max(owed, 1)) * 100)}%</span>
        </div>
        <div className="mt-4 flex h-2 gap-1">
          {players.map((p) => (
            <div
              key={p.name}
              className={cn("h-full rounded-full transition-colors", p.status === "paid" ? "" : "bg-sunken")}
              style={{ flexGrow: p.shareCents, backgroundImage: p.status === "paid" ? "var(--meter-brand)" : undefined }}
              title={`${p.name}: ${formatCents(p.shareCents)}`}
            />
          ))}
        </div>
      </div>

      <ol className="mt-4 px-2 pb-1">
        {players.map((p, i) => {
          const s = STATUS[p.status];
          return (
            <li key={p.name} className="grid grid-cols-[16px_34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] px-4 py-2.5 transition-colors hover:bg-sunken/70">
              <span className="tabular text-center text-[12px] font-medium text-faint">{i + 1}</span>
              <Avatar name={p.name} color={p.color} size={34} />
              <div className="min-w-0 leading-[1.3]">
                <div className="truncate text-[13.5px] font-medium text-ink">{p.name}</div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] whitespace-nowrap">
                  <span className={cn("flex items-center gap-1", s.tone)}>
                    {s.icon}
                    {s.label}
                  </span>
                  {p.status !== "paid" && canRemind ? (
                    <>
                      <span className="text-faint">·</span>
                      <button
                        type="button"
                        onClick={() => setNudge(p)}
                        className="rounded-xs font-medium text-green-700 hover:text-green-800 focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:outline-none"
                      >
                        Nudge
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <Amount cents={p.shareCents} size="sm" className={p.status === "paid" ? "text-green-700" : undefined} />
            </li>
          );
        })}
      </ol>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-6 pt-2 pb-5 text-[12.5px] whitespace-nowrap">
        <span className="flex items-center gap-2 text-muted">
          <Avatar name={viewerName} color={viewerColor} size={20} />
          You covered {formatCents(split.totalCents)}
        </span>
        <span className="tabular text-muted">
          your share <span className="font-medium text-ink-2">{formatCents(yours)}</span>
        </span>
      </div>

      <ConfirmDialog
        open={nudge !== null}
        title={`Nudge ${nudge?.name.split(" ")[0]}?`}
        body={
          <>
            PayPal resends {nudge?.name.split(" ")[0]}&apos;s invoice for {nudge ? formatCents(nudge.shareCents) : ""} with a short note:
            “No rush, settling up {split.title.toLowerCase()}.”
          </>
        }
        confirmLabel="Send nudge"
        onClose={() => setNudge(null)}
        onConfirm={async () => {
          if (!nudge) return;
          await remind({ role: "personal", splitId: split._id, participant: nudge.name });
          onDone(`Nudge for ${nudge.name.split(" ")[0]} queued`);
        }}
      />
    </Card>
  );
}

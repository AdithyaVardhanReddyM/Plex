import { BadgeCheck, Cpu, Lock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Empty-state art, built from miniature product UI rather than drawings: the
 * same cards, bars, tiles and foil the app uses, at a smaller scale and in
 * quiet tones. Each is about 168 × 104. Pass to `EmptyState art={…}`.
 */

function Bar({ w, className }: { w: number; className?: string }) {
  return <span className={cn("block h-[5px] rounded-full bg-line", className)} style={{ width: w }} />;
}

function MiniReceipt({ className, lit }: { className?: string; lit?: boolean }) {
  return (
    <div className={cn("w-[112px] overflow-hidden rounded-[9px] border border-line bg-surface shadow-raised", className)}>
      <div className="h-[3px]" style={{ background: "var(--metal)" }} />
      <div className="p-2.5">
        <div className="flex items-center justify-between">
          <span className="size-3.5 rounded-[4px] bg-sunken" />
          <span className={cn("h-2 w-7 rounded-full", lit ? "bg-green-100" : "bg-sunken")} />
        </div>
        <div className="mt-2.5 flex items-end justify-between">
          <div className="space-y-1">
            <Bar w={44} />
            <Bar w={30} className="bg-sunken" />
          </div>
          <span className={cn("h-2.5 w-8 rounded-full", lit ? "bg-ink/80" : "bg-line-strong")} />
        </div>
        <div className="mt-2.5 rounded-[5px] bg-green-50 px-1.5 py-1.5 ring-1 ring-inset ring-green-100">
          <Bar w={64} className="bg-green-200/80" />
        </div>
      </div>
    </div>
  );
}

/** A small stack of receipts: for lists of receipts and payments. */
export function ReceiptStackArt() {
  return (
    <div className="relative h-[104px] w-[168px]" aria-hidden>
      <MiniReceipt className="absolute top-3 left-2 -rotate-[7deg] opacity-70" />
      <MiniReceipt className="absolute top-1 left-[46px] rotate-[5deg] opacity-85" />
      <MiniReceipt className="absolute top-2 left-[26px]" lit />
    </div>
  );
}

/** Money held by PayPal: a steel lock tile inside foil rings. For escrow and holds. */
export function HeldArt() {
  return (
    <div className="relative flex h-[104px] w-[168px] items-center justify-center" aria-hidden>
      <span className="absolute size-[96px] rounded-full border border-dashed border-steel-200" />
      <span className="absolute size-[70px] rounded-full bg-gradient-to-b from-steel-50 to-surface ring-1 ring-inset ring-steel-100" />
      <span
        className="relative flex size-11 items-center justify-center rounded-[13px] text-steel-800 shadow-raised"
        style={{ background: "var(--metal-soft)" }}
      >
        <Lock className="size-5" strokeWidth={1.9} />
      </span>
      <span className="absolute top-3 right-4 rounded-full border border-line bg-surface px-1.5 py-0.5 text-[9.5px] font-semibold text-steel-700 shadow-card">
        Held
      </span>
    </div>
  );
}

/** A task card with a location pin and a funded chip. For boards and task lists. */
export function TaskArt() {
  return (
    <div className="relative h-[104px] w-[168px]" aria-hidden>
      <div className="absolute top-4 left-1 w-[132px] rotate-[-4deg] rounded-[10px] border border-line bg-surface p-2.5 opacity-70 shadow-card">
        <Bar w={70} />
        <Bar w={46} className="mt-1.5 bg-sunken" />
      </div>
      <div className="absolute top-2 left-7 w-[136px] rounded-[10px] border border-line bg-surface p-2.5 shadow-raised">
        <div className="flex items-center gap-1.5">
          <span className="flex size-4 items-center justify-center rounded-[5px] bg-green-50 text-green-700 ring-1 ring-inset ring-green-100">
            <MapPin className="size-2.5" strokeWidth={2.2} />
          </span>
          <Bar w={40} className="bg-sunken" />
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div className="space-y-1">
            <Bar w={62} />
            <Bar w={40} className="bg-sunken" />
          </div>
          <span className="h-3 w-7 rounded-full bg-ink/80" />
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2">
          <span className="size-3.5 rounded-full bg-steel-200" />
          <span className="flex items-center gap-1 rounded-full bg-steel-50 px-1.5 py-0.5 ring-1 ring-inset ring-steel-100">
            <Lock className="size-2 text-steel-600" strokeWidth={2.4} />
            <span className="h-1 w-5 rounded-full bg-steel-200" />
          </span>
        </div>
      </div>
    </div>
  );
}

/** An agent with a verified result. For agents, keys and the marketplace. */
export function AgentArt() {
  return (
    <div className="relative h-[104px] w-[168px]" aria-hidden>
      <div className="absolute top-3 left-3 w-[124px] rounded-[10px] border border-line bg-surface p-2.5 shadow-raised">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-[7px] bg-ink text-green-300">
            <Cpu className="size-3.5" strokeWidth={2} />
          </span>
          <div className="space-y-1">
            <Bar w={46} />
            <Bar w={30} className="bg-sunken" />
          </div>
        </div>
        <div className="mt-2.5 space-y-1">
          <Bar w={96} className="bg-sunken" />
          <Bar w={72} className="bg-sunken" />
        </div>
      </div>
      <span className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-1 text-[9.5px] font-semibold text-green-800 shadow-card">
        <BadgeCheck className="size-3" strokeWidth={2.2} />
        Proof passed
      </span>
    </div>
  );
}

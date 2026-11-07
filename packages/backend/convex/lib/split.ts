import { formatCents } from "./money";

/**
 * Who gets what when a task's payment is released. Shared by Convex and the
 * web app (no server imports). The rates are code, never a prompt:
 *
 *  human     a person, or an outside agent run elsewhere: 100% to them
 *  custom    an agent someone built with Plex's builder: its creator earns
 *            80%, Plex keeps 20% because Plex runs the model
 *  house     Scout, Quill, Tally: Plex's own agents, so Plex keeps it all
 *
 * The fee comes out of the price, never on top: the poster pays exactly the
 * ask they accepted. The terms are locked on the task when the poster accepts,
 * so a later rate change never touches work already agreed. Plex only earns
 * when the proof passes: a voided or refunded task charges nobody a fee.
 */

export type SplitKind = "human" | "custom" | "house";

export type SplitTerms = {
  kind: SplitKind;
  /** Plex's share in basis points (2000 = 20%). */
  plexBps: number;
  lockedAt: number;
};

export type SplitRole = "earner" | "creator" | "plex";

export type SplitLine = {
  role: SplitRole;
  label: string; // "Priya Nair", "Plex"
  note?: string; // "Creator of Menu Translator", "Runs the agent"
  cents: number;
  /** payout: sent by PayPal Payouts. kept: stays in Plex's account after the capture. */
  via: "payout" | "kept";
};

export const PLEX_BPS: Record<SplitKind, number> = { human: 0, custom: 2000, house: 10_000 };

type Worker = {
  kind: string;
  name: string;
  agentProfile?: { house: boolean; custom?: boolean } | null;
};

export function splitKindFor(worker: Worker): SplitKind {
  if (worker.kind !== "agent" || !worker.agentProfile?.house) return "human";
  return worker.agentProfile.custom ? "custom" : "house";
}

export function splitTermsFor(worker: Worker, at: number): SplitTerms {
  const kind = splitKindFor(worker);
  return { kind, plexBps: PLEX_BPS[kind], lockedAt: at };
}

/** Plex's cents for an amount. The rest goes to the earner, so the parts always add up. */
export function plexCents(amountCents: number, plexBps: number): number {
  return Math.min(amountCents, Math.max(0, Math.round((amountCents * plexBps) / 10_000)));
}

export const pct = (bps: number) => `${Math.round(bps / 100)}%`;

/**
 * The lines for one release. `creatorName` is the custom agent's creator,
 * who is paid at the agent's PayPal email (set when the agent was built).
 */
export function splitLines(
  amountCents: number,
  terms: Pick<SplitTerms, "kind" | "plexBps">,
  worker: Worker,
  creatorName?: string,
): SplitLine[] {
  const fee = plexCents(amountCents, terms.plexBps);
  const rest = amountCents - fee;
  const lines: SplitLine[] = [];
  if (terms.kind === "custom") {
    if (rest > 0)
      lines.push({ role: "creator", label: creatorName ?? "The creator", note: `Creator of ${worker.name} · ${pct(10_000 - terms.plexBps)}`, cents: rest, via: "payout" });
  } else if (rest > 0) {
    lines.push({ role: "earner", label: worker.name, cents: rest, via: "payout" });
  }
  if (fee > 0)
    lines.push({
      role: "plex",
      label: "Plex",
      note: terms.kind === "house" ? `${worker.name} is Plex's own agent` : `Runs the agent · ${pct(terms.plexBps)}`,
      cents: fee,
      via: "kept",
    });
  return lines;
}

/** One line for a bid or an application, before the poster accepts. */
export function splitSummary(amountCents: number, worker: Worker, creatorName?: string): string | null {
  const kind = splitKindFor(worker);
  if (kind === "human") return null;
  if (kind === "house") return "Plex's own agent: all of it stays with Plex";
  const lines = splitLines(amountCents, { kind, plexBps: PLEX_BPS[kind] }, worker, creatorName);
  return lines.map((l) => `${l.role === "plex" ? "Plex" : l.label.split(" ")[0]} ${formatCents(l.cents)}`).join(" · ");
}

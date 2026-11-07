import {
  BadgeCheck,
  Ban,
  CalendarClock,
  CalendarRange,
  Coffee,
  Hand,
  HeartHandshake,
  MapPin,
  MoonStar,
  PiggyBank,
  ShoppingBag,
  ShoppingCart,
  Store,
} from "lucide-react";
import type { Doc } from "@/lib/convex";
import { cn, formatCents } from "@/lib/utils";

export type Pot = Doc<"pots"> & { ruleLines: string[] };
export type PolicyRule = Doc<"pots">["rules"][number];

const ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number }>> = {
  coffee: Coffee,
  "shopping-bag": ShoppingBag,
  "map-pin": MapPin,
  "heart-handshake": HeartHandshake,
};

/** Pot colors map onto the two brand scales only: green and steel. */
export const POT_TINT: Record<string, { bar: string; chip: string; meter: "brand" | "steel" }> = {
  green: { bar: "bg-green-500", chip: "bg-green-50 text-green-700 ring-green-100", meter: "brand" },
  blue: { bar: "bg-steel-500", chip: "bg-steel-50 text-steel-600 ring-steel-100", meter: "steel" },
  teal: { bar: "bg-green-400", chip: "bg-green-50 text-green-700 ring-green-100", meter: "brand" },
  steel: { bar: "bg-steel-400", chip: "bg-steel-50 text-steel-600 ring-steel-100", meter: "steel" },
};

export function PotIcon({ pot, size = 24, className }: { pot: Pick<Doc<"pots">, "icon" | "color">; size?: number; className?: string }) {
  const Icon = ICONS[pot.icon] ?? PiggyBank;
  return (
    <span
      className={cn("flex flex-none items-center justify-center ring-1 ring-inset", POT_TINT[pot.color]?.chip, className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <Icon className={size >= 32 ? "size-4" : "size-3.5"} strokeWidth={1.9} />
    </span>
  );
}

/** Spend against the monthly budget. The label sits under the bar so it never clips. */
export function PotGauge({
  pot,
  className,
  bare,
}: {
  pot: Doc<"pots">;
  className?: string;
  /** Leave the spent figure out of the label, when it is shown big above the bar. */
  bare?: boolean;
}) {
  const pct = pot.monthlyBudgetCents > 0 ? Math.min(100, (pot.spentMonthCents / pot.monthlyBudgetCents) * 100) : 0;
  return (
    <div className={className}>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-sunken"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={pot.monthlyBudgetCents}
        aria-valuenow={pot.spentMonthCents}
        aria-label={`${pot.name}: ${formatCents(pot.spentMonthCents)} of ${formatCents(pot.monthlyBudgetCents)} this month`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${pct}%`, backgroundImage: POT_TINT[pot.color]?.meter === "steel" ? "var(--meter-steel)" : "var(--meter-brand)" }}
        />
      </div>
      <div className="tabular mt-2 flex items-baseline justify-between gap-2 text-[12px] text-muted">
        <span className="truncate">
          {bare ? null : <span className="font-medium text-ink-2">{formatCents(pot.spentMonthCents)} </span>}
          of {formatCents(pot.monthlyBudgetCents)}
        </span>
        <span className="flex-none text-faint">{Math.round(pct)}%</span>
      </div>
    </div>
  );
}

const RULE_ICON: Record<PolicyRule["kind"], React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number }>> = {
  daily_limit: CalendarClock,
  monthly_limit: CalendarRange,
  per_purchase_limit: ShoppingCart,
  approval_over: Hand,
  block_category: Ban,
  allow_merchants: Store,
  quiet_hours: MoonStar,
  auto_approve: BadgeCheck,
};

const RULE_KIND: Record<PolicyRule["kind"], string> = {
  daily_limit: "Daily limit",
  monthly_limit: "Monthly limit",
  per_purchase_limit: "Per purchase",
  approval_over: "Needs approval",
  block_category: "Ask first",
  allow_merchants: "Merchants",
  quiet_hours: "Quiet hours",
  auto_approve: "Always allowed",
};

/** One structured rule: kind, its plain sentence and the raw value the engine reads. */
export function RuleLine({
  rule,
  line,
  highlight,
  className,
}: {
  rule: PolicyRule;
  line: string;
  highlight?: "allow" | "needs_approval" | "deny" | null;
  className?: string;
}) {
  const Icon = RULE_ICON[rule.kind];
  return (
    <li
      className={cn(
        "grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-300",
        highlight === "allow" && "bg-green-50 ring-1 ring-inset ring-green-200",
        highlight === "needs_approval" && "bg-steel-50 ring-1 ring-inset ring-steel-200",
        highlight === "deny" && "bg-disputed-bg ring-1 ring-inset ring-disputed/20",
        className,
      )}
    >
      <span className="flex size-7 items-center justify-center rounded-[8px] bg-sunken text-ink-2">
        <Icon className="size-4" strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <div className="text-[14px] font-medium leading-snug text-ink">{line}</div>
        <div className="mt-0.5 truncate font-mono text-[11.5px] leading-snug text-faint">{ruleCode(rule)}</div>
      </div>
      <span className="hidden text-[12px] text-muted sm:block">{RULE_KIND[rule.kind]}</span>
    </li>
  );
}

/** The structured form, as the engine stores it. */
export function ruleCode(rule: PolicyRule): string {
  switch (rule.kind) {
    case "daily_limit":
    case "monthly_limit":
    case "per_purchase_limit":
    case "approval_over":
      return `${rule.kind}  ${rule.amountCents}¢`;
    case "block_category":
      return `${rule.kind}  "${rule.category}"`;
    case "allow_merchants":
      return `${rule.kind}  [${rule.merchants.map((m) => `"${m}"`).join(", ")}]`;
    case "quiet_hours":
      return `${rule.kind}  ${String(rule.startHour).padStart(2, "0")}:00–${String(rule.endHour).padStart(2, "0")}:00`;
    case "auto_approve":
      return `${rule.kind}  "${rule.merchant}" ≤ ${rule.upToCents}¢`;
  }
}

import { cn, formatCents } from "@/lib/utils";

/**
 * An amount. Digits are tabular; the currency sign is set smaller and lighter
 * so the number is what the eye reads. `sign` shows +/- for in/out flows.
 */
export function Amount({
  cents,
  currency = "USD",
  sign,
  size = "md",
  className,
}: {
  cents: number;
  currency?: string;
  sign?: "in" | "out";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const formatted = formatCents(Math.abs(cents), currency);
  const symbol = formatted.replace(/[\d.,\s]/g, "");
  const digits = formatted.replace(symbol, "");
  const sizes = {
    sm: "text-[13px]",
    md: "text-[15px]",
    lg: "font-display text-[22px] font-bold tracking-[-0.025em]",
    xl: "font-display text-[42px] font-bold tracking-[-0.04em] leading-none",
  };
  return (
    <span className={cn("tabular inline-flex items-baseline font-semibold text-ink", sizes[size], className)}>
      {sign ? <span className={cn("mr-0.5", sign === "in" ? "text-green-700" : "text-ink-2")}>{sign === "in" ? "+" : "−"}</span> : null}
      <span className={cn("mr-[0.06em]", size === "xl" ? "text-[0.55em] font-medium text-muted" : "")}>{symbol}</span>
      {digits}
    </span>
  );
}

import { cn } from "@/lib/utils";

/**
 * Plex's wordmark: plain type, no invented symbol. The period is the one
 * flourish, in the brand gradient, like the dot on a receipt total.
 */
export function Wordmark({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn("inline-flex items-baseline font-semibold tracking-[-0.045em] text-ink", className)}
      style={{ fontSize: size, lineHeight: 1 }}
    >
      plex
      <span
        className="ml-[0.04em] inline-block rounded-full"
        style={{ width: size * 0.26, height: size * 0.26, background: "var(--brand)" }}
        aria-hidden
      />
    </span>
  );
}

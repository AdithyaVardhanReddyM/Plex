import { cn } from "@/lib/utils";

/**
 * The Plex logo: the mark (an aqua arc, a mint band and an ink corner) and the "Plex" logotype.
 * Source files: public/brand/plex-logo.svg and plex-logo-full.svg. `size` is the cap height of
 * the type it replaces, so existing call sites keep their scale. The ink parts use currentColor,
 * so `className="text-white"` gives a version for dark grounds.
 */
export function Wordmark({
  className,
  size = 20,
  variant = "full",
}: {
  className?: string;
  size?: number;
  variant?: "full" | "mark";
}) {
  const height = Math.round(size * 1.3);
  if (variant === "mark") return <LogoMark className={className} size={height} />;
  return (
    <svg
      role="img"
      aria-label="Plex"
      viewBox="0 0 153.1 41"
      height={height}
      width={Math.round((height * 153.1) / 41)}
      className={cn("inline-block shrink-0 text-ink", className)}
    >
      <g transform="translate(0 0.5)">
        <MarkPaths />
      </g>
      <path transform="translate(46 1.1)" fill="currentColor" d="M15.85 26.50L15.85 20.20L20.70 20.20L20.70 26.50L15.85 26.50ZM20.70 26.50L20.70 20.20Q23.10 20.20 24.82 19.77Q26.55 19.35 27.48 18.17Q28.40 17 28.40 14.75L28.40 14.75Q28.40 12.50 27.48 11.32Q26.55 10.15 24.82 9.72Q23.10 9.30 20.70 9.30L20.70 9.30L20.70 3Q25.25 3 28.68 4.15Q32.10 5.30 34.03 7.88Q35.95 10.45 35.95 14.75L35.95 14.75Q35.95 19 34.03 21.60Q32.10 24.20 28.68 25.35Q25.25 26.50 20.70 26.50L20.70 26.50ZM15.85 9.30L15.85 3L20.70 3L20.70 9.30L15.85 9.30ZM8.60 6.30L15.85 6.30L15.85 38L8.60 38L8.60 6.30ZM40.05 38L40.05 0.50L47.20 0.50L47.20 38L40.05 38ZM77.90 26.40L58.40 26.40L58.40 20.60L73.05 20.60L70.75 21.95Q71.00 20.50 70.48 19.02Q69.95 17.55 68.65 16.57Q67.35 15.60 65.15 15.60L65.15 15.60Q62.30 15.60 60.28 17.47Q58.25 19.35 58.40 23.10L58.40 23.10L50.85 23.10Q51.10 18.55 53.10 15.47Q55.10 12.40 58.25 10.80Q61.40 9.20 65.15 9.20L65.15 9.20Q68.00 9.20 70.55 10.35Q73.10 11.50 74.95 13.70Q76.80 15.90 77.65 19.10Q78.50 22.30 77.90 26.40L77.90 26.40ZM65.15 38.80L65.15 38.80Q61.25 38.80 58.23 37.25Q55.20 35.70 53.35 32.90Q51.50 30.10 51.00 26.40L51.00 26.40L58.40 26.40Q58.80 29 60.38 30.70Q61.95 32.40 65.15 32.40L65.15 32.40Q67.20 32.40 68.55 31.45Q69.90 30.50 70.45 29.10L70.45 29.10L78.00 29.10Q77.40 32 75.65 34.17Q73.90 36.35 71.23 37.58Q68.55 38.80 65.15 38.80ZM98.35 38L80.50 10L88.85 10L106.70 38L98.35 38ZM98.20 10L106.55 10L88.70 38L80.35 38L98.20 10Z" />
    </svg>
  );
}

/** The mark alone, `size` px tall. */
export function LogoMark({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      role="img"
      aria-label="Plex"
      viewBox="0 0 41 40"
      height={size}
      width={Math.round((size * 41) / 40)}
      className={cn("inline-block shrink-0 text-ink", className)}
    >
      <MarkPaths />
    </svg>
  );
}

function MarkPaths() {
  return (
    <>
      <path fill="#0DCEDA" d="M33.724 36.5809C37.7426 32.5622 40.0003 27.1118 40.0003 21.4286C40.0003 15.7454 37.7426 10.2949 33.724 6.27629C29.7054 2.25765 24.2549 1.02188e-06 18.5717 0C12.8885 -1.02188e-06 7.43807 2.25764 3.41943 6.27628L10.4905 13.3473C11.6063 14.4631 13.4081 14.4074 14.8276 13.7181C15.9836 13.1568 17.2622 12.8571 18.5717 12.8571C20.845 12.8571 23.0252 13.7602 24.6326 15.3677C26.2401 16.9751 27.1431 19.1553 27.1431 21.4286C27.1431 22.7381 26.8435 24.0167 26.2822 25.1727C25.5929 26.5922 25.5372 28.394 26.6529 29.5098L33.724 36.5809Z" />
      <path fill="#6EF3D6" d="M30 40H19.5098C17.9943 40 16.5408 39.398 15.4692 38.3263L1.67368 24.5308C0.60204 23.4592 0 22.0057 0 20.4902V10L30 40Z" />
      <path fill="currentColor" d="M10.7143 39.9999H4.28571C1.91878 39.9999 0 38.0812 0 35.7142V29.2856L10.7143 39.9999Z" />
    </>
  );
}

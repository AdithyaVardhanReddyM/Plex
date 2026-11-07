"use client";

import { motion, useReducedMotion } from "motion/react";
import { ExternalLink, MapPin } from "lucide-react";
import { cn, formatCents } from "@/lib/utils";

/**
 * A cause's cover: generated from its `coverHue`, never an AI image. Smooth
 * washes only: the cause's own hue, pulled toward the brand's mint and aqua,
 * with a soft light from the top left and a deeper pool at the bottom right.
 */
export function CauseCover({
  hue,
  className,
  children,
}: {
  hue: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const style: React.CSSProperties = {
    backgroundColor: `hsl(${hue} 42% 84%)`,
    backgroundImage: [
      // a mint/aqua light from the top left, the brand under every cover
      `radial-gradient(70% 110% at 0% 0%, color-mix(in oklab, var(--color-green-100) 90%, transparent) 0%, transparent 60%)`,
      `radial-gradient(60% 100% at 100% 0%, hsl(${hue} 62% 82% / 0.95) 0%, transparent 64%)`,
      `radial-gradient(75% 120% at 94% 115%, hsl(${(hue + 24) % 360} 52% 62% / 0.85) 0%, transparent 62%)`,
      `radial-gradient(65% 100% at 10% 120%, hsl(${(hue + 340) % 360} 46% 70% / 0.75) 0%, transparent 60%)`,
      `linear-gradient(160deg, hsl(${hue} 44% 92%) 0%, hsl(${(hue + 14) % 360} 40% 76%) 100%)`,
    ].join(", "),
  };
  return (
    <div className={cn("relative isolate overflow-hidden", className)} style={style}>
      <span
        className="pointer-events-none absolute -top-1/3 -right-[12%] -z-10 aspect-square w-[55%] rounded-full bg-white/25 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 shadow-[inset_0_-48px_48px_-28px_rgb(12_21_18/0.08)]"
        aria-hidden
      />
      {children}
    </div>
  );
}

export function PlaceChip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-white/80 pr-3 pl-2.5 text-[12px] font-medium text-ink shadow-[0_6px_16px_-8px_rgb(12_21_18/0.3)] backdrop-blur",
        className,
      )}
    >
      <MapPin className="size-3.5 flex-none text-green-700" strokeWidth={2} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Raised against goal, in the brand gradient: this money already moved. */
export function RaisedBar({
  raisedCents,
  goalCents,
  className,
  thin,
  onDark,
}: {
  raisedCents: number;
  goalCents: number;
  className?: string;
  thin?: boolean;
  /** On a spotlight (night) card. */
  onDark?: boolean;
}) {
  const reduce = useReducedMotion();
  const pct = goalCents > 0 ? Math.min(100, (raisedCents / goalCents) * 100) : 0;
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-full",
        onDark ? "bg-white/10" : "bg-sunken",
        thin ? "h-1.5" : "h-2",
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${formatCents(raisedCents)} of ${formatCents(goalCents)}`}
    >
      <motion.div
        className={cn("absolute inset-y-0 left-0 rounded-full", onDark && "shadow-[0_0_18px_rgb(62_224_216/0.55)]")}
        style={{ backgroundImage: "var(--meter-brand)" }}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      />
    </div>
  );
}

/** Spots on a shift: one segment per person, filled when someone has it. */
export function SpotPips({ spots, filled, className }: { spots: number; filled: number; className?: string }) {
  const n = Math.min(spots, 12);
  return (
    <span className={cn("flex w-full max-w-[220px] items-center gap-1", className)} aria-label={`${filled} of ${spots} spots filled`}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cn("h-1.5 min-w-0 flex-1 rounded-full", i < filled ? "bg-ink" : "bg-sunken")} />
      ))}
    </span>
  );
}

/** The story is stored as short paragraphs with **bold** lead-ins. */
export function Story({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  return (
    <div className={cn("max-w-[64ch] space-y-3.5 text-[15px] leading-[1.7] text-pretty text-ink-2", className)}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") ? (
              <strong key={j} className="font-semibold text-ink">
                {part.slice(2, -2)}
              </strong>
            ) : (
              <span key={j}>{part}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

/**
 * A static map: OpenStreetMap tiles around the point, the point at the center.
 * Plain images, so it renders anywhere an iframe embed might be blocked.
 */
function TileMap({ lat, lng }: { lat: number; lng: number }) {
  const z = 15;
  const n = 2 ** z;
  const fx = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const tiles: Array<[number, number]> = [];
  for (let ty = Math.floor(fy) - 1; ty <= Math.floor(fy) + 1; ty++)
    for (let tx = Math.floor(fx) - 3; tx <= Math.floor(fx) + 3; tx++) tiles.push([tx, ty]);
  return (
    <div aria-hidden className="absolute top-1/2 left-1/2 [filter:saturate(0.45)_contrast(0.95)_brightness(1.02)]">
      {tiles.map(([tx, ty]) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${tx}-${ty}`}
          src={`https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`}
          alt=""
          width={256}
          height={256}
          loading="lazy"
          className="absolute max-w-none select-none"
          style={{ left: (tx - fx) * 256, top: (ty - fy) * 256 }}
        />
      ))}
    </div>
  );
}

/** A real map of where the work happens (OpenStreetMap), with a link out. */
export function LocationMap({
  label,
  lat,
  lng,
  className,
}: {
  label: string;
  lat?: number;
  lng?: number;
  className?: string;
}) {
  const hasPoint = typeof lat === "number" && typeof lng === "number";
  const href = hasPoint
    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(label)}`;
  return (
    <div className={cn("overflow-hidden rounded-lg bg-surface shadow-card", className)}>
      {hasPoint ? (
        <div className="relative h-56 overflow-hidden bg-sunken">
          <TileMap lat={lat!} lng={lng!} />
          <MapPin
            className="absolute top-1/2 left-1/2 size-9 -translate-x-1/2 -translate-y-full fill-green-300 text-ink drop-shadow-[0_6px_10px_rgb(12_21_18/0.35)]"
            strokeWidth={1.6}
            aria-hidden
          />
          <span className="absolute right-1.5 bottom-1 rounded-[4px] bg-surface/85 px-1.5 text-[10.5px] text-muted">
            © OpenStreetMap
          </span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <MapPin className="size-5 flex-none text-green-700" strokeWidth={1.9} />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-medium text-ink">{label}</div>
            {hasPoint ? (
              <div className="tabular font-mono text-[11.5px] text-faint">
                {lat!.toFixed(4)}, {lng!.toFixed(4)}
              </div>
            ) : null}
          </div>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex flex-none items-center gap-1 text-[13px] font-medium text-muted hover:text-ink"
        >
          Open map <ExternalLink className="size-3.5" strokeWidth={1.9} />
        </a>
      </div>
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  aside,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3.5 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-[19px] leading-tight font-bold tracking-[-0.025em] text-ink">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      </div>
      {aside ? <div className="flex-none text-[12.5px] text-muted">{aside}</div> : null}
    </div>
  );
}

/** Bay Area causes: shift times are shown in the place's own time zone. */
export const CAUSE_TZ = "America/Los_Angeles";

function clock(ms: number) {
  return new Date(ms)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CAUSE_TZ })
    .replace(":00", "")
    .replace(" AM", "am")
    .replace(" PM", "pm");
}

export function windowLabel(start: number, end: number) {
  const day = new Date(start).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: CAUSE_TZ,
  });
  return `${day} · ${clock(start)}–${clock(end)}`;
}

/** "Sat · 9am–12pm", for compact places. */
export function shortWindow(start: number, end: number) {
  const day = new Date(start).toLocaleDateString("en-US", { weekday: "short", timeZone: CAUSE_TZ });
  return `${day} · ${clock(start)}–${clock(end)}`;
}

/** Month and day parts for a calendar tile, in the cause's time zone. */
export function dayParts(ms: number) {
  const d = new Date(ms);
  return {
    month: d.toLocaleDateString("en-US", { month: "short", timeZone: CAUSE_TZ }),
    day: d.toLocaleDateString("en-US", { day: "numeric", timeZone: CAUSE_TZ }),
  };
}

/** "Sat, Oct 31 · 9:00am", in the cause's time zone. */
export function placeTime(ms: number) {
  const d = new Date(ms);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: CAUSE_TZ });
  const time = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CAUSE_TZ })
    .replace(" AM", "am")
    .replace(" PM", "pm");
  return `${day} · ${time}`;
}

/** A calendar tile: month over day, for shifts. */
export function DateTile({ ms, muted, className }: { ms: number; muted?: boolean; className?: string }) {
  const { month, day } = dayParts(ms);
  return (
    <span
      className={cn(
        "flex size-12 flex-none flex-col items-center justify-center overflow-hidden rounded-[14px] bg-[linear-gradient(160deg,var(--color-green-50),var(--color-green-100))] shadow-[0_6px_14px_-8px_rgb(13_150_158/0.5)]",
        muted && "bg-none bg-sunken shadow-none",
        className,
      )}
    >
      <span className={cn("text-[10.5px] leading-none font-semibold", muted ? "text-faint" : "text-green-800")}>{month}</span>
      <span className={cn("tabular mt-1 font-display text-[19px] leading-none font-extrabold tracking-[-0.03em]", muted ? "text-muted" : "text-ink")}>
        {day}
      </span>
    </span>
  );
}

/** A glass chip for spotlight (night) cards. */
export const GLASS =
  "rounded-full bg-white/[0.08] px-2.5 py-1 text-[12px] font-medium text-white/75 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]";

/** A big amount for dark grounds: the sign small and dim, the digits in the display face. */
export function DarkMoney({ cents, className }: { cents: number; className?: string }) {
  const f = formatCents(cents);
  return (
    <span className={cn("tabular inline-flex items-start font-display font-extrabold tracking-[-0.045em] text-white", className)}>
      <span className="mt-[0.18em] mr-1 text-[0.42em] font-bold text-white/45">$</span>
      {f.replace("$", "")}
    </span>
  );
}

/** A tinted card face, the way Home shows pots: mint for money that moves, steel for held. */
export const FACE = {
  mint: "bg-[linear-gradient(150deg,var(--color-green-50),var(--color-green-100)_70%,var(--color-green-200))]",
  aqua: "bg-[linear-gradient(150deg,var(--color-green-50),var(--color-green-100)_60%,var(--color-green-300))]",
  steel: "bg-[linear-gradient(150deg,var(--color-steel-50),var(--color-steel-100)_70%,var(--color-steel-200))]",
} as const;

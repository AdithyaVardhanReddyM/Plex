"use client";

import { motion, useReducedMotion } from "motion/react";
import { ExternalLink, MapPin } from "lucide-react";
import { cn, formatCents } from "@/lib/utils";

/**
 * A cause's cover: generated from its `coverHue`, never an AI image. A soft
 * wash in the cause's own hue, pulled toward the brand's mint and aqua, with
 * contour rings that read as a map of the place without pretending to be one
 * and a fine dot grain so the color has a surface.
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
    backgroundColor: `hsl(${hue} 28% 91%)`,
    backgroundImage: [
      // contour rings, off-center like a hill on a survey map
      `repeating-radial-gradient(circle at 74% 70%, transparent 0 19px, hsl(${hue} 30% 36% / 0.05) 19px 20px)`,
      // a mint/aqua light from the top left, the brand under every cover
      `radial-gradient(80% 120% at 0% 0%, color-mix(in oklab, var(--color-green-100) 70%, transparent) 0%, transparent 60%)`,
      `radial-gradient(70% 110% at 100% 0%, hsl(${hue} 44% 82% / 0.95) 0%, transparent 62%)`,
      `radial-gradient(90% 120% at 18% 110%, hsl(${(hue + 28) % 360} 36% 76% / 0.85) 0%, transparent 64%)`,
      `linear-gradient(160deg, hsl(${hue} 32% 94%) 0%, hsl(${(hue + 14) % 360} 30% 85%) 100%)`,
    ].join(", "),
  };
  return (
    <div className={cn("relative isolate overflow-hidden", className)} style={style}>
      <div className="dot-ground pointer-events-none absolute inset-0 -z-10 opacity-40 [mask-image:linear-gradient(90deg,transparent,black_60%)]" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 -z-10 shadow-[inset_0_-40px_40px_-24px_rgb(12_21_18/0.06)]"
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
        "inline-flex h-6 max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-full bg-surface/92 pr-2.5 pl-2 text-[12px] font-medium text-ink-2 shadow-card ring-1 ring-inset ring-line/70 backdrop-blur",
        className,
      )}
    >
      <MapPin className="size-3 flex-none text-green-700" strokeWidth={2.2} />
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
}: {
  raisedCents: number;
  goalCents: number;
  className?: string;
  thin?: boolean;
}) {
  const reduce = useReducedMotion();
  const pct = goalCents > 0 ? Math.min(100, (raisedCents / goalCents) * 100) : 0;
  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-full bg-sunken", thin ? "h-1.5" : "h-2", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${formatCents(raisedCents)} of ${formatCents(goalCents)}`}
    >
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ backgroundImage: "var(--meter-brand)" }}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      />
    </div>
  );
}

/** Spots on a shift: one capsule per person, filled when someone has it. */
export function SpotPips({ spots, filled, className }: { spots: number; filled: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} aria-label={`${filled} of ${spots} spots filled`}>
      {Array.from({ length: Math.min(spots, 12) }, (_, i) => (
        <span
          key={i}
          className={cn("h-2 w-3.5 rounded-full", i < filled ? "bg-ink-2" : "bg-surface ring-1 ring-inset ring-line-strong")}
        />
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
    <div className={cn("overflow-hidden rounded-lg border border-line bg-surface shadow-card", className)}>
      {hasPoint ? (
        <div className="relative h-52 overflow-hidden border-b border-line bg-sunken">
          <TileMap lat={lat!} lng={lng!} />
          <span className="absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-300/25 ring-1 ring-green-500/30" aria-hidden />
          <span className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-green-300 text-ink shadow-raised ring-[3px] ring-surface">
            <MapPin className="size-4" strokeWidth={1.9} />
          </span>
          <span className="absolute right-1.5 bottom-1 rounded-[4px] bg-surface/85 px-1.5 text-[10.5px] text-muted">
            © OpenStreetMap
          </span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 flex-none items-center justify-center rounded-[9px] bg-green-50 text-green-700 ring-1 ring-inset ring-green-100">
            <MapPin className="size-4" strokeWidth={1.9} />
          </span>
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
        <h2 className="text-[15px] font-semibold tracking-[-0.012em] text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
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
        "flex size-11 flex-none flex-col items-center justify-center overflow-hidden rounded-[12px] bg-surface ring-1 ring-inset ring-line shadow-card",
        muted && "bg-canvas shadow-none",
        className,
      )}
    >
      <span className={cn("text-[10.5px] leading-none font-semibold", muted ? "text-faint" : "text-green-700")}>{month}</span>
      <span className={cn("tabular mt-1 font-display text-[17px] leading-none font-bold tracking-[-0.02em]", muted ? "text-muted" : "text-ink")}>
        {day}
      </span>
    </span>
  );
}

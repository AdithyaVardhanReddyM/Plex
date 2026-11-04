"use client";

import { motion, useReducedMotion } from "motion/react";
import { ExternalLink, MapPin } from "lucide-react";
import { cn, formatCents } from "@/lib/utils";

/**
 * A cause's cover: generated from its `coverHue`, never an AI image. Soft
 * contour rings read as a map of the place without pretending to be one.
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
    backgroundColor: `hsl(${hue} 30% 90%)`,
    backgroundImage: [
      `radial-gradient(120% 140% at 88% 8%, hsl(${hue} 46% 80% / 0.95) 0%, transparent 55%)`,
      `radial-gradient(90% 120% at 6% 100%, hsl(${(hue + 24) % 360} 38% 72% / 0.9) 0%, transparent 60%)`,
      `repeating-radial-gradient(circle at 72% 64%, transparent 0 17px, hsl(${hue} 30% 40% / 0.07) 17px 18px)`,
      `linear-gradient(160deg, hsl(${hue} 34% 93%) 0%, hsl(${(hue + 12) % 360} 32% 84%) 100%)`,
    ].join(", "),
  };
  return (
    <div className={cn("relative overflow-hidden", className)} style={style}>
      {children}
    </div>
  );
}

export function PlaceChip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full bg-surface/90 px-2.5 text-[12.5px] font-medium text-ink-2 shadow-card ring-1 ring-black/5 backdrop-blur",
        className,
      )}
    >
      <MapPin className="size-3.5 text-green-600" strokeWidth={1.9} />
      {label}
    </span>
  );
}

/** Raised against goal. Green: this money already moved. */
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
        className="absolute inset-y-0 left-0 rounded-full bg-green-500"
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      />
    </div>
  );
}

/** Funded spots for a shift: one pip per person. */
export function SpotPips({ spots, filled, className }: { spots: number; filled: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label={`${filled} of ${spots} spots filled`}>
      {Array.from({ length: Math.min(spots, 12) }, (_, i) => (
        <span
          key={i}
          className={cn("size-2 rounded-full", i < filled ? "bg-ink-2" : "bg-surface ring-1 ring-inset ring-line-strong")}
        />
      ))}
    </span>
  );
}

/** The story is stored as short paragraphs with **bold** lead-ins. */
export function Story({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  return (
    <div className={cn("space-y-3.5 text-[15px] leading-[1.65] text-ink-2", className)}>
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

/** A small labeled number. */
export function Stat({ value, label, className }: { value: React.ReactNode; label: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="tabular text-[17px] font-semibold tracking-[-0.015em] text-ink">{value}</div>
      <div className="mt-0.5 text-[12.5px] text-muted">{label}</div>
    </div>
  );
}

/** A real map of where the work happens (OpenStreetMap), with a link out. */
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
    <div aria-hidden className="absolute top-1/2 left-1/2 [filter:saturate(0.55)_contrast(0.96)]">
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
        <div className="relative h-48 overflow-hidden bg-sunken">
          <TileMap lat={lat!} lng={lng!} />
          <span className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-green-600 text-white shadow-float ring-4 ring-surface/80">
            <MapPin className="size-4" strokeWidth={1.9} />
          </span>
          <span className="absolute right-1.5 bottom-1 rounded-sm bg-surface/80 px-1.5 text-[10.5px] text-muted">
            © OpenStreetMap
          </span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <MapPin className="size-4 flex-none text-green-600" strokeWidth={1.9} />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium text-ink">{label}</div>
            {hasPoint ? (
              <div className="tabular text-[12px] text-faint">
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
  aside,
  className,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-3", className)}>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      {aside ? <div className="text-[13px] text-muted">{aside}</div> : null}
    </div>
  );
}

/** Bay Area causes: shift times are shown in the place's own time zone. */
export const CAUSE_TZ = "America/Los_Angeles";

export function windowLabel(start: number, end: number) {
  const day = new Date(start).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: CAUSE_TZ,
  });
  const t = (ms: number) =>
    new Date(ms)
      .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CAUSE_TZ })
      .replace(":00", "")
      .replace(" AM", "am")
      .replace(" PM", "pm");
  return `${day} · ${t(start)}–${t(end)}`;
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

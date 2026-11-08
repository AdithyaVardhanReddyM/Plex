"use client";

import { Check, Loader2, MapPin, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** A big choice: icon, title and a line of hint. Selected reads as ink, not a glow. */
export function OptionCard({
  icon,
  title,
  hint,
  selected,
  onClick,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group flex w-full items-center gap-4 rounded-[16px] bg-surface px-5 py-4 text-left transition-[box-shadow,transform] duration-150 active:scale-[0.99]",
        selected ? "shadow-[0_0_0_2px_var(--color-ink),var(--shadow-raised)]" : "shadow-card hover:shadow-hover",
      )}
    >
      {icon ? <span className="flex-none text-ink-2 [&_svg]:size-5 [&_svg]:stroke-[1.9]">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</span>
        {hint ? <span className="mt-0.5 block text-[13px] leading-snug text-muted">{hint}</span> : null}
      </span>
      <span
        className={cn(
          "flex size-5 flex-none items-center justify-center rounded-full transition-colors",
          selected ? "bg-ink text-white" : "text-transparent shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]",
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    </button>
  );
}

/** A pill that toggles on and off. */
export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium transition-[background-color,color,box-shadow] duration-150",
        selected ? "bg-ink text-white" : "bg-surface text-ink-2 shadow-card hover:text-ink hover:shadow-hover",
      )}
    >
      {selected ? <Check className="size-3.5" strokeWidth={2.6} /> : null}
      {children}
    </button>
  );
}

export function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** Type and Enter to add; × to remove. */
export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  max = 20,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  suggestions?: string[];
  max?: number;
}) {
  const [text, setText] = useState("");
  const add = (t: string) => {
    const s = t.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!s || value.some((v) => v.toLowerCase() === s.toLowerCase()) || value.length >= max) return;
    onChange([...value, s]);
  };
  const open = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8);
  return (
    <div>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-[12px] bg-surface p-1.5 shadow-card focus-within:shadow-[0_0_0_2px_var(--color-green-500),var(--shadow-card)]">
        {value.map((v) => (
          <span key={v} className="inline-flex h-8 items-center gap-1 rounded-full bg-sunken pr-1.5 pl-3 text-[13px] font-medium text-ink">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full p-0.5 text-faint hover:text-ink">
              <X className="size-3.5" strokeWidth={2.2} />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(text);
              setText("");
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => {
            if (text.trim()) {
              add(text);
              setText("");
            }
          }}
          placeholder={value.length ? "Add another" : placeholder}
          className="h-8 min-w-[140px] flex-1 bg-transparent px-2 text-[14px] text-ink outline-none placeholder:text-faint"
        />
      </div>
      {open.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {open.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              <Plus className="size-3.5" strokeWidth={2} /> {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type Place = { label: string; lat?: number; lng?: number };

type GeoResult = { id: number; name: string; admin1?: string; country?: string; latitude: number; longitude: number };

/**
 * A city, with suggestions from Open-Meteo's free geocoder (only the typed
 * text is sent). Typing without picking still works; it just has no
 * coordinates, so distance matching is skipped.
 */
export function PlaceField({ value, onChange }: { value: Place | null; onChange: (p: Place | null) => void }) {
  const [text, setText] = useState(value?.label ?? "");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const picked = useRef(false);

  useEffect(() => {
    const q = text.trim();
    if (picked.current || q.length < 2) {
      picked.current = false;
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`, {
          signal: ctrl.signal,
        });
        const d = (await r.json()) as { results?: GeoResult[] };
        setResults(d.results ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        // Offline or blocked: the typed text still saves.
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text]);

  const label = (r: GeoResult) => [r.name, r.admin1, r.country].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ");
  const choose = (r: GeoResult) => {
    picked.current = true;
    const l = label(r);
    setText(l);
    setOpen(false);
    onChange({ label: l, lat: r.latitude, lng: r.longitude });
  };

  return (
    <div className="relative">
      <MapPin className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" strokeWidth={1.9} />
      <Input
        value={text}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="City, e.g. San Francisco"
        className="h-11 pl-10 text-[14.5px]"
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.trim() ? { label: e.target.value.trim() } : null);
        }}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || !results.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % results.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + results.length) % results.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(results[active]!);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {loading ? <Loader2 className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-faint" /> : null}
      {open && results.length ? (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-[12px] bg-surface p-1 shadow-float">
          {results.map((r, i) => (
            <button
              key={r.id}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(r)}
              onMouseEnter={() => setActive(i)}
              className={cn("flex w-full items-baseline gap-2 rounded-[8px] px-3 py-2 text-left text-[13.5px]", i === active && "bg-sunken")}
            >
              <span className="font-medium text-ink">{r.name}</span>
              <span className="truncate text-muted">{[r.admin1, r.country].filter(Boolean).join(", ")}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

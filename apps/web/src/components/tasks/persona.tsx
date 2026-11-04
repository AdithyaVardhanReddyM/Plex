"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { Check, ChevronDown, Repeat2 } from "lucide-react";
import { api } from "@/lib/convex";
import { Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * Tasks is two-sided. Guests explore as Adi, the poster; the switcher lets
 * them act as a seeded demo worker (Rosa, Luis…) to apply, upload proof and
 * get paid, or as the demo NGO to approve its impact shifts. Signed-in users are always themselves (the backend ignores `as`).
 */

const KEY = "plex.tasks.as";
const listeners = new Set<() => void>();

function read(): string | undefined {
  try {
    return localStorage.getItem(KEY) || undefined;
  } catch {
    return undefined;
  }
}

function write(handle: string | undefined) {
  try {
    if (handle) localStorage.setItem(KEY, handle);
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", l);
  };
};

const PersonaContext = createContext<{ as: string | undefined; setAs: (h: string | undefined) => void }>({
  as: undefined,
  setAs: () => {},
});

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const stored = useSyncExternalStore(subscribe, read, () => undefined);
  const viewer = useQuery(api.users.viewer);
  // Signed-in people never borrow a persona.
  const as = viewer && !viewer.isGuest ? undefined : stored === "adi" ? undefined : stored;
  const setAs = useCallback((h: string | undefined) => write(h === "adi" ? undefined : h), []);
  return <PersonaContext.Provider value={{ as, setAs }}>{children}</PersonaContext.Provider>;
}

/** The handle to pass as `as` to Tasks queries and mutations. */
export function useAs() {
  return useContext(PersonaContext).as;
}

export function usePersona() {
  return useContext(PersonaContext);
}

/** Adi and demo orgs post tasks; everyone else is a worker. */
export function isPosterPersona(p: { handle: string; kind: string }) {
  return p.handle === "adi" || p.kind !== "person";
}

/** "Acting as" switcher. Hidden for signed-in users. */
export function PersonaSwitch({ className }: { className?: string }) {
  const { as, setAs } = usePersona();
  const viewer = useQuery(api.users.viewer);
  const people = useQuery(api.tasks.personas);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!viewer?.isGuest || !people) return null;
  const current = people.find((p) => p.handle === (as ?? "adi")) ?? people.find((p) => p.handle === "adi");
  if (!current) return null;
  const isPoster = isPosterPersona(current);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-open={open || undefined}
        className="flex h-9 items-center gap-2 rounded-sm border border-line bg-surface pr-2.5 pl-1.5 text-[13px] shadow-card transition-colors hover:border-line-strong data-open:border-line-strong data-open:bg-canvas"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={current.name} color={current.avatarColor} size={24} />
        <span className="text-muted">Acting as</span>
        <span className="font-medium text-ink">{current.name.split(" ")[0]}</span>
        <ChevronDown className="size-4 text-faint" strokeWidth={1.9} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1.5 w-72 rounded-md border border-line bg-surface p-1.5 shadow-float animate-rise"
        >
          <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-2 text-[12px] text-muted">
            <Repeat2 className="size-4 text-faint" strokeWidth={1.9} />
            Try both sides of a task. Demo people only.
          </div>
          {people.map((p) => {
            const active = p.handle === current.handle;
            return (
              <button
                key={p._id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                aria-label={`${p.name}, ${isPosterPersona(p) ? "poster" : "worker"}`}
                onClick={() => {
                  setAs(p.handle);
                  setOpen(false);
                }}
                className={cn(
                  "grid w-full grid-cols-[28px_minmax(0,1fr)_16px] items-center gap-2.5 rounded-sm px-2.5 py-2 text-left transition-colors hover:bg-sunken",
                  active && "bg-sunken",
                )}
              >
                <Avatar name={p.name} color={p.avatarColor} size={28} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {p.handle === "adi"
                      ? "Poster · your account"
                      : p.kind === "org"
                        ? "Poster · posts its impact shifts"
                        : `Worker · ${p.area ?? "Plex"}`}
                  </span>
                </span>
                {active ? <Check className="size-4 text-green-600" strokeWidth={1.9} /> : <span />}
              </button>
            );
          })}
        </div>
      ) : null}
      <span className="sr-only">{isPoster ? "Acting as the poster" : "Acting as a worker"}</span>
    </div>
  );
}

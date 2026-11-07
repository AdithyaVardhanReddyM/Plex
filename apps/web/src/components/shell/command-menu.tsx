"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Bot,
  CornerDownLeft,
  HeartHandshake,
  KeyRound,
  Pause,
  Play,
  Plus,
  Search,
  type LucideIcon,
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/convex";
import { cn } from "@/lib/utils";
import { IconTile, Kbd } from "@/components/ui/primitives";
import { NAV } from "./nav";

type Command = {
  id: string;
  group: "Go to" | "Create" | "Agents";
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
};

const CommandContext = createContext<{ open: () => void }>({ open: () => {} });

/** Opens the command menu from anywhere in the app. */
export function useCommandMenu() {
  return useContext(CommandContext);
}

export function CommandMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const value = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <CommandContext.Provider value={value}>
      {children}
      <AnimatePresence>{open ? <CommandMenu onClose={() => setOpen(false)} /> : null}</AnimatePresence>
    </CommandContext.Provider>
  );
}

function CommandMenu({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer);
  const setPaused = useMutation(api.users.setPaused);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (href: string) => () => {
      router.push(href);
      onClose();
    },
    [router, onClose],
  );

  const commands = useMemo<Command[]>(() => {
    const paused = Boolean(viewer?.agentsPaused);
    return [
      ...NAV.map((n) => ({ id: n.href, group: "Go to" as const, label: n.label, hint: n.hint, icon: n.icon, run: go(n.href) })),
      { id: "new-task", group: "Create", label: "Post a task", hint: "Pay a person or an agent on proof", icon: Plus, run: go("/tasks/new") },
      { id: "new-agent", group: "Create", label: "Create an agent", hint: "List an AI worker on Hire", icon: Bot, run: go("/hire/new") },
      { id: "new-cause", group: "Create", label: "Build a cause page", hint: "Donations that pay for proven work", icon: HeartHandshake, run: go("/causes/new") },
      { id: "new-key", group: "Create", label: "Create an API key", hint: "Give Claude or any agent a key", icon: KeyRound, run: go("/developers") },
      {
        id: "pause",
        group: "Agents",
        label: paused ? "Resume agent spending" : "Pause all agent spending",
        hint: paused ? "Agents can spend inside their rules again" : "Every key stops spending at once",
        icon: paused ? Play : Pause,
        run: () => {
          void setPaused({ paused: !paused });
          onClose();
        },
      },
    ];
  }, [go, onClose, setPaused, viewer?.agentsPaused]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.hint ?? ""} ${c.group}`.toLowerCase().includes(q));
  }, [commands, query]);

  const active = Math.min(index, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]" onKeyDown={onKeyDown}>
      <motion.div
        className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-label="Command menu"
        className="relative w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-surface shadow-float"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex h-14 items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-faint" strokeWidth={1.9} />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            placeholder="Search Plex or jump to…"
            className="h-full flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
          />
          <Kbd>esc</Kbd>
        </div>
        <div ref={listRef} className="scroll-quiet max-h-[min(420px,60vh)] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-3 py-10 text-center text-[13px] text-muted">Nothing matches “{query}”.</div>
          ) : (
            results.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              return (
                <div key={c.id}>
                  {header ? (
                    <div className="px-2.5 pt-2.5 pb-1.5 text-[11.5px] font-medium text-faint">{header}</div>
                  ) : null}
                  <button
                    type="button"
                    data-index={i}
                    onMouseMove={() => setIndex(i)}
                    onClick={c.run}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors",
                      i === active ? "bg-sunken" : "",
                    )}
                  >
                    <IconTile size="sm" tone={i === active ? "white" : "neutral"}>
                      <c.icon />
                    </IconTile>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{c.label}</span>
                      {c.hint ? <span className="block truncate text-[12px] text-muted">{c.hint}</span> : null}
                    </span>
                    {i === active ? (
                      <CornerDownLeft className="size-3.5 text-faint" strokeWidth={1.9} />
                    ) : (
                      <ArrowRight className="size-3.5 text-transparent" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="flex h-10 items-center gap-4 border-t border-line bg-canvas/60 px-4 text-[11.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> to open
          </span>
          <span className="ml-auto">Plex · PayPal sandbox</span>
        </div>
      </motion.div>
    </div>
  );
}

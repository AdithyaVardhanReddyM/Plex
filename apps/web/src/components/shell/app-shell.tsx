"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, ChevronRight, Menu, Plus, Search, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/convex";
import { Kbd, Meter, StatusDot, Switch } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatCents } from "@/lib/utils";
import { Wordmark } from "./wordmark";
import { UserRow } from "./account";
import { CommandMenuProvider, useCommandMenu } from "./command-menu";
import { NAV_GROUPS, navFor } from "./nav";

/** Pathname is request data on dynamic routes, so anything that reads it streams in. */
function usePath() {
  return usePathname() ?? "";
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function useCounts() {
  const approvals = useQuery(api.pots.pendingApprovals);
  const tasks = useQuery(api.pots.myOpenTasks);
  return {
    "/pots": approvals?.length ?? 0,
    "/tasks": tasks?.length ?? 0,
  } as Record<string, number>;
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavItems pathname="" onNavigate={onNavigate} />}>
      <ActiveNav onNavigate={onNavigate} />
    </Suspense>
  );
}

function ActiveNav({ onNavigate }: { onNavigate?: () => void }) {
  return <NavItems pathname={usePath()} onNavigate={onNavigate} />;
}

function NavItems({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const counts = useCounts();
  return (
    <nav className="flex flex-col gap-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-2.5 pb-1.5 text-[11.5px] font-medium text-faint">{group.label}</div>
          <div className="flex flex-col gap-px">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              const count = counts[href] ?? 0;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex h-8 items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] transition-colors",
                    active ? "font-medium text-ink" : "text-ink-2 hover:bg-sunken hover:text-ink",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-[9px] bg-surface shadow-[0_1px_2px_rgb(12_21_18/0.06),0_0_0_1px_var(--color-line)]"
                      transition={{ type: "spring", stiffness: 520, damping: 42 }}
                    />
                  ) : null}
                  <Icon
                    className={cn("relative size-4 flex-none", active ? "text-ink" : "text-faint group-hover:text-ink-2")}
                    strokeWidth={1.9}
                  />
                  <span className="relative flex-1 truncate">{label}</span>
                  {count > 0 ? (
                    <span
                      className={cn(
                        "tabular relative rounded-full px-1.5 text-[11px] leading-[18px] font-medium",
                        href === "/pots" ? "bg-steel-100 text-steel-700" : "bg-sunken text-muted",
                        active && href !== "/pots" && "bg-canvas",
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SearchButton({ className }: { className?: string }) {
  const { open } = useCommandMenu();
  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-[10px] border border-line bg-surface px-2.5 text-[13px] text-faint shadow-card transition-colors hover:border-line-strong hover:text-muted",
        className,
      )}
    >
      <Search className="size-4" strokeWidth={1.9} />
      <span className="flex-1 text-left">Search or jump to…</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}

/** Agent spending: the kill switch, live state and this month's spend across pots. */
function AgentsCard() {
  const viewer = useQuery(api.users.viewer);
  const pots = useQuery(api.pots.list);
  const setPaused = useMutation(api.users.setPaused);
  const paused = Boolean(viewer?.agentsPaused);
  const spent = pots?.reduce((s, p) => s + p.spentMonthCents, 0) ?? 0;
  const budget = pots?.reduce((s, p) => s + p.monthlyBudgetCents, 0) ?? 0;

  return (
    <div
      className={cn(
        "rounded-[12px] border bg-surface p-3 shadow-card transition-colors",
        paused ? "border-refunded/25" : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">Agent spending</div>
          <div className={cn("mt-0.5 flex items-center gap-1.5 text-[11.5px]", paused ? "text-refunded" : "text-muted")}>
            <StatusDot tone={paused ? "amber" : "green"} live={!paused && viewer !== undefined} />
            {paused ? "Paused, nothing can spend" : "Live, inside your rules"}
          </div>
        </div>
        <Switch
          checked={!paused}
          onChange={(on) => viewer && setPaused({ paused: !on })}
          label={paused ? "Resume agent spending" : "Pause agent spending"}
        />
      </div>
      <div className="mt-3 border-t border-line pt-2.5">
        <div className="tabular mb-1.5 flex items-baseline justify-between text-[11.5px] text-muted">
          <span>This month</span>
          <span>
            <span className="font-medium text-ink-2">{formatCents(spent)}</span> of {formatCents(budget)}
          </span>
        </div>
        <Meter value={budget ? spent / budget : 0} size="sm" label="Spent this month across pots" />
      </div>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="scroll-quiet -mx-1 flex-1 overflow-y-auto px-1 pb-4">
        <NavList onNavigate={onNavigate} />
      </div>
      <div className="flex flex-col gap-2 pt-2">
        <AgentsCard />
        <UserRow />
      </div>
    </>
  );
}

// ── Top bar ──────────────────────────────────────────────────────────────────

const SUB_LABELS: Record<string, string> = { new: "New", proof: "Proof" };

function Crumbs() {
  const pathname = usePath();
  const item = navFor(pathname);
  if (!item) return null;
  const rest = pathname.slice(item.href.length).split("/").filter(Boolean);
  const sub = rest.length ? (SUB_LABELS[rest[rest.length - 1]!] ?? "Details") : null;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-2 rounded-[8px] px-1.5 py-1 font-medium transition-colors hover:bg-sunken",
          sub ? "text-muted" : "text-ink",
        )}
      >
        <item.icon className="size-4 text-faint" strokeWidth={1.9} />
        {item.label}
      </Link>
      {sub ? (
        <>
          <ChevronRight className="size-3.5 flex-none text-line-strong" strokeWidth={2} />
          <span className="truncate px-1 font-medium text-ink">{sub}</span>
        </>
      ) : null}
    </div>
  );
}

function ApprovalsBell() {
  const approvals = useQuery(api.pots.pendingApprovals);
  const n = approvals?.length ?? 0;
  return (
    <Link
      href="/pots"
      aria-label={n ? `${n} approvals waiting` : "Approvals"}
      className="relative flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
    >
      <Bell className="size-4" strokeWidth={1.9} />
      {n ? (
        <span className="tabular absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-semibold text-ink ring-2 ring-panel">
          {n}
        </span>
      ) : null}
    </Link>
  );
}

function TopBar() {
  const { open } = useCommandMenu();
  return (
    <header className="sticky top-0 z-20 hidden h-14 items-center justify-between gap-4 border-b border-line/80 bg-panel/85 px-5 backdrop-blur-md lg:flex lg:rounded-t-xl">
      <Suspense fallback={<div />}>
        <Crumbs />
      </Suspense>
      <div className="flex flex-none items-center gap-1.5">
        <span className="mr-1.5 hidden items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium text-muted xl:flex">
          <StatusDot tone="steel" />
          PayPal sandbox
        </span>
        <button
          type="button"
          onClick={open}
          aria-label="Search"
          className="flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
        >
          <Search className="size-4" strokeWidth={1.9} />
        </button>
        <ApprovalsBell />
        <span className="mx-1.5 h-5 w-px bg-line" />
        <Link href="/tasks/new" className={buttonVariants({ size: "sm" })}>
          <Plus /> Post a task
        </Link>
      </div>
    </header>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────

function MobileBar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { open: openSearch } = useCommandMenu();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
      <Link href="/home" aria-label="Plex home">
        <Wordmark size={17} />
      </Link>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search"
          className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-sunken"
        >
          <Search className="size-[18px]" strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-sunken"
          onClick={onToggle}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
    </header>
  );
}

function ScrollReset() {
  const pathname = usePath();
  useEffect(() => {
    document.getElementById("app-scroll")?.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <CommandMenuProvider>
      <div className="min-h-screen bg-canvas lg:flex lg:h-screen lg:overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden w-[252px] flex-none flex-col px-3 pt-4 pb-3 lg:flex">
          <div className="mb-4 flex h-8 items-center justify-between px-2">
            <Link href="/home" aria-label="Plex home">
              <Wordmark size={17} />
            </Link>
          </div>
          <SearchButton className="mb-5" />
          <SidebarBody />
        </aside>

        <MobileBar open={open} onToggle={() => setOpen((o) => !o)} />
        <AnimatePresence>
          {open ? (
            <motion.div
              className="fixed inset-x-0 top-14 bottom-0 z-20 flex flex-col bg-canvas px-3 pt-3 pb-4 lg:hidden"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
            >
              <SearchButton className="mb-4" />
              <SidebarBody onNavigate={() => setOpen(false)} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* The content sheet */}
        <div className="min-w-0 flex-1 lg:py-2 lg:pr-2">
          <div
            id="app-scroll"
            className="scroll-quiet relative bg-panel lg:h-full lg:overflow-y-auto lg:rounded-xl lg:border lg:border-line lg:shadow-card"
          >
            <TopBar />
            <Suspense fallback={null}>
              <ScrollReset />
            </Suspense>
            <div className="aurora pointer-events-none absolute inset-x-0 top-0 h-[340px] lg:rounded-t-xl" aria-hidden />
            <main className="relative mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-10 lg:pt-9 lg:pb-14">
              {children}
            </main>
          </div>
        </div>
      </div>
    </CommandMenuProvider>
  );
}

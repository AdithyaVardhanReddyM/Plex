"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  House,
  ListChecks,
  HeartHandshake,
  LayoutDashboard,
  ReceiptText,
  PiggyBank,
  Pause,
  Play,
  Menu,
  X,
} from "lucide-react";
import { Suspense, useState } from "react";
import { api } from "@/lib/convex";
import { Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { Wordmark } from "./wordmark";

export const NAV = [
  { href: "/home", label: "Home", icon: House },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/causes", label: "Causes", icon: HeartHandshake },
  { href: "/ledger", label: "Ledger", icon: LayoutDashboard },
  { href: "/receipts", label: "Receipts", icon: ReceiptText },
  { href: "/pots", label: "Pots & limits", icon: PiggyBank },
] as const;

/** Pathname is request data on dynamic routes, so the active state streams in. */
function NavLinks(props: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavList pathname="" {...props} />}>
      <ActiveNav {...props} />
    </Suspense>
  );
}

function ActiveNav(props: { onNavigate?: () => void }) {
  return <NavList pathname={usePathname()} {...props} />;
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-[14px] font-medium transition-colors",
              active ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:bg-sunken hover:text-ink",
            )}
          >
            <Icon className={cn("size-4", active ? "text-green-700" : "text-faint")} strokeWidth={1.9} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function PauseSwitch() {
  const viewer = useQuery(api.users.viewer);
  const setPaused = useMutation(api.users.setPaused);
  if (!viewer) return <div className="h-9" />;
  const paused = Boolean(viewer.agentsPaused);
  return (
    <button
      type="button"
      onClick={() => setPaused({ paused: !paused })}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-[13px] font-medium transition-colors",
        paused
          ? "bg-refunded-bg text-refunded ring-1 ring-inset ring-refunded/20"
          : "text-muted hover:bg-sunken hover:text-ink",
      )}
      aria-pressed={paused}
    >
      {paused ? <Play className="size-4" strokeWidth={1.9} /> : <Pause className="size-4" strokeWidth={1.9} />}
      {paused ? "Agent spending paused" : "Pause agent spending"}
    </button>
  );
}

function ViewerCard() {
  const viewer = useQuery(api.users.viewer);
  if (viewer === undefined) return <div className="h-12" />;
  if (viewer === null)
    return <div className="px-2.5 text-[12.5px] text-muted">Run <code className="font-mono">pnpm seed</code> to create the demo world.</div>;
  return (
    <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
      <Avatar name={viewer.name} color={viewer.avatarColor} size={30} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-ink">{viewer.name}</div>
        <div className="truncate text-[12px] text-muted">{viewer.isGuest ? "Guest · demo sandbox" : "PayPal sandbox"}</div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-canvas px-3 py-4 lg:flex">
        <Link href="/" className="mb-6 flex h-8 items-center px-2.5">
          <Wordmark />
        </Link>
        <NavLinks />
        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
          <PauseSwitch />
          <ViewerCard />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <Link href="/">
          <Wordmark />
        </Link>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-sm text-ink-2 hover:bg-sunken"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>
      {open ? (
        <div className="fixed inset-x-0 top-14 z-20 border-b border-line bg-canvas px-3 py-3 shadow-raised lg:hidden">
          <NavLinks onNavigate={() => setOpen(false)} />
          <div className="mt-3 border-t border-line pt-3">
            <PauseSwitch />
          </div>
        </div>
      ) : null}

      <main className="min-w-0">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}

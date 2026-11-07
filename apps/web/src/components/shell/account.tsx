"use client";

import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronsUpDown, LogIn, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/convex";
import { CLERK_ENABLED } from "@/components/providers";
import { Avatar, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * The signed-in person at the foot of the sidebar. With Clerk on, the row
 * opens a small menu: account settings and sign out.
 */
export function UserRow() {
  const viewer = useQuery(api.users.viewer);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (viewer === undefined)
    return (
      <div className="flex items-center gap-2.5 px-2 py-2">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-3.5 w-24" />
      </div>
    );
  if (viewer === null)
    return <div className="px-2.5 py-2 text-[12.5px] text-muted">Setting up your account…</div>;

  return (
    <div ref={ref} className="relative">
      <AnimatePresence>
        {open && CLERK_ENABLED ? (
          <motion.div
            className="absolute inset-x-0 bottom-[calc(100%+6px)] z-40 overflow-hidden rounded-[12px] border border-line bg-surface p-1 shadow-float"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14 }}
          >
            <ClerkMenu onDone={() => setOpen(false)} />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-sunken",
          open && "bg-sunken",
        )}
      >
        <Avatar name={viewer.name} color={viewer.avatarColor} src={viewer.avatarUrl} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">{viewer.name}</span>
          <span className="block truncate text-[11.5px] text-muted">
            {viewer.isGuest ? "Guest · demo sandbox" : `@${viewer.handle}`}
          </span>
        </span>
        <ChevronsUpDown className="size-3.5 flex-none text-faint" strokeWidth={1.9} />
      </button>
    </div>
  );
}

function ClerkMenu({ onDone }: { onDone: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const clerk = useClerk();
  const item =
    "flex h-8 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-sunken hover:text-ink [&_svg]:size-4 [&_svg]:stroke-[1.9] [&_svg]:text-faint";
  if (!isAuthenticated)
    return (
      <Link href="/sign-in" className={item} onClick={onDone}>
        <LogIn /> Sign in
      </Link>
    );
  return (
    <>
      <button
        type="button"
        className={item}
        onClick={() => {
          clerk.openUserProfile();
          onDone();
        }}
      >
        <UserRound /> Account settings
      </button>
      <button type="button" className={item} onClick={() => void clerk.signOut({ redirectUrl: "/" })}>
        <LogOut /> Sign out
      </button>
    </>
  );
}

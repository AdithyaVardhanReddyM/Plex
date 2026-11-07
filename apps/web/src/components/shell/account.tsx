"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { LogIn } from "lucide-react";
import { api } from "@/lib/convex";
import { CLERK_ENABLED } from "@/components/providers";

/**
 * Sign in with Clerk, or keep exploring as a guest. After sign-in the user's
 * own Plex row is created (`users.ensureViewer`); until then, and for guests,
 * the app shows the seeded demo world.
 */
export function AccountControl() {
  if (!CLERK_ENABLED) return null;
  return <ClerkAccount />;
}

function ClerkAccount() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureViewer = useMutation(api.users.ensureViewer);

  useEffect(() => {
    if (isAuthenticated) void ensureViewer();
  }, [isAuthenticated, ensureViewer]);

  if (isLoading) return <div className="h-9" />;
  if (isAuthenticated)
    return (
      <div className="flex h-9 items-center gap-2.5 px-2.5 text-[13px] text-muted">
        <UserButton />
        Account
      </div>
    );
  return (
    <Link
      href="/sign-in"
      className="flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
    >
      <LogIn className="size-4" strokeWidth={1.9} />
      Sign in
    </Link>
  );
}

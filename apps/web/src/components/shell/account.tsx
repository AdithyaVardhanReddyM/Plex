"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { LogIn } from "lucide-react";
import { CLERK_ENABLED } from "@/components/providers";

/** The Clerk account button, or a link to /sign-in when signed out. */
export function AccountControl() {
  if (!CLERK_ENABLED) return null;
  return <ClerkAccount />;
}

function ClerkAccount() {
  const { isAuthenticated, isLoading } = useConvexAuth();

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

import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { AuthShell, clerkAppearance } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  // Without Clerk keys everyone is a guest, so there's nothing to sign in to.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) redirect("/home");
  return (
    <AuthShell>
      {/* SignUp reads the URL at request time, so it streams in after the static shell. */}
      <Suspense>
        <SignUp appearance={clerkAppearance} fallbackRedirectUrl="/home" />
      </Suspense>
    </AuthShell>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { AuthShell, clerkAppearance } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  // Without Clerk keys everyone is a guest, so there's nothing to sign in to.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) redirect("/home");
  return (
    <AuthShell>
      {/* SignIn reads the URL at request time, so it streams in after the static shell. */}
      <Suspense>
        <SignIn appearance={clerkAppearance} fallbackRedirectUrl="/home" />
      </Suspense>
    </AuthShell>
  );
}

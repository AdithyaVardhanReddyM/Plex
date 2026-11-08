import { Suspense } from "react";
import type { Metadata } from "next";
import { ClientOnly } from "@/components/client-only";
import { OnboardingView, OnboardingLoading } from "./onboarding-view";

export const metadata: Metadata = { title: "Welcome to Plex" };

// Live Convex data and the person's own answers: rendered in the browser only.
export const instant = false;

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <ClientOnly fallback={<OnboardingLoading />}>
        <OnboardingView />
      </ClientOnly>
    </Suspense>
  );
}

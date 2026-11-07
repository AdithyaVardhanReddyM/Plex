import { Suspense } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ClientOnly } from "@/components/client-only";
import { Skeleton } from "@/components/ui/primitives";
import { Wordmark } from "@/components/shell/wordmark";

// Public, shareable cause pages: no app sidebar. Live Convex data with
// relative times, so the content renders in the browser only.
export const instant = false;

export default function PublicCauseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-baseline gap-2">
            <Wordmark size={19} />
            <span className="text-[14px] font-medium text-muted">Causes</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
            <ShieldCheck className="size-4 text-green-700" strokeWidth={1.9} />
            <span className="hidden sm:inline">Every donation gets a receipt ·</span> PayPal sandbox
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 lg:py-10">
        <Suspense fallback={<PageSkeleton />}>
          <ClientOnly fallback={<PageSkeleton />}>{children}</ClientOnly>
        </Suspense>
      </main>
      <footer className="mx-auto w-full max-w-[1120px] px-4 pb-10 text-[12.5px] leading-relaxed text-faint sm:px-6">
        Plex pays local people for the work, only after their proof passes. Organizations, people and amounts here are a
        demo in the PayPal sandbox.
      </footer>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div>
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="mt-6 h-8 w-80 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
    </div>
  );
}

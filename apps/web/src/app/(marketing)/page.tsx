import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";

// Placeholder landing: the full page is built in its own session.
export default function Landing() {
  return (
    <main className="grid-ground flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Wordmark size={28} />
      <h1 className="mt-8 max-w-2xl text-[44px] font-semibold leading-[1.05] tracking-[-0.04em] text-ink sm:text-[56px]">
        Agents, with receipts.
      </h1>
      <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
        Your agents can spend money and hire people. Plex makes sure every dollar they move comes with a receipt:
        who it went to, why, which rule allowed it, and the proof the work was done.
      </p>
      <div className="mt-8 flex gap-2">
        <Link href="/home" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Continue as guest <ArrowRight />
        </Link>
      </div>
    </main>
  );
}

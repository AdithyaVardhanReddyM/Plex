import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { ParticleField } from "./particle-field";

/**
 * Clerk's SignIn / SignUp mapped onto the Plex tokens and flattened into the
 * auth card. Clerk takes literal colours, not CSS variables, so these mirror
 * globals.css: ink for the main action, the canvas and line greys, Geist.
 */
export const clerkAppearance = {
  options: { logoPlacement: "none" as const },
  variables: {
    colorPrimary: "#0c1512", // --color-ink
    colorText: "#0c1512", // --color-ink
    colorTextSecondary: "#5f6b67", // --color-muted
    colorBackground: "#ffffff", // --color-surface
    colorInputBackground: "#ffffff",
    colorNeutral: "#0c1512",
    colorDanger: "#c2412d", // --color-disputed
    colorSuccess: "#0d8086", // --color-green-700
    fontFamily: "var(--font-geist-sans)",
    borderRadius: "8px", // --radius-sm
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "none", border: "none", borderRadius: 0 },
    card: { boxShadow: "none", border: "none", background: "transparent" },
    footer: { background: "transparent" },
  },
};

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-canvas p-4 sm:p-6 lg:p-8">
      <div className="grid w-full max-w-[1040px] overflow-hidden rounded-lg border border-line bg-surface shadow-raised lg:min-h-[640px] lg:grid-cols-2">
        <section className="relative hidden border-r border-line lg:block">
          <ParticleField className="absolute inset-0" />
          <Link href="/" className="absolute top-7 left-7">
            <Wordmark size={18} />
          </Link>
          <p className="absolute bottom-7 left-7 text-[13px] text-muted">
            Agents, with receipts.
          </p>
        </section>

        <section className="flex flex-col items-center justify-center px-2 py-8 sm:px-8">
          <Link href="/" className="lg:hidden">
            <Wordmark size={18} />
          </Link>
          <div className="w-full max-w-[400px]">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

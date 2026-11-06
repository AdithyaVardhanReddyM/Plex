import { Suspense } from "react";
import { ClientOnly } from "@/components/client-only";

// Other companies' sites in the demo world (a studio, a city, a carrier, a cloud): each keeps its
// session in the browser, like a real site, so they render client-only.
export const instant = false;

export default function SitesLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ClientOnly>{children}</ClientOnly>
    </Suspense>
  );
}

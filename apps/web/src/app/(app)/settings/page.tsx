import type { Metadata } from "next";
import { SettingsView } from "./settings-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsView />;
}

import type { Metadata } from "next";
import { InsightsView } from "@/components/insights/insights-view";

export const metadata: Metadata = { title: "Insights" };
export const instant = false;

/** The newest page, followed live: when Plex builds a new one, this shows it. */
export default function InsightsPage() {
  return <InsightsView />;
}

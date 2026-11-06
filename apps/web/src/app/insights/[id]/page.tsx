import { Suspense } from "react";
import type { Metadata } from "next";
import { InsightsView } from "@/components/insights/insights-view";

export const metadata: Metadata = { title: "Insights" };
export const instant = false;

export default function InsightsByIdPage({ params }: PageProps<"/insights/[id]">) {
  return <Suspense>{params.then(({ id }) => <InsightsView id={id} />)}</Suspense>;
}

import type { Metadata } from "next";
import { HomeView } from "./home-view";

// Live Convex data rendered in the browser; see (app)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Home" };

export default function Page() {
  return <HomeView />;
}

"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Brightline } from "./brightline";
import { ClayCommons } from "./clay-commons";
import { Cloudnest } from "./cloudnest";
import { LakeportParking } from "./lakeport-parking";

/** The demo world's merchant sites, by slug (also the `<slug>.localhost` host in src/proxy.ts). */
const TITLES: Record<string, string> = {
  claycommons: "Clay Commons · Book a class",
  lakeport: "City of Lakeport · Parking citations",
  brightline: "Brightline Mobile · My account",
  cloudnest: "Cloudnest · Your plan",
};

export function SiteView({ site }: { site: string }) {
  const view = useSearchParams().get("view") ?? undefined;
  useEffect(() => {
    document.title = TITLES[site] ?? "Not found";
  }, [site]);
  switch (site) {
    case "claycommons":
      return <ClayCommons />;
    case "lakeport":
      return <LakeportParking view={view} />;
    case "brightline":
      return <Brightline />;
    case "cloudnest":
      return <Cloudnest />;
    default:
      return <div className="p-10 text-[14px]">No such site.</div>;
  }
}

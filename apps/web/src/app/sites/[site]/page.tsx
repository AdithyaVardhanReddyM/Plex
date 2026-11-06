import { Suspense } from "react";
import { SiteView } from "@/components/sites/site-view";

export const instant = false;

export default function SitePage({ params }: PageProps<"/sites/[site]">) {
  return <Suspense>{params.then(({ site }) => <SiteView site={site} />)}</Suspense>;
}

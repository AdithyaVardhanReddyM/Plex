import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Clerk runs only when its keys are configured. Then every app route needs a
 * signed-in user: signed-out visitors are sent to /sign-in and come back to
 * the page they asked for. Public: the landing page, the auth pages, and the
 * demo merchant sites (fictional storefronts with no user data).
 *
 * The demo world's merchant sites answer on their own hosts, so the browser shows a site's
 * address rather than Plex's: claycommons.localhost:3000 is /sites/claycommons.
 */
const clerkEnabled = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const isPublic = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/sites(.*)"]);
const SITE_HOSTS = new Set(["claycommons", "lakeport", "brightline", "cloudnest"]);

function siteRewrite(req: NextRequest) {
  const sub = (req.headers.get("host") ?? "").split(":")[0]!.match(/^([a-z0-9-]+)\.localhost$/)?.[1];
  if (!sub || !SITE_HOSTS.has(sub)) return null;
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/sites/") || pathname.startsWith("/_next")) return null;
  const url = req.nextUrl.clone();
  url.pathname = `/sites/${sub}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export default clerkEnabled
  ? clerkMiddleware(
      async (auth, req) => {
        const site = siteRewrite(req);
        if (site) return site;
        if (!isPublic(req)) {
          const { userId, redirectToSignIn } = await auth();
          if (!userId) return redirectToSignIn({ returnBackUrl: req.url });
        }
        return NextResponse.next();
      },
      { signInUrl: "/sign-in", signUpUrl: "/sign-up" },
    )
  : (req: NextRequest) => siteRewrite(req) ?? NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

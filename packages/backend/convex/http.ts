import { httpRouter } from "convex/server";
import { handle as agentApi } from "./agentApi";
import { callback as githubCallback } from "./githubOAuth";
import { callback as googleCallback } from "./everyday";
import { paypalWebhook } from "./webhooks";

/**
 * HTTP routes, served on the deployment's site URL
 * (`https://<deployment>.convex.site`, or `http://127.0.0.1:<site-port>` locally).
 * Add routes for other surfaces here.
 */
const http = httpRouter();

http.route({ path: "/paypal/webhook", method: "POST", handler: paypalWebhook });

// The agent API (apps/mcp and any HTTP client). See agentApi.ts.
http.route({ pathPrefix: "/api/v1/", method: "GET", handler: agentApi });
http.route({ pathPrefix: "/api/v1/", method: "POST", handler: agentApi });

// "Connect GitHub" on a task's Connections card. See githubOAuth.ts.
http.route({ path: "/oauth/github/callback", method: "GET", handler: githubCallback });

// "Connect Google" on Everyday (Gmail bills, Calendar). See everyday.ts.
http.route({ path: "/oauth/google/callback", method: "GET", handler: googleCallback });

export default http;

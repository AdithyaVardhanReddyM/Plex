import { httpRouter } from "convex/server";
import { handle as agentApi } from "./agentApi";
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

export default http;

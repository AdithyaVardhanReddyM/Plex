import { httpRouter } from "convex/server";
import { paypalWebhook } from "./webhooks";

/**
 * HTTP routes, served on the deployment's site URL
 * (`https://<deployment>.convex.site`, or `http://127.0.0.1:<site-port>` locally).
 * Add routes for other surfaces here.
 */
const http = httpRouter();

http.route({ path: "/paypal/webhook", method: "POST", handler: paypalWebhook });

export default http;

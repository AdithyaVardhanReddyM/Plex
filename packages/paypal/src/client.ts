/**
 * The one place Plex talks to PayPal.
 *
 * Plain `fetch`, no Node-only APIs, so it runs in Convex's default runtime,
 * Next.js route handlers and edge functions alike. Sandbox by default.
 */

export type PayPalEnvironment = "sandbox" | "live";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  environment?: PayPalEnvironment;
}

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly name_: string | undefined,
    readonly debugId: string | undefined,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

const BASE_URL: Record<PayPalEnvironment, string> = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
};

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

function base64(input: string): string {
  if (typeof btoa === "function") return btoa(input);
  return Buffer.from(input).toString("base64");
}

export class PayPalClient {
  readonly baseUrl: string;
  readonly environment: PayPalEnvironment;

  constructor(private readonly config: PayPalConfig) {
    this.environment = config.environment ?? "sandbox";
    this.baseUrl = BASE_URL[this.environment];
  }

  /** Reads PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_ENVIRONMENT. */
  static fromEnv(env: Record<string, string | undefined> = process.env): PayPalClient {
    const clientId = env.PAYPAL_CLIENT_ID;
    const clientSecret = env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        "PayPal is not configured: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox app credentials).",
      );
    }
    const environment = env.PAYPAL_ENVIRONMENT?.toLowerCase() === "live" ? "live" : "sandbox";
    return new PayPalClient({ clientId, clientSecret, environment });
  }

  static isConfigured(env: Record<string, string | undefined> = process.env): boolean {
    return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
  }

  async accessToken(): Promise<string> {
    const key = `${this.environment}:${this.config.clientId}`;
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${base64(`${this.config.clientId}:${this.config.clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !body.access_token) {
      throw new PayPalError(
        `PayPal auth failed: ${body.error ?? res.status} ${body.error_description ?? ""}`.trim(),
        res.status,
        body.error,
        undefined,
        body,
      );
    }
    tokenCache.set(key, {
      token: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    });
    return body.access_token;
  }

  /**
   * Authenticated JSON request. Pass `idempotencyKey` for anything that moves
   * money so retries never double-charge or double-pay.
   */
  async request<T>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    options: { body?: unknown; idempotencyKey?: string; query?: Record<string, string | number | boolean | undefined> } = {},
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(options.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.accessToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    };
    if (options.idempotencyKey) headers["PayPal-Request-Id"] = options.idempotencyKey;

    const res = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const err = (data ?? {}) as { name?: string; message?: string; debug_id?: string; details?: unknown };
      throw new PayPalError(
        `PayPal ${method} ${path} failed (${res.status}): ${err.name ?? ""} ${err.message ?? ""}`.trim(),
        res.status,
        err.name,
        err.debug_id,
        err.details ?? data,
      );
    }
    return data as T;
  }
}

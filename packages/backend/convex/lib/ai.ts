/**
 * Shared Gemini helper for every Plex agent (Task Writer, Match, proof
 * engine, Mediator, cause pages, Ledger...). Runs inside Convex actions.
 *
 * Gemini comes from Google Cloud (Vertex AI) when GOOGLE_VERTEX_PROJECT (or
 * GOOGLE_CLOUD_PROJECT) is set, authenticated with one of:
 *  - your gcloud CLI login: GOOGLE_ADC_JSON, the contents of the file
 *    `gcloud auth application-default login` writes
 *  - a service account (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
 *  - a Vertex express-mode key (GOOGLE_VERTEX_API_KEY)
 * Otherwise it uses an AI Studio key (GOOGLE_GENERATIVE_AI_API_KEY).
 *
 * Every call takes a deterministic `fallback`. When neither is configured, or
 * the model call fails, the fallback runs instead and the
 * result is labeled `model: "heuristic"`, so the demo always works and never
 * pretends a heuristic was AI.
 *
 * Use it for anything the code acts on: the output is validated against the
 * zod schema. The model only ever proposes; code decides whether money moves.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex/edge";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import type { z } from "zod";

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const HEURISTIC = "heuristic";

/** Aborts a model call that runs too long, so an agent never hangs; the fallback runs instead. */
function deadline(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error(`model call took over ${ms / 1000}s`)), ms);
  return controller.signal;
}

// Same names as apps/agent (GOOGLE_CLOUD_*), or the AI SDK's (GOOGLE_VERTEX_*).
const vertexProject = () => process.env.GOOGLE_VERTEX_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
const vertexLocation = () => process.env.GOOGLE_VERTEX_LOCATION ?? process.env.GOOGLE_CLOUD_LOCATION ?? "global";
/** The model agents use unless they ask for a specific one. */
const defaultModel = () => process.env.GEMINI_MODEL_QUALITY ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

function vertexConfigured(): boolean {
  const e = process.env;
  return Boolean(
    vertexProject() && (gcloudLogin() || (e.GOOGLE_CLIENT_EMAIL && e.GOOGLE_PRIVATE_KEY) || e.GOOGLE_VERTEX_API_KEY),
  );
}

// ── gcloud CLI login ───────────────────────────────────────────────────────────────

type GcloudUser = { type: "authorized_user"; client_id: string; client_secret: string; refresh_token: string };

/** `gcloud auth application-default login` credentials, pasted into GOOGLE_ADC_JSON. */
function gcloudLogin(): GcloudUser | null {
  const raw = process.env.GOOGLE_ADC_JSON;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as GcloudUser;
    return j.type === "authorized_user" && j.refresh_token ? j : null;
  } catch {
    return null;
  }
}

let gcloudToken: { value: string; expiresAt: number } | null = null;

/** Trades the gcloud refresh token for a short-lived access token, cached until it nearly expires. */
async function gcloudAccessToken(u: GcloudUser): Promise<string> {
  if (gcloudToken && gcloudToken.expiresAt - 60_000 > Date.now()) return gcloudToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: u.client_id,
      client_secret: u.client_secret,
      refresh_token: u.refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`gcloud login refresh failed (${res.status}); run gcloud auth application-default login again`);
  const d = (await res.json()) as { access_token: string; expires_in: number };
  gcloudToken = { value: d.access_token, expiresAt: Date.now() + d.expires_in * 1000 };
  return d.access_token;
}

function vertexHost(location: string) {
  if (location === "global") return "aiplatform.googleapis.com";
  if (location === "us" || location === "eu") return `aiplatform.${location}.rep.googleapis.com`;
  return `${location}-aiplatform.googleapis.com`;
}

/** Gemini on Vertex with a gcloud user login: the Gemini client, pointed at Vertex with a Bearer token. */
function vertexWithGcloudLogin(u: GcloudUser) {
  const project = vertexProject()!;
  const location = vertexLocation();
  return createGoogleGenerativeAI({
    apiKey: "gcloud-login", // replaced by the Bearer token below
    baseURL: `https://${vertexHost(location)}/v1beta1/projects/${project}/locations/${location}/publishers/google`,
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      headers.delete("x-goog-api-key");
      headers.set("authorization", `Bearer ${await gcloudAccessToken(u)}`);
      headers.set("x-goog-user-project", project); // bill and quota the project, not gcloud's own
      return fetch(url, { ...init, headers });
    },
  });
}

export function aiConfigured(): boolean {
  return vertexConfigured() || Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

/** Which Gemini endpoint is in use, for logs and labels. */
export function aiProvider(): "vertex" | "ai-studio" | null {
  return vertexConfigured() ? "vertex" : process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "ai-studio" : null;
}

/** A Gemini model on Vertex AI (GCP) or AI Studio, or null when neither is set up. */
export function geminiModel(modelId: string = defaultModel()): LanguageModel | null {
  return geminiProvider()?.(modelId) ?? null;
}

type GeminiProvider = ((modelId: string) => LanguageModel) & {
  tools: { googleSearch: (args: Record<string, never>) => unknown };
};

/** The configured provider, so callers can also use Gemini's tools (Google Search). */
function geminiProvider(): GeminiProvider | null {
  const e = process.env;
  if (vertexConfigured()) {
    const login = gcloudLogin();
    if (login) return vertexWithGcloudLogin(login) as unknown as GeminiProvider;
    const vertex = createVertex({
      project: vertexProject(),
      location: vertexLocation(),
      ...(e.GOOGLE_CLIENT_EMAIL && e.GOOGLE_PRIVATE_KEY
        ? {
            googleCredentials: {
              clientEmail: e.GOOGLE_CLIENT_EMAIL,
              // Keys pasted into env vars often carry literal "\n".
              privateKey: e.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
              privateKeyId: e.GOOGLE_PRIVATE_KEY_ID,
            },
          }
        : { apiKey: e.GOOGLE_VERTEX_API_KEY }),
    });
    return vertex as unknown as GeminiProvider;
  }
  if (e.GOOGLE_GENERATIVE_AI_API_KEY)
    return createGoogleGenerativeAI({ apiKey: e.GOOGLE_GENERATIVE_AI_API_KEY }) as unknown as GeminiProvider;
  return null;
}

export interface AiImage {
  /** Raw bytes, e.g. from `ctx.storage.get(id)` → `arrayBuffer()`. */
  data: Uint8Array | ArrayBuffer;
  mediaType: string;
  /** A short caption placed before the image, e.g. "Photo 2 · Menu". */
  label?: string;
}

export interface StructuredInput<T> {
  schema: z.ZodType<T>;
  /** Role and rules for the model. */
  system: string;
  /** The task, with all the facts the model needs. */
  prompt: string;
  /** Optional images (proof photos, receipts...). */
  images?: AiImage[];
  /** Deterministic answer used when there is no key or the call fails. */
  fallback: () => T | Promise<T>;
  model?: string;
  /** Label for logs, e.g. "task-writer". */
  name?: string;
}

export interface StructuredResult<T> {
  object: T;
  /** The model id, or "heuristic" when the fallback produced the answer. */
  model: string;
  /** Why the fallback ran, when it did. */
  fallbackReason?: "no_key" | "error";
}

/** Structured output from Gemini, with a labeled heuristic fallback. */
export async function generateStructured<T>(input: StructuredInput<T>): Promise<StructuredResult<T>> {
  const modelId = input.model ?? defaultModel();
  const model = geminiModel(modelId);
  if (!model) {
    return { object: await input.fallback(), model: HEURISTIC, fallbackReason: "no_key" };
  }
  try {
    const content: Exclude<ModelMessage["content"], string> = [{ type: "text", text: input.prompt }];
    for (const img of input.images ?? []) {
      if (img.label) content.push({ type: "text", text: img.label });
      content.push({
        type: "file",
        data: img.data instanceof Uint8Array ? img.data : new Uint8Array(img.data),
        mediaType: img.mediaType,
      });
    }
    const result = await generateText({
      model,
      system: input.system,
      messages: [{ role: "user", content } as ModelMessage],
      output: Output.object({ schema: input.schema }),
      maxRetries: 1,
      abortSignal: deadline(90_000),
    });
    return { object: result.output as T, model: modelId };
  } catch (err) {
    console.warn(`[ai] ${input.name ?? "generateStructured"} fell back to heuristic:`, err);
    return { object: await input.fallback(), model: HEURISTIC, fallbackReason: "error" };
  }
}

export interface MarkdownInput {
  system: string;
  prompt: string;
  /** Ground the answer in Google Search results; their links come back as `sources`. */
  search?: boolean;
  fallback: () => string | Promise<string>;
  model?: string;
  name?: string;
}

/**
 * Long-form Markdown (an agent's deliverable). Plain text, not JSON, so long
 * answers aren't cut off inside a structured field. With `search`, Gemini's
 * Google Search grounding supplies real sources.
 */
export async function generateMarkdown(
  input: MarkdownInput,
): Promise<{ text: string; model: string; sources: { title?: string; url: string }[] }> {
  const modelId = input.model ?? defaultModel();
  const provider = geminiProvider();
  if (!provider) return { text: await input.fallback(), model: HEURISTIC, sources: [] };
  try {
    const result = await generateText({
      model: provider(modelId),
      system: input.system,
      prompt: input.prompt,
      maxOutputTokens: 8192,
      maxRetries: 1,
      abortSignal: deadline(120_000),
      ...(input.search ? { tools: { google_search: provider.tools.googleSearch({}) } as never } : {}),
    });
    if (!result.text.trim()) throw new Error("empty answer");
    const sources = (result.sources ?? [])
      .flatMap((s) => (s.sourceType === "url" ? [{ title: s.title, url: s.url }] : []))
      .filter((s, i, all) => all.findIndex((x) => x.url === s.url) === i);
    return { text: result.text.trim(), model: modelId, sources };
  } catch (err) {
    console.warn(`[ai] ${input.name ?? "generateMarkdown"} fell back to heuristic:`, err);
    return { text: await input.fallback(), model: HEURISTIC, sources: [] };
  }
}

export interface ImageInput {
  prompt: string;
  /** Deterministic image when no model is configured or the call fails (e.g. an SVG). */
  fallback: () => { data: Uint8Array; mediaType: string };
  name?: string;
}

/** An image from Gemini's image model (Vertex AI or AI Studio), with a labeled fallback. */
export async function generateImage(input: ImageInput): Promise<{ data: Uint8Array; mediaType: string; model: string }> {
  const provider = geminiProvider();
  const modelId = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
  if (!provider) return { ...input.fallback(), model: HEURISTIC };
  try {
    const result = await generateText({
      model: provider(modelId),
      prompt: input.prompt,
      maxRetries: 1,
      abortSignal: deadline(120_000),
      providerOptions: { google: { responseModalities: ["TEXT", "IMAGE"] }, vertex: { responseModalities: ["TEXT", "IMAGE"] } },
    });
    const file = result.files.find((f) => f.mediaType.startsWith("image/"));
    if (!file) throw new Error("no image in the answer");
    return { data: file.uint8Array, mediaType: file.mediaType, model: modelId };
  } catch (err) {
    console.warn(`[ai] ${input.name ?? "generateImage"} fell back to heuristic:`, err);
    return { ...input.fallback(), model: HEURISTIC };
  }
}

/** "gemini-2.5-flash" → "Gemini 2.5 Flash"; "heuristic" → "Heuristic". */
export function modelLabel(model: string): string {
  if (model === HEURISTIC) return "Heuristic";
  return model
    .split("-")
    .map((p) => (/^\d/.test(p) ? p : p[0]!.toUpperCase() + p.slice(1)))
    .join(" ");
}

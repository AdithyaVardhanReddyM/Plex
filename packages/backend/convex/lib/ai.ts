/**
 * Shared Gemini helper for every Plex agent (Task Writer, Match, proof
 * engine, Mediator, cause pages, Ledger...). Runs inside Convex actions.
 *
 * Every call takes a deterministic `fallback`. When GOOGLE_GENERATIVE_AI_API_KEY
 * is missing, or the model call fails, the fallback runs instead and the
 * result is labeled `model: "heuristic"`, so the demo always works and never
 * pretends a heuristic was AI.
 *
 * Use it for anything the code acts on: the output is validated against the
 * zod schema. The model only ever proposes; code decides whether money moves.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output, type ModelMessage } from "ai";
import type { z } from "zod";

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const HEURISTIC = "heuristic";

export function aiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
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
  if (!aiConfigured()) {
    return { object: await input.fallback(), model: HEURISTIC, fallbackReason: "no_key" };
  }
  const modelId = input.model ?? DEFAULT_MODEL;
  try {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
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
      model: google(modelId),
      system: input.system,
      messages: [{ role: "user", content } as ModelMessage],
      output: Output.object({ schema: input.schema }),
      maxRetries: 1,
    });
    return { object: result.output as T, model: modelId };
  } catch (err) {
    console.warn(`[ai] ${input.name ?? "generateStructured"} fell back to heuristic:`, err);
    return { object: await input.fallback(), model: HEURISTIC, fallbackReason: "error" };
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

/**
 * Pure helpers for Plex Tasks, shared by Convex functions and the web app
 * (`import … from "@plex/backend/lib/taskRules"`). No Convex server imports.
 */
import type { Infer } from "convex/values";
import type { payoutRule } from "../schema";
import { formatCents } from "./money";

export type PayoutRule = Infer<typeof payoutRule>;

/** What the poster puts on hold: the most the task can pay. */
export function fundingCents(p: PayoutRule): number {
  switch (p.kind) {
    case "fixed":
      return p.amountCents;
    case "per_unit":
      return p.amountCents * p.maxUnits;
    case "per_result":
      return p.capCents;
  }
}

/** "$18", "$4 per menu, up to 3", "$4 per 1k views, capped at $300". */
export function payoutSummary(p: PayoutRule): string {
  switch (p.kind) {
    case "fixed":
      return formatCents(p.amountCents);
    case "per_unit":
      return `${formatCents(p.amountCents)} per ${p.unitLabel}, up to ${p.maxUnits}`;
    case "per_result":
      return `${formatCents(p.perThousandViewsCents)} per 1k views, capped at ${formatCents(p.capCents)}`;
  }
}

export const CATEGORY_LABEL = {
  local: "Local",
  remote: "Remote",
  data: "Data",
  creator: "Creator",
  agent: "Agent work",
  impact: "Impact",
} as const;

export type TaskCategory = keyof typeof CATEGORY_LABEL;

/** Great-circle distance in meters. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/**
 * A tiny gazetteer for the demo world, used by the heuristic Task Writer and
 * Match when there is no model to geocode. Matching is by substring.
 */
const PLACES: Array<{ match: RegExp; label: string; lat: number; lng: number; radiusM: number }> = [
  { match: /kettle corner|caf[eé] on 5th|5th st/i, label: "Kettle Corner, 5th St & Mission, SF", lat: 37.7825, lng: -122.4058, radiusM: 150 },
  { match: /24th/i, label: "24th St, Mission, SF", lat: 37.7524, lng: -122.4147, radiusM: 400 },
  { match: /valencia/i, label: "Valencia St, Mission, SF", lat: 37.7556, lng: -122.4211, radiusM: 500 },
  { match: /lake merritt|pergola/i, label: "Lake Merritt, Oakland", lat: 37.8024, lng: -122.2589, radiusM: 400 },
  { match: /bernal/i, label: "Bernal Heights, SF", lat: 37.7412, lng: -122.4156, radiusM: 800 },
  { match: /dolores/i, label: "Dolores Park, SF", lat: 37.7596, lng: -122.4269, radiusM: 300 },
  { match: /ferry building/i, label: "Ferry Building, SF", lat: 37.7955, lng: -122.3937, radiusM: 200 },
  { match: /mission/i, label: "Mission, San Francisco", lat: 37.7599, lng: -122.4148, radiusM: 1500 },
  { match: /oakland/i, label: "Oakland, CA", lat: 37.8044, lng: -122.2712, radiusM: 3000 },
  { match: /lagos/i, label: "Lagos", lat: 6.5244, lng: 3.3792, radiusM: 20_000 },
  { match: /san francisco|\bsf\b/i, label: "San Francisco", lat: 37.7749, lng: -122.4194, radiusM: 5000 },
];

export function lookupPlace(text: string) {
  return PLACES.find((p) => p.match.test(text));
}

/**
 * The demo world lives in the Bay Area, so task windows are shown in the
 * place's own time zone (as Causes does), wherever the viewer is.
 */
export const PLACE_TZ = "America/Los_Angeles";

/** Window helper: "Today, 2–6pm" style label from two timestamps, in PLACE_TZ. */
export function windowLabel(start: number, end: number, now = Date.now()): string {
  const dayKey = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: PLACE_TZ });
  const day = (ms: number) => {
    if (dayKey(ms) === dayKey(now)) return "Today";
    if (dayKey(ms) === dayKey(now + 86_400_000)) return "Tomorrow";
    return new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: PLACE_TZ });
  };
  const time = (ms: number) =>
    new Date(ms)
      .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: PLACE_TZ })
      .replace(":00", "")
      .replace(" ", "")
      .toLowerCase();
  return dayKey(start) === dayKey(end)
    ? `${day(start)}, ${time(start)}–${time(end)}`
    : `${day(start)} ${time(start)} – ${day(end)} ${time(end)}`;
}

/** Seeded demo rows carry placeholder PayPal ids that must never hit the API. */
export const isSeedId = (id?: string) => !id || id.startsWith("SEED-");

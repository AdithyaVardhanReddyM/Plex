import type { Infer } from "convex/values";
import type { routineTrigger } from "../schema";

/**
 * When a routine runs next. Schedule triggers only: email, PayPal, folder and
 * manual triggers have no clock time, so they return undefined.
 *
 * Times are wall-clock in the routine's IANA timezone ("09:00" in
 * America/Los_Angeles stays 9 am across daylight time), converted with
 * `Intl.DateTimeFormat`, which the Convex runtime supports.
 */

export type RoutineTrigger = Infer<typeof routineTrigger>;

/** Adi lives in San Francisco; used when nothing better is known. */
export const DEFAULT_TIMEZONE = "America/Los_Angeles";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function safeTimezone(tz: string | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    formatter(tz);
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of `ms` in `timeZone`. */
export function zonedParts(ms: number, timeZone: string): Parts {
  const out: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    weekday: WEEKDAYS[out.weekday] ?? 0,
  };
}

/** The local hour 0-23, for the policy engine's quiet hours. */
export function localHour(ms: number, timeZone = DEFAULT_TIMEZONE): number {
  return zonedParts(ms, safeTimezone(timeZone)).hour;
}

/** Milliseconds `timeZone` is ahead of UTC at instant `ms`. */
function offsetAt(ms: number, timeZone: string) {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(ms / 60_000) * 60_000;
}

/** The instant a wall-clock time happens in `timeZone` (month is 1-12; day may overflow). */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let utc = guess - offsetAt(guess, timeZone);
  // Once more, in case the guess and the answer straddle a daylight-time change.
  const second = guess - offsetAt(utc, timeZone);
  if (second !== utc) utc = second;
  return utc;
}

function parseTime(time: string | undefined): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  if (!m) return { hour: 9, minute: 0 };
  return { hour: Math.min(23, Number(m[1])), minute: Math.min(59, Number(m[2])) };
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * The first run strictly after `after` (ms), or undefined when the trigger
 * has no clock time or a one-off time has passed.
 */
export function nextRunAt(trigger: RoutineTrigger, timezone: string, after: number): number | undefined {
  if (trigger.kind !== "schedule") return undefined;
  const tz = safeTimezone(timezone);
  const { hour, minute } = parseTime(trigger.time);
  const start = zonedParts(after, tz);

  switch (trigger.cadence) {
    case "once":
      return trigger.at !== undefined && trigger.at > after ? trigger.at : undefined;

    case "hourly": {
      const every = Math.max(1, Math.floor(trigger.everyHours ?? 1));
      const base = trigger.time ? hour % every : 0;
      for (let d = 0; d < 3; d++)
        for (let h = 0; h < 24; h++) {
          if (h % every !== base) continue;
          const at = zonedToUtc(start.year, start.month, start.day + d, h, minute, tz);
          if (at > after) return at;
        }
      return after + every * HOUR;
    }

    case "daily":
    case "weekly": {
      const days =
        trigger.days && trigger.days.length > 0
          ? trigger.days
          : trigger.cadence === "weekly"
            ? [1] // Mondays, when the compiler didn't say
            : [0, 1, 2, 3, 4, 5, 6];
      for (let d = 0; d < 15; d++) {
        const weekday = new Date(Date.UTC(start.year, start.month - 1, start.day + d)).getUTCDay();
        if (!days.includes(weekday)) continue;
        const at = zonedToUtc(start.year, start.month, start.day + d, hour, minute, tz);
        if (at > after) return at;
      }
      return after + DAY;
    }

    case "monthly": {
      const want = Math.min(31, Math.max(1, Math.floor(trigger.dayOfMonth ?? 1)));
      for (let m = 0; m < 14; m++) {
        const first = new Date(Date.UTC(start.year, start.month - 1 + m, 1));
        const y = first.getUTCFullYear();
        const mo = first.getUTCMonth() + 1;
        const at = zonedToUtc(y, mo, Math.min(want, daysInMonth(y, mo)), hour, minute, tz);
        if (at > after) return at;
      }
      return after + 30 * DAY;
    }
  }
}

/** "9:00" or "6:30 pm" style label of a time in the routine's zone, for run reasons. */
export function clockLabel(ms: number, timezone: string): string {
  const p = zonedParts(ms, safeTimezone(timezone));
  const suffix = p.hour >= 12 ? "pm" : "am";
  const h = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return p.minute === 0 ? `${h} ${suffix}` : `${h}:${String(p.minute).padStart(2, "0")} ${suffix}`;
}

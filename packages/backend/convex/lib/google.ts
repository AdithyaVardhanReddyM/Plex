/**
 * Google APIs for Everyday (OAuth, Gmail, Calendar), over plain fetch so they
 * run in Convex's default runtime. Needs GOOGLE_OAUTH_CLIENT_ID and
 * GOOGLE_OAUTH_CLIENT_SECRET (a "Web application" OAuth client whose redirect
 * URI is `${CONVEX_SITE_URL}/oauth/google/callback`).
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export const googleOAuthReady = () => Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
export const googleCallbackUrl = () => `${process.env.CONVEX_SITE_URL ?? "http://127.0.0.1:3211"}/oauth/google/callback`;

export class GoogleAuthError extends Error {}

/** A short-lived access token from the sealed refresh token. */
export async function googleAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    }),
  });
  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!body.access_token) throw new GoogleAuthError(body.error === "invalid_grant" ? "Google access was removed. Connect Google again." : `Google sign-in failed (${body.error ?? res.status})`);
  return body.access_token;
}

async function g<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" } });
  if (res.status === 401) throw new GoogleAuthError("Google access expired. Connect Google again.");
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

// ── Gmail ────────────────────────────────────────────────────────────────────

type Part = { mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string; size?: number }; parts?: Part[]; headers?: { name: string; value: string }[] };
type Message = { id: string; internalDate?: string; snippet?: string; payload?: Part };

const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const htmlToText = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

export async function listBillMessages(token: string, query: string): Promise<string[]> {
  const r = await g<{ messages?: { id: string }[] }>(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${encodeURIComponent(query)}`);
  return (r.messages ?? []).map((m) => m.id);
}

export type MailMessage = { id: string; from: string; subject: string; receivedAt: number; text: string; pdf?: Uint8Array };

/** One message: headers, readable text, and its first small PDF attachment (an invoice, often). */
export async function readMessage(token: string, id: string): Promise<MailMessage> {
  const m = await g<Message>(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
  const headers = m.payload?.headers ?? [];
  const header = (n: string) => headers.find((h) => h.name.toLowerCase() === n)?.value ?? "";
  let plain = "";
  let html = "";
  let pdf: { attachmentId: string } | undefined;
  const walk = (p?: Part) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && !p.filename) plain += new TextDecoder().decode(fromB64Url(p.body.data));
    else if (p.mimeType === "text/html" && p.body?.data && !p.filename) html += new TextDecoder().decode(fromB64Url(p.body.data));
    else if (!pdf && p.body?.attachmentId && (p.mimeType === "application/pdf" || /\.pdf$/i.test(p.filename ?? "")) && (p.body.size ?? 0) < 4_000_000)
      pdf = { attachmentId: p.body.attachmentId };
    p.parts?.forEach(walk);
  };
  walk(m.payload);
  const text = (plain.trim() || htmlToText(html) || m.snippet || "").slice(0, 8000);
  let bytes: Uint8Array | undefined;
  if (pdf) {
    const a = await g<{ data?: string }>(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/attachments/${pdf.attachmentId}`);
    if (a.data) bytes = fromB64Url(a.data);
  }
  return { id, from: header("from"), subject: header("subject") || "(no subject)", receivedAt: Number(m.internalDate ?? Date.now()), text, pdf: bytes };
}

// ── Calendar ─────────────────────────────────────────────────────────────────

const CAL = "https://www.googleapis.com/calendar/v3";

export async function calendarZone(token: string): Promise<string> {
  const c = await g<{ timeZone?: string }>(token, `${CAL}/calendars/primary`);
  return c.timeZone ?? "UTC";
}

export type CalEvent = { id: string; title: string; start: string; end: string; allDay: boolean; link?: string };

export async function upcomingEvents(token: string, days = 7): Promise<CalEvent[]> {
  const now = new Date();
  const q = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + days * 86_400_000).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "12",
  });
  const r = await g<{ items?: { id: string; summary?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[] }>(
    token,
    `${CAL}/calendars/primary/events?${q}`,
  );
  return (r.items ?? []).map((e) => ({
    id: e.id,
    title: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    allDay: !e.start?.dateTime,
    link: e.htmlLink,
  }));
}

export async function busyTimes(token: string, fromIso: string, toIso: string): Promise<{ start: number; end: number }[]> {
  const r = await g<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>(token, `${CAL}/freeBusy`, {
    method: "POST",
    body: JSON.stringify({ timeMin: fromIso, timeMax: toIso, items: [{ id: "primary" }] }),
  });
  return (r.calendars?.primary?.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
}

export async function insertEvent(
  token: string,
  e: { title: string; description?: string; start: string; end: string; timeZone: string; attendees?: string[]; allDayDate?: string },
): Promise<{ id: string; link?: string }> {
  const body = e.allDayDate
    ? { summary: e.title, description: e.description, start: { date: e.allDayDate }, end: { date: new Date(Date.parse(`${e.allDayDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) } }
    : {
        summary: e.title,
        description: e.description,
        start: { dateTime: e.start, timeZone: e.timeZone },
        end: { dateTime: e.end, timeZone: e.timeZone },
        attendees: e.attendees?.map((email) => ({ email })),
      };
  const r = await g<{ id: string; htmlLink?: string }>(token, `${CAL}/calendars/primary/events?sendUpdates=${e.attendees?.length ? "all" : "none"}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { id: r.id, link: r.htmlLink };
}

/** The local hour (0-23) of a moment in a time zone, or null if the runtime can't tell. */
export function localHour(ms: number, timeZone: string): number | null {
  try {
    const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(ms)).find((p) => p.type === "hour");
    return h ? Number(h.value) % 24 : null;
  } catch {
    return null;
  }
}

/**
 * The first free slot in a window: on a 15-minute grid, not in the past, inside
 * 8am-8pm local time, overlapping nothing busy. Code picks the time, not the model.
 */
export function findSlot(
  window: { start: number; end: number },
  durationMs: number,
  busy: { start: number; end: number }[],
  timeZone: string,
  now = Date.now(),
): { start: number; end: number } | null {
  const step = 15 * 60_000;
  let s = Math.ceil(Math.max(window.start, now + step) / step) * step;
  for (; s + durationMs <= window.end; s += step) {
    const e = s + durationMs;
    const h0 = localHour(s, timeZone);
    const h1 = localHour(e - 1, timeZone);
    if (h0 !== null && h1 !== null && (h0 < 8 || h1 >= 20 || h1 < h0)) continue;
    if (busy.some((b) => s < b.end && e > b.start)) continue;
    return { start: s, end: e };
  }
  return null;
}

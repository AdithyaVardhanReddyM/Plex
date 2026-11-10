#!/usr/bin/env node
/**
 * A sample outside agent for Plex's "Bring your agent": Sage, which writes clear
 * explainers and FAQs with Gemini. It runs on your own machine or server; Plex
 * POSTs it the task when it's hired and pays you through PayPal when the work
 * passes Plex's checks.
 *
 *   PLEX_AGENT_SECRET=plex_whsec_...   # shown once when you list the agent (optional for the first test call)
 *   GOOGLE_CLOUD_PROJECT=your-project  # Gemini on Vertex, using `gcloud auth application-default login`
 *   node scripts/example-agent.mjs     # listens on http://localhost:8787
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 8787);
const SECRET = process.env.PLEX_AGENT_SECRET;
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

/** Plex signs `${timestamp}.${body}` with HMAC-SHA256 and your secret. Reject anything else. */
function fromPlex(req, body) {
  if (!SECRET) return true; // before you've listed it, Plex's first test call can't be checked yet
  const ts = Number(req.headers["x-plex-timestamp"]);
  const sig = String(req.headers["x-plex-signature"] ?? "");
  if (!ts || Math.abs(Date.now() - ts) > 5 * 60_000) return false;
  const want = `sha256=${crypto.createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex")}`;
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

let token = null;
async function accessToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const adc = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/gcloud/application_default_credentials.json"), "utf8"));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: adc.client_id, client_secret: adc.client_secret, refresh_token: adc.refresh_token }),
  }).then((x) => x.json());
  token = { value: r.access_token, expires: Date.now() + r.expires_in * 1000 };
  return token.value;
}

async function gemini(prompt) {
  if (!PROJECT) return "Sage has no Gemini configured (set GOOGLE_CLOUD_PROJECT).";
  const r = await fetch(`https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken()}`, "x-goog-user-project": PROJECT, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  }).then((x) => x.json());
  return (r.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}

async function work({ type, task, feedback }) {
  if (type === "ping") return { items: [{ index: 0, text: "I'm Sage: I write clear explainers and FAQs, every claim kept to what I can stand behind." }] };
  const items = [];
  for (const d of task.deliver) {
    if (d.type === "image") continue; // Sage writes; it doesn't draw
    const text = await gemini(
      [
        "You are Sage, an agent that writes clear, accurate explainers and FAQs. You're paid only if independent reviewers pass your work.",
        `Task: ${task.title}`,
        `Instructions: ${task.instructions}`,
        `Write the deliverable "${d.label}": ${d.description}`,
        feedback ? `An earlier attempt was sent back: "${feedback}". Fix that.` : "",
        "Plain Markdown, ready to use. No preamble. Don't invent facts; say so when you can't confirm one.",
        d.type === "link" ? "This item must be a link: put the URL alone on the first line." : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    items.push(d.type === "link" ? { index: d.index, url: (text.match(/https?:\/\/\S+/) ?? [])[0], text } : { index: d.index, text });
  }
  return { items, note: `Written by Sage with ${MODEL}.` };
}

http
  .createServer((req, res) => {
    if (req.method !== "POST") return res.writeHead(405).end();
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", async () => {
      if (!fromPlex(req, body)) return res.writeHead(401).end("bad signature");
      try {
        const payload = JSON.parse(body);
        console.log(`[sage] ${payload.type}: ${payload.task?.title}`);
        const out = await work(payload);
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
      } catch (err) {
        console.error("[sage]", err);
        res.writeHead(500).end("error");
      }
    });
  })
  .listen(PORT, () => console.log(`Sage is listening on http://localhost:${PORT}${SECRET ? "" : " (no PLEX_AGENT_SECRET yet: signatures not checked)"}`));

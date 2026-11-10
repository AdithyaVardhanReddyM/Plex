/**
 * Pure rules for connected accounts (GitHub, MCP servers): which endpoints a
 * poster may connect, and which tools a hired agent may call through them.
 * The model chooses tool calls; these decide which ones exist at all.
 */

export const GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/";

/** Never offered to an agent, whatever the token allows: destructive or account-level. */
const BLOCKED =
  /delete|remove|destroy|fork|transfer|archive|create_repository|update_repository|secret|variable|run_workflow|rerun|dispatch|cancel|dismiss|collaborator|invite|webhook|deploy_key|ssh|gpg|token|admin|billing|member|team|org(anization)?_|lock|block_user|(^|_)star(_|$)|follow|notification|gist/i;

export function toolAllowed(name: string, allow?: string[]): boolean {
  if (BLOCKED.test(name)) return false;
  return !allow?.length || allow.includes(name);
}

/** An MCP server a poster may connect: https on a public host, no credentials in the URL (no SSRF into Plex's network). */
export function safeMcpUrl(raw: string): { ok: true; url: string; host: string } | { ok: false; reason: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That isn't a URL." };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "The MCP server must use https." };
  if (u.username || u.password) return { ok: false, reason: "Put the token in the token field, not in the URL." };
  const host = u.hostname.toLowerCase();
  const privateHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127|10|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "[::1]" ||
    /^\[?(fc|fd|fe80)/i.test(host) ||
    /^\d+$/.test(host);
  if (privateHost) return { ok: false, reason: "The MCP server must be on the public internet." };
  return { ok: true, url: u.toString(), host };
}

/**
 * An agent's own endpoint: the same public-https rule as MCP servers. Local
 * development may also use http://localhost when PLEX_ALLOW_LOCAL_AGENTS=true.
 */
export function safeAgentUrl(raw: string): { ok: true; url: string; host: string } | { ok: false; reason: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That isn't a URL." };
  }
  const local = /^(localhost|127\.0\.0\.1)$/i.test(u.hostname);
  if (local && process.env.PLEX_ALLOW_LOCAL_AGENTS === "true" && !u.username && !u.password)
    return { ok: true, url: u.toString(), host: `${u.hostname}:${u.port || (u.protocol === "https:" ? 443 : 80)}` };
  return safeMcpUrl(raw);
}

/** owner/repo#number from a GitHub pull request URL. */
export function githubPr(url: string): { owner: string; repo: string; number: number } | null {
  const m = url.match(/^https:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i);
  return m ? { owner: m[1]!, repo: m[2]!, number: Number(m[3]) } : null;
}

/**
 * The repositories a task names ("github.com/acme/site/pull/4", "acme/site"),
 * lowercased "owner/repo". The agent may touch these and nothing else.
 */
export function reposIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?=[/\s#?)"'.,]|$)/gi)) out.add(`${m[1]}/${m[2]}`.toLowerCase());
  // A bare owner/repo, only when the task talks about GitHub at all.
  if (/github|pull request|\bpr\b|\brepo/i.test(text))
    for (const m of text.matchAll(/(?:^|[\s(`'"])([A-Za-z0-9][\w-]{0,38})\/([\w.-]{1,100})(?=[\s)`'".,#]|$)/g))
      if (!/^(and|or|the|a|in|on|to|of|per)$/i.test(m[1]!) && !/^\d+$/.test(m[2]!)) out.add(`${m[1]}/${m[2]}`.toLowerCase());
  return [...out].slice(0, 5);
}

/** Tools that read only the connected account itself, not any repository. */
const ACCOUNT_SELF = new Set(["get_me"]);

/**
 * The repo lock, checked by code on every GitHub tool call: the call must name
 * one of the task's repositories. A token that reaches all of a person's repos
 * still only touches the one the task is about.
 */
export function repoGuard(tool: string, input: unknown, allowed: string[]): { ok: true } | { ok: false; reason: string } {
  if (ACCOUNT_SELF.has(tool)) return { ok: true };
  const args = (input ?? {}) as Record<string, unknown>;
  const owner = typeof args.owner === "string" ? args.owner : undefined;
  const repo = typeof args.repo === "string" ? args.repo : undefined;
  if (!owner || !repo)
    return { ok: false, reason: `Plex only allows GitHub calls on ${allowed.join(", ") || "the task's repository"}; this call names no repository.` };
  if (!allowed.includes(`${owner}/${repo}`.toLowerCase()))
    return { ok: false, reason: `Plex blocked ${tool} on ${owner}/${repo}: this task is only about ${allowed.join(", ")}.` };
  return { ok: true };
}

/** Services a task names, so Plex can suggest the MCP server to connect. */
const SERVICES = [
  "github", "gitlab", "notion", "slack", "linear", "jira", "confluence", "figma", "google drive", "google docs", "google sheets",
  "gmail", "calendar", "airtable", "hubspot", "salesforce", "shopify", "stripe", "asana", "trello", "discord", "sentry",
  "vercel", "supabase", "cloudflare", "zendesk", "intercom", "dropbox", "box", "monday", "clickup", "webflow", "wordpress",
];

export function servicesIn(text: string): string[] {
  const t = text.toLowerCase();
  return SERVICES.filter((s) => new RegExp(`\\b${s}\\b`).test(t));
}

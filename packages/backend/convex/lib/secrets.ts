/**
 * Secrets at rest: AES-GCM with a 256-bit key from CONNECTIONS_KEY (base64).
 * Web Crypto only, so it runs in Convex's default runtime and in Node actions.
 * Generate a key: `openssl rand -base64 32`, then `npx convex env set CONNECTIONS_KEY …`.
 */

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(): Promise<CryptoKey> {
  const raw = process.env.CONNECTIONS_KEY;
  if (!raw) throw new Error("CONNECTIONS_KEY isn't set on this deployment, so Plex can't store account tokens.");
  const bytes = unb64(raw);
  if (bytes.length !== 32) throw new Error("CONNECTIONS_KEY must be 32 bytes, base64 (openssl rand -base64 32).");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export const secretsConfigured = () => Boolean(process.env.CONNECTIONS_KEY);

export async function seal(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(plain)));
  return `${b64(iv)}:${b64(ct)}`;
}

export async function unseal(sealed: string): Promise<string> {
  const [iv, ct] = sealed.split(":");
  if (!iv || !ct) throw new Error("Bad sealed value");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct));
  return new TextDecoder().decode(plain);
}

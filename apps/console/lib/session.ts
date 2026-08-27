// UI セッション（HMAC 署名付き Cookie）。D1 に依存しないので middleware からも使う。
// Cookie 値: base64url(payload JSON) + "." + base64url(HMAC-SHA256(payload))
// payload: { v: 1, sub: "password", scopes: [...], iat, exp }
// 秘密は Worker secret SESSION_SECRET。未設定なら NEWSDIGEST_API_KEY から派生（設定漏れでログイン不能にしない）。

export const SESSION_COOKIE = "nd_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 日

export interface SessionPayload { v: 1; sub: string; scopes: string[]; iat: number; exp: number }

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function secretMaterial(): string {
  const s = process.env.SESSION_SECRET || "";
  if (s) return s;
  const k = process.env.NEWSDIGEST_API_KEY || "";
  return k ? `newsdigest-session-derived:${k}` : "";
}

async function hmacKey(): Promise<CryptoKey | null> {
  const m = secretMaterial();
  if (!m) return null;
  return crypto.subtle.importKey("raw", enc.encode(m), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionValue(scopes: string[], sub = "password", maxAge = SESSION_MAX_AGE): Promise<string | null> {
  const key = await hmacKey();
  if (!key) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { v: 1, sub, scopes, iat: now, exp: now + maxAge };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return `${body}.${sig}`;
}

export async function verifySessionValue(value: string | undefined | null): Promise<SessionPayload | null> {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const body = value.slice(0, i), sig = value.slice(i + 1);
  const key = await hmacKey();
  if (!key) return null;
  const expected = b64url(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64url(body))) as SessionPayload;
    if (p.v !== 1 || !Array.isArray(p.scopes) || typeof p.exp !== "number") return null;
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

export function sessionSetCookie(value: string, maxAge = SESSION_MAX_AGE): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}

// UI を公開モードにするか（wrangler.jsonc vars.PUBLIC_UI = "1"）
export function isPublicUi(): boolean {
  return process.env.PUBLIC_UI === "1" || process.env.PUBLIC_UI === "true";
}

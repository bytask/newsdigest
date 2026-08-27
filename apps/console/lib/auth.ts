// 認証の一本化: リクエスト → Principal（誰が・どのスコープで）。REST / MCP / UI(Settings) が共通で使う。
//
//   1. Authorization: Bearer nd_<id>_<secret>   → api_keys（D1）で照合。スコープは鍵ごと
//   2. Authorization: Bearer <NEWSDIGEST_API_KEY> → ブートストラップ鍵（Worker secret）。admin 相当。セットアップ・復旧用
//   3. Cookie nd_session                          → UI セッション（パスワードログイン）。全スコープ
//   4. /mcp/<token> のパストークン                 → api_keys で照合。read のみの鍵だけ許可（URL に置く前提なので）
//
// スコープ: read（GET / MCP の list_*・get_*）, write（POST digests/raw）, manage（PUT sources/policy, MCP の設定変更）, admin（鍵・パスワード管理）
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getApiKeyById, touchApiKey } from "./store";
import { SESSION_COOKIE, readCookie, timingSafeEqual, verifySessionValue } from "./session";

export type Scope = "read" | "write" | "manage" | "admin";
export const SCOPES: Scope[] = ["read", "write", "manage", "admin"];

export interface Principal {
  kind: "key" | "bootstrap" | "session";
  id: string;                 // 鍵 ID / "bootstrap" / "session"
  name: string;
  scopes: Set<Scope>;
  via: "bearer" | "path" | "cookie";
}

export function parseScopes(s: string | string[]): Set<Scope> {
  const list = Array.isArray(s) ? s : s.split(",");
  return new Set(list.map((x) => x.trim()).filter((x): x is Scope => (SCOPES as string[]).includes(x)));
}

const enc = new TextEncoder();
export async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── API キー ──

export const KEY_RE = /^nd_([a-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

export async function verifyApiKey(token: string, via: "bearer" | "path"): Promise<Principal | null> {
  const m = token.match(KEY_RE);
  if (!m) return null;
  const row = await getApiKeyById(m[1]);
  if (!row || row.revoked_at) return null;
  if (row.expires_at && row.expires_at < new Date().toISOString()) return null;
  if (!timingSafeEqual(await sha256hex(token), row.key_hash)) return null;
  try { getCloudflareContext().ctx.waitUntil(touchApiKey(row.id)); } catch { /* ローカル dev 等 */ }
  return { kind: "key", id: row.id, name: row.name, scopes: parseScopes(row.scopes), via };
}

export function verifyBootstrap(token: string): Principal | null {
  const key = process.env.NEWSDIGEST_API_KEY || "";
  if (!key || !timingSafeEqual(token, key)) return null;
  return { kind: "bootstrap", id: "bootstrap", name: "bootstrap (NEWSDIGEST_API_KEY)", scopes: new Set(SCOPES), via: "bearer" };
}

// ── パスワード（PBKDF2-SHA256）。保存形式: pbkdf2$<iter>$<salt hex>$<hash hex> ──

export const PBKDF2_ITERATIONS = 60_000; // 無料枠の CPU 10ms に収まる範囲（約 5ms）。強度はレートリミットと生成パスワードで補う

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...salt].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${hex}$${await pbkdf2(password, salt, PBKDF2_ITERATIONS)}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [alg, iter, saltHex, hash] = stored.split("$");
  if (alg !== "pbkdf2" || !iter || !saltHex || !hash) return false;
  const salt = Uint8Array.from(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  return timingSafeEqual(await pbkdf2(password, salt, Number(iter)), hash);
}

// ── リクエスト → Principal ──

// Cookie 認証の状態変更リクエストは same-origin からのみ受ける（SameSite=Lax に加えた防御）。
function sameOriginOk(req: Request): boolean {
  const m = req.method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  const sfs = req.headers.get("sec-fetch-site");
  if (sfs) return sfs === "same-origin" || sfs === "none";
  const origin = req.headers.get("origin");
  if (!origin) return true; // 非ブラウザ
  try { return new URL(origin).host === new URL(req.url).host; } catch { return false; }
}

export async function authenticate(req: Request, opts: { pathToken?: string } = {}): Promise<Principal | null> {
  if (opts.pathToken) {
    const p = await verifyApiKey(opts.pathToken, "path");
    if (!p) return null;
    // URL に置く鍵は read のみ。書き込み権限のある鍵をパスで使わせない
    for (const s of p.scopes) if (s !== "read") return null;
    return p;
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    return (await verifyApiKey(t, "bearer")) ?? verifyBootstrap(t);
  }
  const cookie = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (cookie) {
    const s = await verifySessionValue(cookie);
    if (s && sameOriginOk(req)) return { kind: "session", id: "session", name: s.sub, scopes: parseScopes(s.scopes), via: "cookie" };
  }
  return null;
}

export function requireScope(p: Principal | null, scope: Scope): NextResponse | null {
  if (!p) {
    return NextResponse.json({ error: "unauthorized" }, {
      status: 401, headers: { "WWW-Authenticate": 'Bearer realm="newsdigest"', "Cache-Control": "no-store" },
    });
  }
  if (!p.scopes.has(scope)) {
    return NextResponse.json({ error: `scope '${scope}' required`, key: p.name, scopes: [...p.scopes] }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return null;
}

export const principalInfo = (p: Principal) => ({ kind: p.kind, id: p.id, name: p.name, scopes: [...p.scopes], via: p.via });

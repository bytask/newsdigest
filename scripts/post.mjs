#!/usr/bin/env node
// newsdigest コンソール REST API の薄いクライアント（依存ゼロ）。スキルから呼ぶ。
//
//   node scripts/post.mjs health                       GET  /api/health（認証不要）
//   node scripts/post.mjs sources                      GET  /api/sources → stdout(JSON)
//   node scripts/post.mjs sources:put <file.json>      PUT  /api/sources（全置換）
//   node scripts/post.mjs policy                       GET  /api/policy → stdout(markdown)。未設定なら exit 3
//   node scripts/post.mjs policy:put <file.md>         PUT  /api/policy
//   node scripts/post.mjs digest <name> <file.md>      POST /api/digests {name, markdown}
//   node scripts/post.mjs digest:get <name>            GET  /api/digests/<name> → stdout(markdown)
//   node scripts/post.mjs digests                      GET  /api/digests → stdout(JSON)
//   node scripts/post.mjs raw <file.json>              POST /api/raw（RawCollection）
//   node scripts/post.mjs raw:get <date>               GET  /api/raw/<date>
//   node scripts/post.mjs whoami                       GET  /api/auth/session（この鍵のスコープ）
//   node scripts/post.mjs keys                         GET  /api/keys（admin）
//   node scripts/post.mjs keys:add <name> <scopes> [YYYY-MM-DD] [--save VAR]   POST /api/keys（admin）。scopes は read,write,manage,admin のカンマ区切り。--save で .env.local の VAR に書き込む
//   node scripts/post.mjs keys:revoke <id>             DELETE /api/keys/<id>（admin）
//   node scripts/post.mjs password:set [password]      PUT  /api/auth/password（admin）。省略時はランダム生成して表示
//
// env: NEWSDIGEST_API_URL, NEWSDIGEST_API_KEY（.env.local / .env からも読む）
//      admin 系（keys* / password:set）は NEWSDIGEST_ADMIN_API_KEY があればそれを優先し、無ければ NEWSDIGEST_API_KEY を使う
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { loadEnv, requireEnv } from "./env.mjs";

const argv = process.argv.slice(2);
const flagOpt = (n) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? "") : undefined; };
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1] === "--save"));
const [cmd, a1, a2, a3] = positional;
if (!cmd) {
  console.error(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 21).join("\n"));
  process.exit(1);
}

loadEnv();
const base = (process.env.NEWSDIGEST_API_URL || "").replace(/\/+$/, "");

async function call(method, p, body, { auth = true, text = false, raw = false, admin = false } = {}) {
  if (!base) requireEnv("NEWSDIGEST_API_URL");
  const headers = { "Content-Type": raw ? "text/markdown; charset=utf-8" : "application/json" };
  if (auth) {
    const key = (admin && process.env.NEWSDIGEST_ADMIN_API_KEY) || requireEnv("NEWSDIGEST_API_KEY")[0];
    headers.Authorization = `Bearer ${key}`;
  }
  // 任意: Cloudflare Access を前に置いている場合の Service Token（docs/CUSTOMIZE.md）
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  if (res.status === 204) return null;
  const out = text ? await res.text() : await res.text().then((t) => { try { return JSON.parse(t); } catch { return t; } });
  if (!res.ok) {
    console.error(`${method} ${p} → HTTP ${res.status}`, typeof out === "string" ? out.slice(0, 300) : JSON.stringify(out));
    if (res.status === 403) console.error("hint: この鍵のスコープが足りません。Settings 画面か `keys:add` で必要なスコープの鍵を発行してください（admin 系は NEWSDIGEST_ADMIN_API_KEY でも可）");
    process.exit(1);
  }
  return out;
}

const validName = (n) => /^([\w-]+\/)?[\w-]+$/.test(n);

switch (cmd) {
  case "health": {
    const r = await call("GET", "/api/health", undefined, { auth: false });
    console.log(JSON.stringify(r));
    if (!r.ok) process.exit(1);
    break;
  }
  case "sources": console.log(JSON.stringify(await call("GET", "/api/sources"), null, 2)); break;
  case "sources:put": {
    if (!a1) { console.error("usage: sources:put <file.json>"); process.exit(1); }
    const doc = JSON.parse(readFileSync(a1, "utf8"));
    if (!doc?.sources) { console.error("invalid sources doc (need .sources)"); process.exit(1); }
    console.log(JSON.stringify(await call("PUT", "/api/sources", doc)));
    break;
  }
  case "policy": {
    const p = await call("GET", "/api/policy", undefined, { text: true });
    if (p === null || !p.trim()) { console.error("policy not configured (set it with the newsdigest MCP set_digest_policy or `policy:put <file.md>`)"); process.exit(3); }
    process.stdout.write(p.endsWith("\n") ? p : p + "\n");
    break;
  }
  case "policy:put": {
    if (!a1) { console.error("usage: policy:put <file.md>"); process.exit(1); }
    console.log(JSON.stringify(await call("PUT", "/api/policy", readFileSync(a1, "utf8"), { raw: true })));
    break;
  }
  case "digests": console.log(JSON.stringify(await call("GET", "/api/digests"), null, 2)); break;
  case "digest": {
    if (!a1 || !a2) { console.error("usage: digest <name> <file.md>"); process.exit(1); }
    if (!validName(a1)) { console.error(`invalid name: ${a1} (YYYY-MM-DD or reviews/YYYY-MM)`); process.exit(1); }
    const markdown = readFileSync(a2, "utf8");
    if (markdown.trim().length < 50) { console.error("refusing to post an (almost) empty digest"); process.exit(1); }
    console.log(JSON.stringify(await call("POST", "/api/digests", { name: a1, markdown })));
    break;
  }
  case "digest:get": {
    if (!a1) { console.error("usage: digest:get <name>"); process.exit(1); }
    process.stdout.write(await call("GET", `/api/digests/${a1}`, undefined, { text: true }));
    break;
  }
  case "raw": {
    if (!a1) { console.error("usage: raw <file.json>"); process.exit(1); }
    const data = JSON.parse(readFileSync(a1, "utf8"));
    if (!data?.date || !Array.isArray(data.items)) { console.error("invalid raw collection (need date, items[])"); process.exit(1); }
    console.log(JSON.stringify(await call("POST", "/api/raw", data)));
    break;
  }
  case "raw:get": {
    if (!a1) { console.error("usage: raw:get <date>"); process.exit(1); }
    console.log(JSON.stringify(await call("GET", `/api/raw/${a1}`), null, 2));
    break;
  }
  case "whoami": console.log(JSON.stringify(await call("GET", "/api/auth/session"), null, 2)); break;
  case "keys": console.log(JSON.stringify(await call("GET", "/api/keys", undefined, { admin: true }), null, 2)); break;
  case "keys:add": {
    if (!a1 || !a2) { console.error("usage: keys:add <name> <scopes: read,write,manage,admin> [YYYY-MM-DD]"); process.exit(1); }
    const expires_at = a3 || null;
    const r = await call("POST", "/api/keys", { name: a1, scopes: a2.split(","), expires_at }, { admin: true });
    const save = flagOpt("--save");
    if (save && /^[A-Z_][A-Z0-9_]*$/.test(save)) {
      const { existsSync, writeFileSync } = await import("node:fs");
      const p = new URL("../.env.local", import.meta.url);
      let env = existsSync(p) ? readFileSync(p, "utf8") : "";
      env = new RegExp(`^${save}=`, "m").test(env) ? env.replace(new RegExp(`^${save}=.*$`, "m"), `${save}=${r.key}`) : env + `${save}=${r.key}\n`;
      writeFileSync(p, env);
      console.error(`※ .env.local の ${save} に保存しました`);
    }
    console.log(JSON.stringify(r, null, 2));
    console.error("※ 平文の鍵はこの出力（と --save 先）にしか出ません");
    break;
  }
  case "keys:revoke": {
    if (!a1) { console.error("usage: keys:revoke <id>"); process.exit(1); }
    console.log(JSON.stringify(await call("DELETE", `/api/keys/${a1}`, undefined, { admin: true })));
    break;
  }
  case "password:set": {
    const pw = a1 || randomBytes(12).toString("base64url");
    if (pw.length < 8) { console.error("password must be >= 8 chars"); process.exit(1); }
    const r = await call("PUT", "/api/auth/password", { password: pw }, { admin: true });
    console.log(JSON.stringify({ ...r, password: pw }));
    console.error(`※ UI パスワード: ${pw}（この出力にしか出ません）`);
    break;
  }
  default:
    console.error(`unknown command: ${cmd}`);
    process.exit(1);
}

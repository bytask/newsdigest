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
//
// env: NEWSDIGEST_API_URL, NEWSDIGEST_API_KEY（.env.local / .env からも読む）
import { readFileSync } from "node:fs";
import { loadEnv, requireEnv } from "./env.mjs";

const [cmd, a1, a2] = process.argv.slice(2);
if (!cmd) {
  console.error(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 15).join("\n"));
  process.exit(1);
}

loadEnv();
const base = (process.env.NEWSDIGEST_API_URL || "").replace(/\/+$/, "");

async function call(method, p, body, { auth = true, text = false, raw = false } = {}) {
  if (!base) requireEnv("NEWSDIGEST_API_URL");
  const headers = { "Content-Type": raw ? "text/markdown; charset=utf-8" : "application/json" };
  if (auth) {
    const [key] = requireEnv("NEWSDIGEST_API_KEY");
    headers.Authorization = `Bearer ${key}`;
  }
  const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  if (res.status === 204) return null;
  const out = text ? await res.text() : await res.text().then((t) => { try { return JSON.parse(t); } catch { return t; } });
  if (!res.ok) {
    console.error(`${method} ${p} → HTTP ${res.status}`, typeof out === "string" ? out.slice(0, 300) : JSON.stringify(out));
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
  default:
    console.error(`unknown command: ${cmd}`);
    process.exit(1);
}

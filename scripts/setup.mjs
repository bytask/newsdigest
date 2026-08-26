#!/usr/bin/env node
// Intel Digest セットアップ CLI（依存ゼロ）。`npm run setup`
//
// やること:
//   1. Node / wrangler の確認、Cloudflare 認証（wrangler login）
//   2. Worker 名・表示名の設定（apps/console/wrangler.jsonc を書き換え）
//   3. D1 作成 + schema.sql 適用
//   4. INTEL_API_KEY 生成 + Worker secret 登録
//   5. Worker デプロイ → URL 取得
//   6. 初期ソース投入（sources.json があればそれ、なければ sources.example.json）
//   7. ヘルスチェック、.env.local 書き出し、次の手順（ルーティン登録）の案内
//
// 何度実行してもよい（作成済みのものはスキップ）。非対話: `npm run setup -- --yes`
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { ROOT, loadEnv } from "./env.mjs";

const CONSOLE = path.join(ROOT, "apps/console");
const WRANGLER_JSONC = path.join(CONSOLE, "wrangler.jsonc");
const ENV_LOCAL = path.join(ROOT, ".env.local");
const args = process.argv.slice(2);
const YES = args.includes("--yes");
const SKIP_DEPLOY = args.includes("--skip-deploy");

const c = { b: (s) => `\x1b[1m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };
const step = (n, t) => console.log(`\n${c.b(`[${n}/7] ${t}`)}`);
const ok = (t) => console.log(`  ${c.g("✔")} ${t}`);
const warn = (t) => console.log(`  ${c.y("!")} ${t}`);
const fail = (t) => { console.error(`  ${c.r("✖")} ${t}`); process.exit(1); };

const rl = createInterface({ input: process.stdin, output: process.stdout });
async function ask(q, def = "") {
  if (YES) return def;
  const a = (await rl.question(`  ${q}${def ? c.d(` [${def}]`) : ""}: `)).trim();
  return a || def;
}
async function confirm(q, def = true) {
  if (YES) return def;
  const a = (await rl.question(`  ${q} ${c.d(def ? "[Y/n]" : "[y/N]")}: `)).trim().toLowerCase();
  if (!a) return def;
  return a.startsWith("y");
}

// wrangler は apps/console の node_modules のものを使う（グローバル不要）
function wrangler(argv, { input, inherit = false } = {}) {
  const r = spawnSync("npx", ["--no-install", "wrangler", ...argv], {
    cwd: CONSOLE, encoding: "utf8", input,
    stdio: inherit ? "inherit" : ["pipe", "pipe", "pipe"],
    env: { ...process.env, CI: process.env.CI ?? "" },
  });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function npm(argv, { capture = false } = {}) {
  const r = spawnSync("npm", argv, { cwd: CONSOLE, encoding: "utf8", stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit" });
  if (r.status !== 0) fail(`npm ${argv.join(" ")} failed${capture ? `\n${(r.stdout || "") + (r.stderr || "")}` : ""}`);
  return (r.stdout || "") + (r.stderr || "");
}

// ── 0. 前提 ──
console.log(c.b("\nIntel Digest セットアップ"));
console.log(c.d("  Cloudflare Workers + D1 にコンソールをデプロイし、ルーティン登録の準備をします。\n"));
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) fail(`Node.js 20+ が必要です（現在 ${process.versions.node}）`);
if (!existsSync(path.join(CONSOLE, "node_modules"))) {
  console.log("  apps/console の依存をインストールします…");
  npm(["install", "--no-audit", "--no-fund"]);
}
ok(`Node ${process.versions.node} / wrangler ${wrangler(["--version"]).out.trim().split("\n").pop()}`);

// ── 1. Cloudflare 認証 ──
step(1, "Cloudflare 認証");
let who = wrangler(["whoami"]);
if (!/Account Name|account/i.test(who.out) || /not authenticated|You are not logged in/i.test(who.out)) {
  console.log("  ブラウザで Cloudflare にログインします（wrangler login）…");
  wrangler(["login"], { inherit: true });
  who = wrangler(["whoami"]);
}
if (!/Account/i.test(who.out)) fail("Cloudflare 認証に失敗しました。`npx wrangler login` を apps/console で実行してから再試行してください");
ok(who.out.split("\n").filter((l) => /│/.test(l)).slice(1, 2).join(" ").replace(/│/g, "").trim() || "認証済み");

// ── 2. 名前 ──
step(2, "Worker 名と表示名");
let jsonc = readFileSync(WRANGLER_JSONC, "utf8");
const cur = (key) => (jsonc.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`)) || [])[1] || "";
const workerName = (await ask("Worker 名（URL の一部になります。英小文字・数字・ハイフン）", cur("name") || "intel-console")).toLowerCase();
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(workerName)) fail("Worker 名は英小文字・数字・ハイフンのみ");
const appName = await ask("画面に表示するアプリ名", cur("APP_NAME") || "Intel Digest");
jsonc = jsonc.replace(/"name"\s*:\s*"[^"]*"/, `"name": "${workerName}"`)
             .replace(/"database_name"\s*:\s*"[^"]*"/, `"database_name": "${workerName}"`)
             .replace(/"APP_NAME"\s*:\s*"[^"]*"/, `"APP_NAME": "${appName.replace(/"/g, '\\"')}"`);
writeFileSync(WRANGLER_JSONC, jsonc);
ok(`name=${workerName} / APP_NAME=${appName}`);

// ── 3. D1 ──
step(3, "D1 データベース");
const dbName = workerName;
let dbId = cur("database_id");
if (!/^[0-9a-f-]{36}$/.test(dbId)) {
  const list = wrangler(["d1", "list", "--json"]);
  let found = null;
  try { found = JSON.parse(list.out.slice(list.out.indexOf("["))).find((d) => d.name === dbName); } catch { /* ignore */ }
  if (found) {
    dbId = found.uuid; ok(`既存の D1 "${dbName}" を使います (${dbId})`);
  } else {
    const r = wrangler(["d1", "create", dbName]);
    const m = r.out.match(/database_id\s*[:=]\s*"?([0-9a-f-]{36})/);
    if (r.status !== 0 || !m) fail(`D1 作成に失敗:\n${r.out}`);
    dbId = m[1]; ok(`D1 "${dbName}" を作成 (${dbId})`);
  }
  jsonc = readFileSync(WRANGLER_JSONC, "utf8").replace(/"database_id"\s*:\s*"[^"]*"/, `"database_id": "${dbId}"`);
  writeFileSync(WRANGLER_JSONC, jsonc);
} else {
  ok(`D1 設定済み (${dbId})`);
}
{
  const r = wrangler(["d1", "execute", dbName, "--remote", "--file=./schema.sql", "-y"]);
  if (r.status !== 0) fail(`スキーマ適用に失敗:\n${r.out}`);
  ok("schema.sql を適用（冪等）");
}

// ── 4. API キー ──
step(4, "API キー（INTEL_API_KEY）");
loadEnv();
let apiKey = process.env.INTEL_API_KEY || "";
if (apiKey && !YES && !(await confirm(".env.local の INTEL_API_KEY を再利用しますか？"))) apiKey = "";
if (!apiKey) { apiKey = randomBytes(24).toString("hex"); ok("新しいキーを生成"); }
{
  const r = wrangler(["secret", "put", "INTEL_API_KEY", "--name", workerName], { input: apiKey + "\n" });
  // 初回（Worker 未デプロイ）は secret put が失敗するので、その場合はデプロイ後に再登録する
  if (r.status !== 0) warn("Worker 未作成のため secret はデプロイ後に登録します");
  else ok("Worker secret INTEL_API_KEY を登録");
  var secretPending = r.status !== 0;
}

// ── 5. デプロイ ──
step(5, "デプロイ");
let url = process.env.INTEL_API_URL || "";
if (SKIP_DEPLOY) {
  warn("--skip-deploy: デプロイをスキップ");
} else {
  console.log("  ビルド＆デプロイ中（1〜3 分）…");
  const out = npm(["run", "deploy"], { capture: true });
  const m = out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i);
  if (!m) { console.log(out.slice(-1500)); fail("デプロイ出力から URL を取得できませんでした"); }
  url = m[0];
  ok(`デプロイ完了: ${url}`);
  if (secretPending) {
    const r = wrangler(["secret", "put", "INTEL_API_KEY", "--name", workerName], { input: apiKey + "\n" });
    if (r.status !== 0) fail(`secret 登録に失敗:\n${r.out}`);
    ok("Worker secret INTEL_API_KEY を登録");
  }
}
if (!url) fail("INTEL_API_URL が不明です（--skip-deploy の場合は .env.local に INTEL_API_URL を書いてください）");

// ── 6. 初期ソース ──
step(6, "初期ソース");
const H = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
async function api(method, p, body) {
  const res = await fetch(url + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}
{
  const s = await api("GET", "/api/sources");
  if (s.status === 401) fail("API キーが一致しません。secret の反映に数十秒かかることがあります。少し待って再実行してください");
  const total = s.json ? Object.values(s.json.sources || {}).reduce((n, l) => n + l.length, 0) : 0;
  if (total > 0) {
    ok(`ソース ${total} 件が登録済み（投入をスキップ）`);
  } else {
    const file = existsSync(path.join(ROOT, "sources.json")) ? "sources.json" : "sources.example.json";
    if (await confirm(`${file} を初期ソースとして投入しますか？`)) {
      const doc = JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
      const r = await api("PUT", "/api/sources", doc);
      if (r.status !== 200) fail(`ソース投入に失敗 (HTTP ${r.status})`);
      ok(`${file} を投入`);
    } else warn("ソース未投入（後で `node scripts/post.mjs sources:put <file>` で投入できます）");
  }
}

// ── 7. 仕上げ ──
step(7, "ヘルスチェックと保存");
{
  const res = await fetch(url + "/api/health").then((r) => r.json()).catch(() => null);
  if (!res?.ok) fail(`ヘルスチェック失敗: ${JSON.stringify(res)}`);
  ok(`health ok (db=${res.db}, api_key_configured=${res.api_key_configured})`);
}
{
  let env = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8") : "# Intel Digest — ローカル用（gitignore 済み）。ルーティンには claude.ai の環境変数として同じ値を登録する\n";
  const set = (k, v) => { env = new RegExp(`^${k}=`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : env + `${k}=${v}\n`; };
  set("INTEL_API_URL", url); set("INTEL_API_KEY", apiKey);
  writeFileSync(ENV_LOCAL, env);
  ok(".env.local に INTEL_API_URL / INTEL_API_KEY を保存");
}
rl.close();

console.log(`
${c.b("完了。")} コンソール: ${c.g(url)}

${c.b("次の手順 — Claude Code ルーティンの登録")}
  1. https://claude.ai/code/environments で使う環境を開き、Environment variables に以下を登録:
       INTEL_API_URL=${url}
       INTEL_API_KEY=${apiKey}
       ${c.d("（任意）XAI_API_KEY=…  NOTIFY_SLACK_WEBHOOK_URL=…  DIGEST_LANG=ja  DIGEST_TZ=Asia/Tokyo")}
     ${c.d("同じ画面でネットワークアクセスを確認: " + new URL(url).host + " / api.x.ai / 各 RSS ホストに到達できる設定にする")}
  2. このリポジトリを GitHub に push し（fork 済みなら不要）、Claude Code Web が GitHub リポジトリにアクセスできることを確認
  3. ローカルの Claude Code でこのリポジトリを開き、次を実行:
       ${c.g("/intel-digest-routine")}
     → ルーティン API 経由で日次ルーティンを作成し、初回を手動実行して結果を確認します

${c.d("手動で 1 回だけ試す（ローカル）: claude \"/intel-digest\"（.env.local を自動で読みます）")}
`);

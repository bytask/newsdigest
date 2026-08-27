#!/usr/bin/env node
// NewsDigest セットアップ CLI（依存ゼロ）。`npm run setup`
// 通常は Claude Code の `/newsdigest-setup` スキルから非対話で呼ばれる。人間が直接叩いてもよい。
//
// やること:
//   1. Node / wrangler の確認、Cloudflare 認証（wrangler login）
//   2. Worker 名・表示名の設定（apps/console/wrangler.jsonc を書き換え）
//   3. D1 作成 + schema.sql 適用
//   4. NEWSDIGEST_API_KEY 生成 + Worker secret 登録
//   5. Worker デプロイ → URL 取得
//   6. ヘルスチェック、.env.local 書き出し、MCP 登録コマンドと次の手順の案内
//
// ソースと分析方針は投入しない（利用者が MCP / Claude Code で設定する）。--seed <file.json> で投入も可。
// 何度実行してもよい（作成済みのものはスキップ）。
//
// オプション:
//   --yes                非対話（既定値で進める）
//   --name <worker>      Worker 名（URL の一部）。既定 newsdigest
//   --app-name <name>    画面の表示名。既定 NewsDigest
//   --seed <file.json>   ソースマスタを投入する（sources.template.json 形式）
//   --skip-deploy        デプロイしない（.env.local の NEWSDIGEST_API_URL を使う）
//   --json               最後に結果を 1 行 JSON で出す（Claude Code が読む用）
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
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined; };
const YES = flag("--yes") || Boolean(opt("--name")) || !process.stdin.isTTY;
const SKIP_DEPLOY = flag("--skip-deploy");
const JSON_OUT = flag("--json");
const SEED = opt("--seed");

const c = { b: (s) => `\x1b[1m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };
const step = (n, t) => console.log(`\n${c.b(`[${n}/6] ${t}`)}`);
const ok = (t) => console.log(`  ${c.g("✔")} ${t}`);
const warn = (t) => console.log(`  ${c.y("!")} ${t}`);
const fail = (t) => { console.error(`  ${c.r("✖")} ${t}`); if (JSON_OUT) console.log(JSON.stringify({ ok: false, error: t })); process.exit(1); };

const rl = YES ? null : createInterface({ input: process.stdin, output: process.stdout });
async function ask(q, def = "") {
  if (YES) return def;
  const a = (await rl.question(`  ${q}${def ? c.d(` [${def}]`) : ""}: `)).trim();
  return a || def;
}

// wrangler は apps/console の node_modules のものを使う（グローバル不要）
function wrangler(argv, { input, inherit = false } = {}) {
  const r = spawnSync("npx", ["--no-install", "wrangler", ...argv], {
    cwd: CONSOLE, encoding: "utf8", input,
    stdio: inherit ? "inherit" : ["pipe", "pipe", "pipe"],
  });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function npm(argv, { capture = false } = {}) {
  const r = spawnSync("npm", argv, { cwd: CONSOLE, encoding: "utf8", stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit" });
  if (r.status !== 0) fail(`npm ${argv.join(" ")} failed${capture ? `\n${(r.stdout || "") + (r.stderr || "")}` : ""}`);
  return (r.stdout || "") + (r.stderr || "");
}

// ── 0. 前提 ──
console.log(c.b("\nNewsDigest セットアップ"));
console.log(c.d("  Cloudflare Workers + D1 にコンソールをデプロイし、MCP / ルーティン登録の準備をします。\n"));
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
const authed = () => /Account Name|Account ID/i.test(who.out) && !/not authenticated|not logged in/i.test(who.out);
if (!authed()) {
  if (process.env.CLOUDFLARE_API_TOKEN) fail("CLOUDFLARE_API_TOKEN が無効です");
  console.log("  ブラウザで Cloudflare にログインします（wrangler login）…");
  wrangler(["login"], { inherit: true });
  who = wrangler(["whoami"]);
}
if (!authed()) fail("Cloudflare 認証に失敗しました。`cd apps/console && npx wrangler login` を実行してから再試行してください（CI では CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID）");
ok("認証済み");

// ── 2. 名前 ──
step(2, "Worker 名と表示名");
let jsonc = readFileSync(WRANGLER_JSONC, "utf8");
const cur = (key) => (jsonc.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`)) || [])[1] || "";
const workerName = (opt("--name") || (await ask("Worker 名（URL の一部。英小文字・数字・ハイフン）", cur("name") || "newsdigest"))).toLowerCase();
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(workerName)) fail("Worker 名は英小文字・数字・ハイフンのみ");
const appName = opt("--app-name") || (await ask("画面に表示するアプリ名", cur("APP_NAME") || "NewsDigest"));
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
    const m = r.out.match(/database_id"?\s*[:=]\s*"?([0-9a-f-]{36})/);
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
step(4, "API キー（NEWSDIGEST_API_KEY）");
loadEnv();
let apiKey = process.env.NEWSDIGEST_API_KEY || "";
if (apiKey) ok(".env.local の NEWSDIGEST_API_KEY を再利用");
else { apiKey = randomBytes(24).toString("hex"); ok("新しいキーを生成"); }
let secretPending = false;
{
  const r = wrangler(["secret", "put", "NEWSDIGEST_API_KEY", "--name", workerName], { input: apiKey + "\n" });
  if (r.status !== 0) { warn("Worker 未作成のため secret はデプロイ後に登録します"); secretPending = true; }
  else ok("Worker secret NEWSDIGEST_API_KEY を登録");
}

// ── 5. デプロイ ──
step(5, "デプロイ");
let url = process.env.NEWSDIGEST_API_URL || "";
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
    const r = wrangler(["secret", "put", "NEWSDIGEST_API_KEY", "--name", workerName], { input: apiKey + "\n" });
    if (r.status !== 0) fail(`secret 登録に失敗:\n${r.out}`);
    ok("Worker secret NEWSDIGEST_API_KEY を登録");
  }
}
if (!url) fail("NEWSDIGEST_API_URL が不明です（--skip-deploy の場合は .env.local に NEWSDIGEST_API_URL を書いてください）");

// ── 6. 仕上げ ──
step(6, "ヘルスチェックと保存");
const H = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
async function api(method, p, body) {
  const res = await fetch(url + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}
let health = null;
for (let i = 0; i < 6; i++) {
  health = await fetch(url + "/api/health").then((r) => r.json()).catch(() => null);
  if (health?.ok && health.api_key_configured) break;
  await new Promise((r) => setTimeout(r, 5000)); // secret / デプロイ反映待ち
}
if (!health?.ok) fail(`ヘルスチェック失敗: ${JSON.stringify(health)}`);
ok(`health ok (sources_active=${health.sources_active}, policy_configured=${health.policy_configured})`);
{
  const s = await api("GET", "/api/sources");
  if (s.status === 401) fail("API キーが一致しません。secret の反映に数十秒かかることがあります。少し待って再実行してください");
}
if (SEED) {
  const doc = JSON.parse(readFileSync(path.resolve(SEED), "utf8"));
  const r = await api("PUT", "/api/sources", doc);
  if (r.status !== 200) fail(`ソース投入に失敗 (HTTP ${r.status})`);
  ok(`${SEED} を投入`);
}
{
  let env = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8") : "# NewsDigest — ローカル用（gitignore 済み）。ルーティンには claude.ai の環境変数として同じ値を登録する\n";
  const set = (k, v) => { env = new RegExp(`^${k}=`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : env + `${k}=${v}\n`; };
  set("NEWSDIGEST_API_URL", url); set("NEWSDIGEST_API_KEY", apiKey);
  writeFileSync(ENV_LOCAL, env);
  ok(".env.local に NEWSDIGEST_API_URL / NEWSDIGEST_API_KEY を保存");
}
rl?.close();

const mcpAdd = `claude mcp add --transport http newsdigest ${url}/mcp --header "Authorization: Bearer ${apiKey}"`;
console.log(`
${c.b("完了。")} コンソール: ${c.g(url)}

${c.b("次の手順")}
  1. MCP をこの Claude Code に登録（ソース・分析方針の設定に使う）:
       ${c.g(mcpAdd)}
     ${c.d("claude.ai のカスタムコネクタからは " + url + "/mcp/<NEWSDIGEST_API_KEY>（URL 自体が秘密）")}
  2. ソースと分析方針を設定する（MCP の add_source / set_digest_policy。書き方: docs/SOURCES-AND-POLICY.md）
  3. https://claude.ai/code/environments の Environment variables に登録:
       NEWSDIGEST_API_URL=${url}
       NEWSDIGEST_API_KEY=${apiKey}
       ${c.d("（任意）XAI_API_KEY=…  NOTIFY_SLACK_WEBHOOK_URL=…  DIGEST_LANG=ja  DIGEST_TZ=Asia/Tokyo")}
     ${c.d("同じ画面でネットワークアクセスを確認: " + new URL(url).host + " / api.x.ai / 各 RSS ホストに到達できる設定にする")}
  4. Claude Code で ${c.g("/newsdigest-routine")} → ルーティン API 経由で日次ルーティンを作成・初回実行

${c.d("Claude Code に任せる場合は /newsdigest-setup が 1〜4 を順に進めます。")}
`);
if (JSON_OUT) console.log(JSON.stringify({ ok: true, url, worker: workerName, app_name: appName, api_key: apiKey, mcp_add_command: mcpAdd, mcp_url_with_token: `${url}/mcp/${apiKey}`, health }));

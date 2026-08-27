#!/usr/bin/env node
// ルーティン（claude.ai Web版 Claude Code）の作成・更新 body を組み立てる（依存ゼロ）。
// 出力を RemoteTrigger {action:"create"|"update", body} にそのまま渡す。newsdigest-routine スキルから呼ぶ。
//
//   node scripts/routine.mjs body [options]        create 用 body（JSON）を stdout に
//   node scripts/routine.mjs body --job-config-only  update 用（job_config だけ）
//   node scripts/routine.mjs body --redact          鍵を伏せて表示（利用者に見せる用）
//
// options:
//   --mode embed|env     embed（既定）: 認証情報をプロンプトに埋め込み、ルーティンが .env を作って動く（ゼロタッチ）
//                        env: claude.ai の Environment variables に登録済みの環境変数を使う（利用者が登録する）
//   --env-id env_...     実行環境 ID（.env.local の NEWSDIGEST_ROUTINE_ENV_ID を既定にし、指定時は保存する）
//   --cron "15 22 * * *" UTC（既定 07:15 JST）
//   --model <id>         既定 claude-sonnet-5
//   --review             月次棚卸しルーティン（name=newsdigest-sources-review, prompt=routine/newsdigest-sources-review.prompt.md, cron=毎月1日 00:00 UTC）
//   --name / --prompt / --repo   個別指定
//   --no-optional        embed で任意の変数（XAI_API_KEY, NOTIFY_* など）を埋め込まない
//
// embed で使う値は .env.local から: NEWSDIGEST_API_URL, NEWSDIGEST_ROUTINE_API_KEY（read,write の鍵。local 鍵は埋め込まない）
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ROOT, loadEnv } from "./env.mjs";

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const die = (m) => { console.error(`routine.mjs: ${m}`); process.exit(1); };
if (cmd !== "body") { console.error(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 20).join("\n")); process.exit(1); }

loadEnv();
const ENV_LOCAL = path.join(ROOT, ".env.local");
const review = flag("--review");
const mode = opt("--mode", "embed");
if (!["embed", "env"].includes(mode)) die("--mode は embed か env");

// 実行環境 ID
let envId = opt("--env-id", process.env.NEWSDIGEST_ROUTINE_ENV_ID || "");
if (!/^env_[A-Za-z0-9]+$/.test(envId)) die("--env-id env_... が必要（RemoteTrigger list の既存ルーティンの job_config.ccr.environment_id、または /schedule の環境一覧から）");
if (opt("--env-id") && existsSync(ENV_LOCAL)) {
  let env = readFileSync(ENV_LOCAL, "utf8");
  env = /^NEWSDIGEST_ROUTINE_ENV_ID=/m.test(env) ? env.replace(/^NEWSDIGEST_ROUTINE_ENV_ID=.*$/m, `NEWSDIGEST_ROUTINE_ENV_ID=${envId}`) : env + `NEWSDIGEST_ROUTINE_ENV_ID=${envId}\n`;
  writeFileSync(ENV_LOCAL, env);
}

// リポジトリ URL（origin を https://github.com/<owner>/<repo> に正規化）
let repo = opt("--repo", "");
if (!repo) {
  let origin = "";
  try { origin = execSync("git remote get-url origin", { cwd: ROOT, encoding: "utf8" }).trim(); } catch { die("git remote origin がありません。--repo で指定してください"); }
  const m = origin.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) die(`origin が GitHub ではありません: ${origin}`);
  repo = `https://github.com/${m[1]}/${m[2]}`;
}

// 認証情報ブロック
const url = (process.env.NEWSDIGEST_API_URL || "").replace(/\/+$/, "");
const routineKey = process.env.NEWSDIGEST_ROUTINE_API_KEY || "";
const OPTIONAL = ["XAI_API_KEY", "XAI_MODEL", "DIGEST_LANG", "DIGEST_TZ", "DIGEST_COMMIT_LOGS",
  "NOTIFY_SLACK_WEBHOOK_URL", "NOTIFY_DISCORD_WEBHOOK_URL", "NOTIFY_WEBHOOK_URL", "LINE_CHANNEL_ID", "LINE_CHANNEL_SECRET"];
let envBlock, embedded = [];
if (mode === "embed") {
  if (!url) die("NEWSDIGEST_API_URL がありません（.env.local）。先に npm run setup");
  if (!/^nd_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/.test(routineKey))
    die("NEWSDIGEST_ROUTINE_API_KEY（read,write の鍵）が .env.local にありません。`node scripts/post.mjs keys:add routine read,write --save NEWSDIGEST_ROUTINE_API_KEY` で発行してください");
  const lines = [`NEWSDIGEST_API_URL=${url}`, `NEWSDIGEST_API_KEY=${routineKey}`];
  if (!flag("--no-optional")) for (const k of OPTIONAL) if (process.env[k]) { lines.push(`${k}=${process.env[k]}`); embedded.push(k); }
  envBlock = [
    "認証情報の準備。この環境には環境変数が設定されていないので、最初にリポジトリ直下に `.env` を次の内容で作ってから手順に入る（`scripts/*.mjs` / `scripts/notify.sh` / `tools/xai-search` が自動で読む。`.env` は gitignore 済みで、commit しない。値をログ・報告・ダイジェストに書き出さない）:",
    "```", ...lines, "```",
  ].join("\n");
} else {
  envBlock = "認証情報の準備。環境変数 `NEWSDIGEST_API_URL` / `NEWSDIGEST_API_KEY` はこの環境（claude.ai の Environment variables）に設定済み。未設定なら health が `missing env` で失敗するので、その旨を報告して終了する。";
}

const name = opt("--name", review ? "newsdigest-sources-review" : "newsdigest");
const promptFile = opt("--prompt", review ? "routine/newsdigest-sources-review.prompt.md" : "routine/newsdigest.prompt.md");
const cron = opt("--cron", review ? "0 0 1 * *" : "15 22 * * *");
const model = opt("--model", "claude-sonnet-5");
const promptTpl = readFileSync(path.join(ROOT, promptFile), "utf8");
if (!promptTpl.includes("{{ENV_BLOCK}}")) die(`${promptFile} に {{ENV_BLOCK}} がありません`);
const prompt = promptTpl.replace("{{ENV_BLOCK}}", envBlock).trimEnd();

const tpl = JSON.parse(readFileSync(path.join(ROOT, "routine/routine.template.json"), "utf8"));
delete tpl._comment;
const fill = (v) => typeof v === "string"
  ? v.replace("{{CRON}}", cron).replace("{{ENVIRONMENT_ID}}", envId).replace("{{MODEL}}", model).replace("{{REPO_URL}}", repo).replace("{{UUID}}", randomUUID()).replace("{{PROMPT}}", prompt)
  : Array.isArray(v) ? v.map(fill) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
const body = fill(tpl);
body.name = name;

let out = flag("--job-config-only") ? { job_config: body.job_config } : body;
let text = JSON.stringify(out, null, 2);
if (flag("--redact")) text = text.replace(/nd_[a-z0-9]{8}_[A-Za-z0-9_-]{43}/g, "nd_********_<redacted>").replace(/(XAI_API_KEY|LINE_CHANNEL_SECRET|NOTIFY_[A-Z_]*URL)=[^\\\n]+/g, "$1=<redacted>");
process.stdout.write(text + "\n");
console.error(`routine.mjs: name=${name} mode=${mode} cron="${cron}" (UTC) model=${model} env=${envId} repo=${repo}${embedded.length ? ` embedded optional: ${embedded.join(",")}` : ""}`);

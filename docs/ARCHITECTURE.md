# アーキテクチャ

## 全体像

```
┌───────────────────────────────────────────────────────────────┐
│ Claude Code ルーティン（claude.ai / Anthropic のクラウドサンドボックス）│
│  cron 15 22 * * * (UTC) = 07:15 JST                              │
│  1. あなたの GitHub から newsdigest を checkout                  │
│  2. 認証情報: プロンプト埋め込み(embed, 既定) or 環境変数(env) → .env     │
│  3. .claude/skills/newsdigest/SKILL.md を実行                   │
│       GET /api/sources ──────────────────────────┐              │
│       fetch-rss.mjs（RSS/Atom/releases.atom）      │              │
│       xai-search（X アカウント / トレンド）          │              │
│       要約・統合・Mermaid                          │              │
│       POST /api/digests, POST /api/raw ───────────┤              │
│       notify.sh（Slack / Discord / LINE / Webhook）│              │
└────────────────────────────────────────────────────┼──────────────┘
                                                     ▼ Bearer NEWSDIGEST_API_KEY
┌───────────────────────────────────────────────────────────────┐
│ newsdigest（Cloudflare Workers + D1、あなたのアカウント）      │
│  Next.js 15 (App Router) + OpenNext → 1 Worker                  │
│  D1: sources / digests / raw_items / raw_failures / meta        │
│  UI: /  /d/<name>  /raw  /raw/<date>  /sources  /about  /latest │
│      /login  /settings（鍵の発行・失効、パスワード変更）           │
│  API: /api/sources  /api/policy  /api/digests  /api/raw  /api/health  │
│       /api/keys  /api/auth/*                                     │
│  MCP: /mcp（Bearer）  /mcp/<read 鍵>（claude.ai コネクタ用）      │
│  任意: /api/line/webhook（LINE トピック詳細返信）                 │
└───────────────────────────────────────────────────────────────┘
```

## 4 点分離

| レイヤー | 基盤 | 担うもの | 費用 |
|---|---|---|---|
| **AI 実行** | Claude Code ルーティン | 収集・要約・登録・通知（LLM 判断が要るものすべて） | Claude サブスク内 |
| **アプリ / DB** | Cloudflare Workers + D1 | source of truth・閲覧 UI・REST API（LLM は呼ばない） | 無料枠 |
| **コード / 手順** | あなたの GitHub リポジトリ | スキル・スクリプト・プロンプト（ルーティンが毎回 checkout） | 無料 |
| **通知** | Slack / Discord / LINE / Webhook | 任意 | 無料枠 |

設計原則:

- **コンソールは AI を呼ばない**。だから常駐も課金もなく、無料枠に収まる
- **スキルが source of truth**。ルーティンもローカル手動実行も同じ `.claude/skills/` を読む。手順の改善は git push だけで次回実行から反映される
- **ルーティンはステートレス**。毎回クリーンなサンドボックスで checkout → 実行 → 終了。状態はすべて D1 側
- **ソースと分析方針は利用者が設定**。リポジトリは既定値を持たない（空で出荷）。設定は MCP（Claude Code / claude.ai）か REST
- **秘密は 2 箇所だけ**。Worker secret（`NEWSDIGEST_API_KEY` = ブートストラップ鍵、`SESSION_SECRET`、`LINE_CHANNEL_*`）と claude.ai 側（ルーティン設定に埋め込んだ `routine` 鍵、または環境変数）。リポジトリには入れない
- **人はパスワード、機械はスコープ付き API キー**。鍵は D1 にハッシュで保存し、Settings 画面で発行・失効する（[AUTH.md](AUTH.md)）

## ルーティンの実体

Claude Code Web版の **routines**（https://claude.ai/code/routines）は、cron で Claude Code のクラウドセッションを起動し、指定リポジトリを checkout してプロンプトを実行する仕組み。本パッケージでは:

- 作成・更新・手動実行・ログ取得は Claude Code 内蔵の `RemoteTrigger` ツール（claude.ai のルーティン API）で行う → `.claude/skills/newsdigest-routine/`
- `scripts/routine.mjs` が `routine/routine.template.json` と `routine/*.prompt.md` から create / update の body を組み立てる（既定は認証情報をプロンプトに埋め込む `embed`）。`allowed_tools` は Bash / Read / Write / Edit / Glob / Grep / Skill / WebFetch / WebSearch
- MCP コネクタは不要（コンソールは Bearer API で直接叩く）
- 最小間隔は 1 時間。cron は UTC

## データモデル

`apps/console/schema.sql` 参照。

- `sources` — `(kind, value)` でユニーク。`kind`: `x_account`（value=handle）/ `x_trend`（value=query）/ `rss`（value=url, title=表示名）/ `release`（value=releases.atom URL, title=owner/name）。`status`: `active` | `paused`（削除ではなく pause で履歴を残す）
- `meta` — `digest_policy`（分析方針 Markdown）、`ui_password`（PBKDF2 ハッシュ）、`review_cadence`、`review_last_reviewed`
- `api_keys` — スコープ付き API キー（`key_hash` のみ。`revoked_at` で失効、`last_used` を更新）。`login_attempts` はログインのレートリミット
- `digests` — `name` が主キー。`YYYY-MM-DD`（日次）/ `reviews/YYYY-MM`（月次棚卸し、`kind=review`）/ `<ns>/<name>`（拡張用、一覧には出ない）。本文は Markdown のまま保存し、表示時に `marked` でレンダリング、```mermaid ブロックはクライアントで描画
- `raw_items` / `raw_failures` — 要約前の全アイテムと失敗ソース。日付単位で全置換

## 認証

- 機械向け `/api/*` と `/mcp` は `Authorization: Bearer <API キー>`（`/api/health` と `/api/line/webhook` を除く）。スコープは `read / write / manage / admin`
- 閲覧 UI はパスワードログイン（HMAC 署名 Cookie、`middleware.ts`）。`vars.PUBLIC_UI="1"` で v0.1 と同じ公開モード
- 詳細は [AUTH.md](AUTH.md)

## ディレクトリ

```
apps/console/
  app/            Next.js App Router（ページ + route handlers）
  components/     Nav / Mermaid / icons
  lib/            store.ts（D1）/ mcp.ts（MCP サーバー）/ auth.ts（鍵・パスワード・スコープ）/ session.ts（Cookie 署名）/ config.ts / format.ts
  middleware.ts   閲覧 UI のログインゲート
  components/     Nav / Mermaid / icons / Settings（鍵管理 UI）
  schema.sql      D1 スキーマ（冪等）
  wrangler.jsonc  Worker 設定（name / D1 binding / vars）
.claude/skills/   newsdigest-setup / newsdigest / newsdigest-sources-review / newsdigest-routine
routine/          ルーティンのプロンプト・作成テンプレート
scripts/          setup.mjs / fetch-rss.mjs / post.mjs / notify.sh / env.mjs
tools/xai-search/ X 収集（Python、requests 自動インストール）
```

## Piper での運用実績との関係

このパッケージは Piper（bytask）が 2026-07 から毎朝運用している newsdigest / newsdigest を切り出したもの。運用側では AI 実行を自前 VPS の cron（headless `claude -p`）で行っているが、第三者配布にあたり **利用者自身の Claude Code ルーティン** に置き換えた。コンソールのコードはほぼ同一（ブランディングの外出し、`/api/health` 追加、LINE Webhook の secrets 名を汎用化）。

# アーキテクチャ

## 全体像

```
┌───────────────────────────────────────────────────────────────┐
│ Claude Code ルーティン（claude.ai / Anthropic のクラウドサンドボックス）│
│  cron 15 22 * * * (UTC) = 07:15 JST                              │
│  1. あなたの GitHub から newsdigest を checkout                  │
│  2. 環境変数 NEWSDIGEST_API_URL / NEWSDIGEST_API_KEY / XAI_API_KEY …        │
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
│  API: /api/sources  /api/policy  /api/digests  /api/raw  /api/health  │
│  MCP: /mcp（Bearer）  /mcp/<key>（claude.ai コネクタ用）         │
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
- **秘密は 2 箇所だけ**。Worker secret（`NEWSDIGEST_API_KEY`、`LINE_CHANNEL_*`）と claude.ai 環境変数。リポジトリには入れない

## ルーティンの実体

Claude Code Web版の **routines**（https://claude.ai/code/routines）は、cron で Claude Code のクラウドセッションを起動し、指定リポジトリを checkout してプロンプトを実行する仕組み。本パッケージでは:

- 作成・更新・手動実行・ログ取得は Claude Code 内蔵の `RemoteTrigger` ツール（claude.ai のルーティン API）で行う → `.claude/skills/newsdigest-routine/`
- `routine/routine.template.json` が create リクエストの body。`allowed_tools` は Bash / Read / Write / Edit / Glob / Grep / Skill / WebFetch / WebSearch
- MCP コネクタは不要（コンソールは Bearer API で直接叩く）
- 最小間隔は 1 時間。cron は UTC

## データモデル

`apps/console/schema.sql` 参照。

- `sources` — `(kind, value)` でユニーク。`kind`: `x_account`（value=handle）/ `x_trend`（value=query）/ `rss`（value=url, title=表示名）/ `release`（value=releases.atom URL, title=owner/name）。`status`: `active` | `paused`（削除ではなく pause で履歴を残す）
- `meta` — `digest_policy`（分析方針 Markdown）、`review_cadence`、`review_last_reviewed`
- `digests` — `name` が主キー。`YYYY-MM-DD`（日次）/ `reviews/YYYY-MM`（月次棚卸し、`kind=review`）/ `<ns>/<name>`（拡張用、一覧には出ない）。本文は Markdown のまま保存し、表示時に `marked` でレンダリング、```mermaid ブロックはクライアントで描画
- `raw_items` / `raw_failures` — 要約前の全アイテムと失敗ソース。日付単位で全置換

## API 認証

- 機械向け `/api/*` は `Authorization: Bearer <NEWSDIGEST_API_KEY>`（`/api/health` と `/api/line/webhook` を除く）
- 閲覧 UI は認証なし（ダイジェストは「共有されても安全な内容」を前提に生成する）。制限したい場合は Cloudflare Access（`docs/CUSTOMIZE.md`）

## ディレクトリ

```
apps/console/
  app/            Next.js App Router（ページ + route handlers）
  components/     Nav / Mermaid / icons
  lib/            store.ts（D1）/ mcp.ts（MCP サーバー）/ auth.ts（Bearer）/ config.ts（表示名）/ format.ts
  schema.sql      D1 スキーマ（冪等）
  wrangler.jsonc  Worker 設定（name / D1 binding / vars）
.claude/skills/   newsdigest-setup / newsdigest / newsdigest-sources-review / newsdigest-routine
routine/          ルーティンのプロンプト・作成テンプレート
scripts/          setup.mjs / fetch-rss.mjs / post.mjs / notify.sh / env.mjs
tools/xai-search/ X 収集（Python、requests 自動インストール）
```

## Piper での運用実績との関係

このパッケージは Piper（bytask）が 2026-07 から毎朝運用している newsdigest / newsdigest を切り出したもの。運用側では AI 実行を自前 VPS の cron（headless `claude -p`）で行っているが、第三者配布にあたり **利用者自身の Claude Code ルーティン** に置き換えた。コンソールのコードはほぼ同一（ブランディングの外出し、`/api/health` 追加、LINE Webhook の secrets 名を汎用化）。

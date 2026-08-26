# REST API

ベース URL: `https://<your-worker>.workers.dev`。`/api/health` 以外は `Authorization: Bearer <NEWSDIGEST_API_KEY>` が必要。すべて JSON（ダイジェスト本文と分析方針の取得のみ `text/markdown`）。

薄いクライアント: `node scripts/post.mjs <cmd>`（`.env.local` / 環境変数から URL とキーを読む）。対話的な操作は MCP（[MCP.md](MCP.md)）の方が楽。

## ヘルスチェック

`GET /api/health` — 認証不要

```json
{ "ok": true, "db": "ok", "digests": 12, "sources_active": 8, "policy_configured": true,
  "api_key_configured": true, "line_webhook_configured": false, "mcp": "/mcp" }
```

## ソースマスタ

`GET /api/sources` — 全ソース

```json
{
  "version": 1,
  "sources": {
    "x_accounts": [{ "handle": "…", "note": "…", "added": "2026-01-01", "status": "active" }],
    "x_trends":   [{ "query": "…", "note": "…", "added": "…", "status": "active" }],
    "rss":        [{ "url": "https://…", "title": "…", "category": "…", "note": "…", "added": "…", "status": "active" }],
    "releases":   [{ "repo": "owner/name", "url": "https://github.com/owner/name/releases.atom", "note": "…", "added": "…", "status": "active" }]
  },
  "review": { "cadence": "monthly", "last_reviewed": null }
}
```

`PUT /api/sources` — 同じ形状で **全置換**（部分更新は MCP の `add_source` / `update_source` / `remove_source` を使う）。`review.last_reviewed` を含めると `meta` も更新される。

## 分析方針

`GET /api/policy` — Markdown（`text/markdown`）。未設定なら `204`
`PUT /api/policy` — `text/markdown` ボディ、または `{ "markdown": "…" }`。20 文字未満は 400

## ダイジェスト

`GET /api/digests` — 一覧（新しい順）

```json
[{ "name": "2026-08-26", "kind": "digest", "uploadedAt": "2026-08-25 22:20:11", "size": 8123 },
 { "name": "reviews/2026-08", "kind": "review", "uploadedAt": "…", "size": 3020 }]
```

`GET /api/digests/<name>` — 本文（`text/markdown`）。`name` は `2026-08-26` や `reviews/2026-08`。

`POST /api/digests` — 登録（同名は上書き）

```json
{ "name": "2026-08-26", "markdown": "---\ndate: 2026-08-26\n…" }
```

`name` の規則: `^([\w-]+/)?[\w-]+$`。`reviews/` は `kind=review`、それ以外の名前空間は `kind=digest` だが一覧（トップページ）には出ない（拡張用）。

## 生データ

`GET /api/raw` — 日付一覧 `[{ "date": "2026-08-26", "count": 84 }]`

`GET /api/raw/<date>` / `POST /api/raw` — その日の全アイテム（POST は日付単位で全置換）

```json
{
  "date": "2026-08-26",
  "collected_at": "2026-08-26T07:16:00+09:00",
  "items": [{ "source": "…", "kind": "rss", "title": "…", "url": "https://…", "published": "…", "note": "…" }],
  "failures": [{ "source": "…", "kind": "x_trend", "reason": "xAI API returned 429" }]
}
```

`kind`: `rss` | `x_account` | `x_trend` | `release`

## MCP

`POST /mcp`（Bearer）/ `POST /mcp/<key>`（パストークン）— [MCP.md](MCP.md)

## 固定 URL（UI）

- `/latest` — 最新の日次ダイジェストへ 302。`/latest?prefix=reviews` で最新の棚卸しへ
- `/d/<name>` — ダイジェスト表示
- `/raw/<date>` — 生データ表示

## LINE Webhook（任意）

`POST /api/line/webhook` — LINE Messaging API の Webhook。`X-Line-Signature` を `LINE_CHANNEL_SECRET` で検証。postback `topic:<date>:<n>` を受けると、その日のダイジェストの `### n. …` セクションをトークに返信する（[NOTIFICATIONS.md](NOTIFICATIONS.md)）。

## エラー

| HTTP | 意味 |
|---|---|
| 401 | Bearer 不一致 |
| 400 | body 不正 |
| 404 | 該当なし |
| 503 | `NEWSDIGEST_API_KEY` 未設定（secret 未登録） |

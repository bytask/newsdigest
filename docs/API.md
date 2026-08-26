# REST API

ベース URL: `https://<your-worker>.workers.dev`。`/api/health` 以外は `Authorization: Bearer <INTEL_API_KEY>` が必要。すべて JSON（ダイジェスト本文の取得のみ `text/markdown`）。

薄いクライアント: `node scripts/post.mjs <cmd>`（`.env.local` / 環境変数から URL とキーを読む）。

## ヘルスチェック

`GET /api/health` — 認証不要

```json
{ "ok": true, "db": "ok", "digests": 12, "api_key_configured": true, "line_webhook_configured": false }
```

## ソースマスタ

`GET /api/sources` — 全ソース

```json
{
  "version": 1,
  "sources": {
    "x_accounts": [{ "handle": "AnthropicAI", "note": "…", "added": "2026-08-26", "status": "active" }],
    "x_trends":   [{ "query": "…", "note": "…", "added": "…", "status": "active" }],
    "rss":        [{ "url": "https://…", "title": "Hacker News", "category": "tech", "note": "…", "added": "…", "status": "active" }],
    "releases":   [{ "repo": "owner/name", "url": "https://github.com/owner/name/releases.atom", "note": "…", "added": "…", "status": "active" }]
  },
  "review": { "cadence": "monthly", "last_reviewed": null }
}
```

`PUT /api/sources` — 同じ形状で **全置換**（部分更新はない。GET → 編集 → PUT）。`review.last_reviewed` を含めると `meta` も更新される。

```bash
node scripts/post.mjs sources > sources.json
# 編集
node scripts/post.mjs sources:put sources.json
```

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
  "items": [{ "source": "Hacker News", "kind": "rss", "title": "…", "url": "https://…", "published": "…", "note": "…" }],
  "failures": [{ "source": "…", "kind": "x_trend", "reason": "xAI API returned 429" }]
}
```

`kind`: `rss` | `x_account` | `x_trend` | `release`

## 固定 URL（UI）

- `/latest` — 最新の日次ダイジェストへ 302。`/latest?prefix=reviews` で最新の棚卸しへ
- `/d/<name>` — ダイジェスト表示
- `/raw/<date>` — 生データ表示

## LINE Webhook（任意）

`POST /api/line/webhook` — LINE Messaging API の Webhook。`X-Line-Signature` を `LINE_CHANNEL_SECRET` で検証。postback `topic:<date>:<n>` を受けると、その日のダイジェストの `### n. …` セクションをトークに返信する。通知でトピック一覧の Flex カード（各行 postback）を送る運用と組み合わせる（`docs/NOTIFICATIONS.md`）。

## エラー

| HTTP | 意味 |
|---|---|
| 401 | Bearer 不一致 |
| 400 | body 不正（`name`/`markdown` 欠落、`date`/`items` 欠落、`sources` 欠落） |
| 404 | 該当なし |
| 503 | `INTEL_API_KEY` 未設定（secret 未登録） |

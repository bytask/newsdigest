# REST API

ベース URL: `https://<your-worker>.workers.dev`。`/api/health` と `/api/auth/login` 以外は `Authorization: Bearer <API キー>` が必要（ブラウザのセッション Cookie でも可）。すべて JSON（ダイジェスト本文と分析方針の取得のみ `text/markdown`）。

API キーはスコープ付き（[AUTH.md](AUTH.md)）。各エンドポイントに必要なスコープを `[read]` のように示す。

薄いクライアント: `node scripts/post.mjs <cmd>`（`.env.local` / 環境変数から URL とキーを読む）。対話的な操作は MCP（[MCP.md](MCP.md)）の方が楽。

## ヘルスチェック

`GET /api/health` — 認証不要

```json
{ "ok": true, "db": "ok", "digests": 12, "sources_active": 8, "policy_configured": true,
  "api_key_configured": true, "password_configured": true, "api_keys_active": 3, "ui": "protected",
  "line_webhook_configured": false, "mcp": "/mcp", "version": "0.2.0" }
```

## 認証・鍵

`GET /api/auth/session` — 今の資格情報（Bearer でも Cookie でも）。未認証でも 200 で `authenticated: false`

```json
{ "authenticated": true, "kind": "key", "id": "pka7ze2w", "name": "local", "scopes": ["read","write","manage","admin"], "via": "bearer" }
```

`POST /api/auth/login` — `{ "password": "…" }`（フォーム POST も可）→ `Set-Cookie: nd_session=…`。失敗 401、10 回/10 分を超えると 429、未設定なら 503
`POST /api/auth/logout` — Cookie を消す
`PUT /api/auth/password` — `{ "password": "…", "current_password": "…" }` [admin]。Cookie セッションからは `current_password` 必須、API キー / ブートストラップ鍵からはリセット扱いで不要。8 文字以上

`GET /api/keys` [admin] — 鍵の一覧（ハッシュは返さない）

```json
[{ "id": "pka7ze2w", "name": "local", "scopes": "read,write,manage,admin", "created_at": "2026-08-27 07:30:12",
   "expires_at": null, "last_used": "2026-08-27 07:31:36", "revoked_at": null }]
```

`POST /api/keys` [admin] — `{ "name": "routine", "scopes": ["read","write"], "expires_at": "2027-01-01" }`。平文の鍵はこの応答にだけ載る

```json
{ "ok": true, "id": "7s7ooyja", "key": "nd_7s7ooyja_…", "name": "routine", "scopes": ["read","write"], "expires_at": null,
  "hints": { "mcp_add_command": "claude mcp add …", "connector_url": null } }
```

`DELETE /api/keys/<id>` [admin] — 失効（行は残る）

## ソースマスタ

`GET /api/sources` [read] — 全ソース

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

`PUT /api/sources` [manage] — 同じ形状で **全置換**（部分更新は MCP の `add_source` / `update_source` / `remove_source` を使う）。`review.last_reviewed` を含めると `meta` も更新される。

## 分析方針

`GET /api/policy` [read] — Markdown（`text/markdown`）。未設定なら `204`
`PUT /api/policy` [manage] — `text/markdown` ボディ、または `{ "markdown": "…" }`。20 文字未満は 400

## ダイジェスト

`GET /api/digests` [read] — 一覧（新しい順）

```json
[{ "name": "2026-08-26", "kind": "digest", "uploadedAt": "2026-08-25 22:20:11", "size": 8123 },
 { "name": "reviews/2026-08", "kind": "review", "uploadedAt": "…", "size": 3020 }]
```

`GET /api/digests/<name>` [read] — 本文（`text/markdown`）。`name` は `2026-08-26` や `reviews/2026-08`。

`POST /api/digests` [write] — 登録（同名は上書き）

```json
{ "name": "2026-08-26", "markdown": "---\ndate: 2026-08-26\n…" }
```

`name` の規則: `^([\w-]+/)?[\w-]+$`。`reviews/` は `kind=review`、それ以外の名前空間は `kind=digest` だが一覧（トップページ）には出ない（拡張用）。

## 生データ

`GET /api/raw` [read] — 日付一覧 `[{ "date": "2026-08-26", "count": 84 }]`

`GET /api/raw/<date>` [read] / `POST /api/raw` [write] — その日の全アイテム（POST は日付単位で全置換）

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

`POST /mcp`（Bearer）/ `POST /mcp/<key>`（パス鍵、read 専用）— [MCP.md](MCP.md)

## 固定 URL（UI）

- `/login` / `/settings` — ログイン / 鍵の管理
- `/latest` — 最新の日次ダイジェストへ 307。`/latest?prefix=reviews` で最新の棚卸しへ
- `/d/<name>` — ダイジェスト表示
- `/raw/<date>` — 生データ表示

## LINE Webhook（任意）

`POST /api/line/webhook` — LINE Messaging API の Webhook。`X-Line-Signature` を `LINE_CHANNEL_SECRET` で検証。postback `topic:<date>:<n>` を受けると、その日のダイジェストの `### n. …` セクションをトークに返信する（[NOTIFICATIONS.md](NOTIFICATIONS.md)）。

## エラー

| HTTP | 意味 |
|---|---|
| 401 | 鍵が無効（未指定・失効・期限切れ・パス鍵に read 以外の鍵） |
| 403 | 鍵のスコープ不足（`{"error":"scope 'write' required","key":"claude-ai","scopes":["read"]}`）。Cookie セッションのクロスサイト POST も 401 |
| 429 | ログイン試行の上限 |
| 400 | body 不正 |
| 404 | 該当なし |
| 503 | `NEWSDIGEST_API_KEY` 未設定（secret 未登録）/ パスワード未設定 |

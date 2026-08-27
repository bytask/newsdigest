# 認証

v0.2 からコンソールは認証付き。**人はパスワードでログイン、機械（ルーティン・Claude Code・claude.ai）はスコープ付き API キー**、という一般的な構成。

```
人間 ──[パスワード]──▶ /login ──▶ Cookie nd_session（HMAC 署名、30 日）──▶ 閲覧 UI / Settings
                                                                   └─ Settings → API キーの発行・失効
機械 ──[Authorization: Bearer nd_…]──▶ /api/*  /mcp
claude.ai コネクタ ──[URL に read 専用の鍵]──▶ /mcp/<key>
```

## 資格情報の種類

| 種類 | 置き場所 | 権限 | 用途 |
|---|---|---|---|
| **UI パスワード** | D1 `meta.ui_password`（PBKDF2-SHA256、60,000 回、salt 付き） | ログイン後は全スコープ | ブラウザで閲覧・Settings |
| **API キー** `nd_<id>_<secret>` | D1 `api_keys`（SHA-256 ハッシュのみ。平文は発行時に 1 回だけ表示） | 鍵ごとのスコープ | ルーティン / Claude Code / claude.ai / スクリプト |
| **ブートストラップ鍵** | Worker secret `NEWSDIGEST_API_KEY` | admin 相当（全スコープ） | `npm run setup` と復旧。日常では使わない |
| **SESSION_SECRET** | Worker secret | — | Cookie の署名。未設定なら `NEWSDIGEST_API_KEY` から派生 |

## スコープ

| scope | 許可 | REST | MCP ツール |
|---|---|---|---|
| `read` | 読む | `GET /api/sources` `/api/policy` `/api/digests[/name]` `/api/raw[/date]` | `list_sources` `get_digest_policy` `list_digests` `get_digest` `list_raw_dates` `get_raw_items` |
| `write` | 成果物を置く | `POST /api/digests` `POST /api/raw` | — |
| `manage` | 設定を変える | `PUT /api/sources` `PUT /api/policy` | `add_source` `update_source` `remove_source` `set_digest_policy` |
| `admin` | 鍵・パスワード | `/api/keys` `PUT /api/auth/password` | —（MCP には載せない） |

`tools/list` は鍵のスコープ外のツールを **返さない**（read 鍵から見ると `add_source` は存在しない）。スコープ不足の `tools/call` は JSON-RPC エラー `-32003`。

`npm run setup` が発行する鍵:

| name | scopes | 渡す先 |
|---|---|---|
| `local` | read, write, manage, admin | `.env.local` の `NEWSDIGEST_API_KEY`（`post.mjs`・Claude Code の MCP 登録） |
| `routine` | read, write | ルーティンのプロンプトに埋め込み（`embed`、既定）または claude.ai の環境変数 `NEWSDIGEST_API_KEY`（`env`）。`.env.local` には `NEWSDIGEST_ROUTINE_API_KEY` として控え |
| `claude-ai` | read | claude.ai カスタムコネクタの URL `https://<worker>/mcp/<key>` |

ルーティンに `manage` を渡さないのは意図的: ルーティンが読む外部コンテンツ（RSS 本文・X 投稿）にプロンプトインジェクションがあっても、ソースマスタや分析方針を書き換えられない。

### ルーティンへの鍵の渡し方

ルーティン API には環境変数を書く手段が無いので、既定（`embed`）では `routine` 鍵をルーティンのプロンプトに埋め込み、ルーティンが起動時に `.env` を作る。鍵は利用者自身の claude.ai アカウント内（ルーティン設定・実行ログ）に残る。`read,write` に限定しているのはこのため。共有アカウントなど「設定に鍵を残せない」場合は `env` モード（利用者が Environment variables に登録）を使う。詳細と切替は [ROUTINE.md](ROUTINE.md)。

## 鍵の管理

- **Settings 画面**（`/settings`、要ログイン）: 一覧（最終使用日時つき）・発行（プリセット: ルーティン用 / Claude Code 用 / claude.ai コネクタ用）・失効・パスワード変更・ログアウト
- **CLI**: `node scripts/post.mjs keys` / `keys:add <name> <scopes> [YYYY-MM-DD]` / `keys:revoke <id>` / `password:set [pw]` / `whoami`（admin スコープの鍵、または `NEWSDIGEST_ADMIN_API_KEY`）
- **REST**: `GET/POST /api/keys`、`DELETE /api/keys/<id>`（[API.md](API.md)）

鍵は削除ではなく失効（`revoked_at`）で、行は残る。失効した鍵は即座に 401 になる（検証のたびに D1 を引く）。

## UI セッション

- `POST /api/auth/login`（フォーム or JSON `{password}`）→ `Set-Cookie: nd_session=<payload>.<HMAC>; HttpOnly; Secure; SameSite=Lax; Max-Age=30日`
- Cookie の検証は HMAC と期限だけ（D1 を引かない）。`middleware.ts` が `/`, `/d/*`, `/raw/*`, `/sources`, `/about`, `/latest` を守る
- Cookie 認証の状態変更リクエスト（`/api/keys` の POST など）は `Sec-Fetch-Site: same-origin` / `Origin` 一致を要求（`SameSite=Lax` に加えた CSRF 対策）
- `POST /api/auth/logout` で Cookie を消す。`GET /api/auth/session` で今の資格情報を確認できる（Bearer でも Cookie でも）
- ログインは IP ごとに **10 回 / 10 分**（D1 `login_attempts`）。超えると 429

## 公開モードに戻す

v0.1 と同じく閲覧 UI を認証なしで公開したい場合は `apps/console/wrangler.jsonc` に:

```jsonc
"vars": { "PUBLIC_UI": "1", ... }
```

`/settings` と `/api/*`・`/mcp` は公開モードでも認証あり。

## 漏洩時の対処

| 漏れたもの | 対処 | 影響範囲 |
|---|---|---|
| API キー 1 本 | Settings または `keys:revoke <id>` で失効 → 必要なら同名で再発行し、使っていた場所を差し替え（`routine` 鍵は `/newsdigest-routine` の rotate） | その鍵のクライアントだけ |
| UI パスワード | Settings の「パスワード」で変更（ローカルから `node scripts/post.mjs password:set` でもリセット可） | ブラウザのみ。既存 Cookie は期限まで有効なので、急ぐなら `SESSION_SECRET` も差し替える |
| `SESSION_SECRET` | `cd apps/console && npx wrangler secret put SESSION_SECRET` | 全ブラウザが再ログイン。API キーは無関係 |
| ブートストラップ鍵 | `npx wrangler secret put NEWSDIGEST_API_KEY` → `.env.local` の `NEWSDIGEST_BOOTSTRAP_KEY` も更新 | なし（日常では未使用） |

## v0.1 からの移行

1. `git pull` → `npm run setup -- --yes`（冪等）。`schema.sql` が `api_keys` / `login_attempts` を追加し、既存の Worker secret `NEWSDIGEST_API_KEY` はブートストラップ鍵としてそのまま使われる
2. セットアップが UI パスワードを設定し、`local` / `routine` / `claude-ai` の鍵を発行して `.env.local` を書き換える
3. claude.ai の環境変数 `NEWSDIGEST_API_KEY` を **routine 鍵**に、Claude Code の MCP 登録を **local 鍵**に差し替える（それまでは旧鍵 = ブートストラップ鍵で動き続けるので、止まらない）
4. 差し替えが終わったらブートストラップ鍵をローテーション（任意）

## Cloudflare Access を前に置く（任意）

組織の SSO（Google / メール OTP）で UI を守りたい場合は、Workers ダッシュボード → Settings → Domains & Routes → `workers.dev` の **Enable Cloudflare Access** を併用できる。機械クライアントは Service Token（`CF-Access-Client-Id/Secret` ヘッダ）が必要になり、claude.ai コネクタはヘッダを送れないので `/mcp/*` を Bypass にする。詳細は [CUSTOMIZE.md](CUSTOMIZE.md)。

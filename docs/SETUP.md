# セットアップガイド

推奨は **Claude Code に任せる**（README のクイックスタート: リポジトリで `claude` → 「セットアップして」→ `/newsdigest-setup`）。このページは、その裏で何が起きているかと、人間が手で同じことをする手順。

## 0. 必要なもの

| 項目 | 用途 | 備考 |
|---|---|---|
| Cloudflare アカウント | コンソール（Workers + D1）のホスト | 無料枠で十分 |
| GitHub アカウント | ルーティンが **あなたの fork** をチェックアウトする | private でよい |
| Claude Pro / Max / Team | Claude Code（ローカル）と Web版ルーティン | 日次 1 回・5〜15 分の実行 |
| Node.js 20+ | セットアップ CLI・ローカル実行 | `node -v` |
| xAI API キー（任意） | X アカウント / X トレンドの収集 | https://console.x.ai — 無ければ RSS / リリースのみ |

## 1. リポジトリを自分の GitHub へ

GitHub 上で **Fork**（または「Use this template」）してから clone。ルーティンは *あなたの* リポジトリを読むので、元リポジトリは使えない。

```bash
git clone https://github.com/<you>/newsdigest.git
cd newsdigest
```

## 2. コンソールをデプロイ

```bash
npm run setup                       # 対話
npm run setup -- --yes --name mydigest --app-name "My Digest" --json   # 非対話（Claude Code はこちら）
```

やること（冪等。何度実行しても安全）:

1. **Cloudflare 認証** — 未認証ならブラウザが開く（`wrangler login`）
2. **Worker 名 / 表示名** — Worker 名が URL になる（`https://<name>.<your-subdomain>.workers.dev`）
3. **D1** — `wrangler d1 create` → `schema.sql`。`apps/console/wrangler.jsonc` に database_id が書き込まれる（秘密ではないので commit してよい）
4. **ブートストラップ鍵と SESSION_SECRET** — ランダム生成して Worker secret `NEWSDIGEST_API_KEY`（admin 相当、セットアップ・復旧専用）と `SESSION_SECRET`（Cookie 署名）に登録
5. **デプロイ** — `opennextjs-cloudflare build && deploy`
6. **ヘルスチェック → パスワード → API キー** — `GET /api/health` が `ok: true` になったら、UI のログインパスワードを設定（`--password` で指定、省略時はランダム生成して **1 回だけ表示**）し、API キーを 3 本発行:

   | name | scopes | 用途 |
   |---|---|---|
   | `local` | read, write, manage, admin | `.env.local` の `NEWSDIGEST_API_KEY`。`post.mjs` と Claude Code の MCP 登録に |
   | `routine` | read, write | claude.ai の環境変数 `NEWSDIGEST_API_KEY` に貼る（`.env.local` には `NEWSDIGEST_ROUTINE_API_KEY`） |
   | `claude-ai` | read | claude.ai カスタムコネクタの URL に |

   `.env.local`（gitignore 済み）に URL・各鍵・ブートストラップ鍵を保存し、MCP 登録コマンドと次の手順を表示

ソースと分析方針は **投入しない**（空のまま）。`--seed sources.json` で一括投入もできる。認証の全体像は [AUTH.md](AUTH.md)。

手動でやる場合は `apps/console/` で `npx wrangler d1 create <name>` → `wrangler.jsonc` 編集 → `npm run db:schema:remote` → `npx wrangler secret put NEWSDIGEST_API_KEY` / `SESSION_SECRET` → `npm run deploy` → ブートストラップ鍵で `node scripts/post.mjs password:set` と `keys:add`。

### 動作確認

```bash
node scripts/post.mjs health     # {"ok":true,"sources_active":0,"policy_configured":false,"password_configured":true,"api_keys_active":3,"ui":"protected",...}
node scripts/post.mjs whoami     # {"authenticated":true,"name":"local","scopes":["read","write","manage","admin"],...}
```

ブラウザで `https://<worker>.workers.dev` を開くとログイン画面。セットアップが表示したパスワードでログインする。鍵の一覧・追加発行・失効・パスワード変更は `/settings`。

## 3. MCP を登録

```bash
claude mcp add --transport http newsdigest https://<worker>/mcp --header "Authorization: Bearer <local 鍵>"
```

以降、Claude Code に「ソース一覧見せて」で `list_sources` が呼ばれる。claude.ai からは `https://<worker>/mcp/<claude-ai 鍵>`（read 専用）をカスタムコネクタに（[docs/MCP.md](MCP.md)）。

## 4. ソースを設定

**ここが一番大事**。出荷時点では空。何を読みたいかを決めて登録する。

- Claude Code に頼む: 「Hacker News の RSS を追加して」「anthropics/claude-code のリリースを監視して」「@foo を X アカウントとして追加」
- または JSON で一括: `sources.template.json` をコピーして編集 → `node scripts/post.mjs sources:put sources.json`

書き方・選び方・例は [docs/SOURCES-AND-POLICY.md](SOURCES-AND-POLICY.md)。目安は 5〜15 ソース。

## 5. 分析方針を設定

「どう要約してほしいか」を Markdown で書いて保存する。**未設定のままだとルーティンはダイジェストを作らない**（既定の観点を勝手に補わない設計）。

- Claude Code に頼む: 「分析方針を作りたい」→ 言語・トピック数・コメントの観点・除外ルールを聞かれる → `set_digest_policy`
- または `policy.md` を書いて `node scripts/post.mjs policy:put policy.md`

雛形と 3 つの例は [docs/SOURCES-AND-POLICY.md](SOURCES-AND-POLICY.md)。

## 6. 任意設定（X 収集・通知）

`.env.local` に追記しておくと、次の手順でルーティンにも一緒に渡される:

```
XAI_API_KEY=xai-...              # X 収集
DIGEST_LANG=ja                   # 分析方針に言語指定が無いときの既定
DIGEST_TZ=Asia/Tokyo
NOTIFY_SLACK_WEBHOOK_URL=...     # 通知（docs/NOTIFICATIONS.md）
```

## 7. push → ルーティン作成（ゼロタッチ）

```bash
git add apps/console/wrangler.jsonc && git commit -m "setup: worker name / d1" && git push
```

Claude Code で:

```
/newsdigest-routine
```

`node scripts/routine.mjs body` が `routine/routine.template.json` と `routine/newsdigest.prompt.md` から作成 body を組み立て、内蔵のルーティン API ツール（`RemoteTrigger`）で日次ルーティンを作成する。既定の **`embed` モード**では `routine` 鍵（read,write）とコンソール URL をプロンプトに埋め込むので、claude.ai 側で環境変数を登録する必要は無い。作成後そのまま初回を手動実行し、ログとコンソールで結果を確認する。

**ネットワーク（1 回だけ）**: claude.ai の環境は既定で egress 制限つきなので、https://claude.ai/code/environments → 環境（Default）→ **Network access** に **自分のコンソールのホスト**（`https://<worker>.workers.dev` のホスト部。`node scripts/routine.mjs hosts` でも出る）を追加するか、「制限なし」にする。RSS はコンソール経由で取れるので、RSS のホストを列挙する必要は無い（[ROUTINE.md](ROUTINE.md)）。

鍵をルーティン設定に残したくない場合は `env` モード: https://claude.ai/code/environments の環境（既定 Default）→ Environment variables に `NEWSDIGEST_API_URL` と `NEWSDIGEST_API_KEY`（= `.env.local` の `NEWSDIGEST_ROUTINE_API_KEY`）を自分で登録し、`/newsdigest-routine` に「環境変数方式で」と伝える。2 方式の比較は [ROUTINE.md](ROUTINE.md)。

手で作る場合は `node scripts/routine.mjs body --env-id <env_...> --redact` の出力を参考に https://claude.ai/code/routines → New routine（リポジトリ = あなたの fork、プロンプト = 出力の `message.content`、毎日 07:15）。

月次棚卸し（任意）は `routine/newsdigest-sources-review.prompt.md` で毎月 1 日のルーティンをもう 1 本（`/newsdigest-routine` に「棚卸しも作って」）。

## 8. 日々の使い方

- **読む**: `https://<worker>.workers.dev`（最新は `/latest`）。パスワードでログイン（30 日有効）。モバイル対応
- **鍵の管理**: `/settings` で発行・失効・パスワード変更。CLI なら `node scripts/post.mjs keys` / `keys:add` / `keys:revoke` / `password:set`
- **ソース・分析方針を変える**: Claude Code / claude.ai に話す（MCP）。次の朝から反映
- **今すぐ 1 回回す**: `/newsdigest-routine` で「今すぐ実行して」、またはローカルで `claude "/newsdigest"`（`.env.local` を読む）
- **失敗したとき**: `/newsdigest-routine` で「最新の実行ログを見せて」→ [docs/ROUTINE.md](ROUTINE.md) の対処表

## 9. 更新の取り込み

fork の "Sync fork" か:

```bash
git remote add upstream https://github.com/bytask/newsdigest.git
git fetch upstream && git merge upstream/main
npm run setup -- --yes     # スキーマ変更や新しい secret があっても冪等に追随する（コンソールだけなら npm run console:deploy でも可）
```

v0.1 → v0.2（認証追加）の移行手順は [AUTH.md](AUTH.md#v01-からの移行)。

スキル・スクリプトの変更はルーティンが次回チェックアウトで拾う。`routine/*.prompt.md` を変えた場合だけ `/newsdigest-routine` で「プロンプトを更新して」。

# NewsDigest — Claude Code 向けリポジトリ指示

このリポジトリは「自分で選んだソースを毎朝 AI が巡回し、日次ダイジェストを自分専用コンソールに蓄積する」ツール一式。
AI 実行（収集・要約・登録・通知）は **このリポジトリをチェックアウトした Claude Code**（Web版ルーティン、またはローカル）がスキルとして行う。

## 初めて開いたとき

利用者が「セットアップして」「始めたい」と言ったら `/newsdigest-setup` を実行する。Cloudflare へのデプロイ → MCP 登録 → ソースと分析方針の聞き取り → ルーティン作成まで、このスキルが順に進める。何を読むか・どう要約するかは **利用者から聞いて設定する**（このリポジトリは既定のソースや観点を持たない）。

## 構成

| 場所 | 役割 |
|---|---|
| `apps/console/` | Cloudflare Workers + D1 のコンソール（UI + REST API + **MCP サーバー `/mcp`**）。AI は呼ばない |
| `.claude/skills/newsdigest-setup/` | 初期セットアップ（Claude Code 主導） |
| `.claude/skills/newsdigest/` | 日次収集・要約・登録・通知の手順（source of truth）。ソース・分析方針の変更依頼もここ |
| `.claude/skills/newsdigest-sources-review/` | 月次ソース棚卸し |
| `.claude/skills/newsdigest-routine/` | ルーティンの作成・更新・実行・デバッグ（ローカルで使う） |
| `routine/` | ルーティンに渡すプロンプトと作成テンプレート |
| `scripts/` | `setup.mjs`（セットアップ CLI）/ `fetch-rss.mjs` / `post.mjs`（API クライアント）/ `notify.sh` |
| `tools/xai-search/search.py` | X 収集（xAI x_search） |
| `docs/` | SETUP / AUTH / SOURCES-AND-POLICY / MCP / ROUTINE / API / NOTIFICATIONS / CUSTOMIZE / ARCHITECTURE |

## 実行環境の前提

- 環境変数 `NEWSDIGEST_API_URL` / `NEWSDIGEST_API_KEY` が必須。ルーティンでは claude.ai の環境設定から、ローカルでは `.env` / `.env.local` から供給される（`scripts/*.mjs` と `notify.sh` は `.env.local` → `.env` の順に自動で読む）
- API キーはスコープ付き（`read / write / manage / admin`、`docs/AUTH.md`）。ルーティンは `read,write` の `routine` 鍵、ローカルは全スコープの `local` 鍵。403 が出たら鍵のスコープ不足なので、Settings（`/settings`）か `node scripts/post.mjs keys:add` で適切な鍵を発行する
- 閲覧 UI はパスワードログイン。パスワードは `npm run setup` が 1 回だけ表示する。忘れたら `node scripts/post.mjs password:set`
- ソースと分析方針はコンソール（D1）にある。MCP `newsdigest` が登録されていればそれで読み書きし、無ければ `scripts/post.mjs`（`sources` / `policy`）で読み書きする
- `XAI_API_KEY` が無ければ X 系ソースをスキップして続行する（エラーにしない）
- 通知先が未設定なら通知をスキップして続行する（エラーにしない）

## 守ること

- **分析方針が未設定、または active ソースが 0 件ならダイジェストを作らない**。既定の関心領域や観点を勝手に補わず、利用者に設定を促す
- **書き込み系 API（POST /api/digests, /api/raw, PUT /api/sources, PUT /api/policy）にダミーデータを送らない**。疎通確認は `GET /api/health`（認証不要）で行う
- 通知は手順に明記された回数・内容のみ送る。「動作確認」目的の送信はしない（`NOTIFY_DRY_RUN=1` を使う）
- 分析方針に「共有チャネルに流れる」旨があれば、利用者固有の非公開情報をダイジェストに書かない
- リポジトリへの commit/push は `DIGEST_COMMIT_LOGS=1` のときだけ、`digests/` 配下のみ（セットアップ時の `wrangler.jsonc` 変更は除く）
- `.env.local` / `.mcp.json` にはキーが入る。commit しない（gitignore 済み）
- API キーや UI パスワードをチャットや Issue に貼らない。`setup --json` の出力から必要な箇所だけ引用し、パスワードは利用者に 1 回伝えるだけにする

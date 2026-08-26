# Intel Digest — Claude Code 向けリポジトリ指示

このリポジトリは「自分で選んだソースを毎朝 AI が巡回し、日次ダイジェストを自分専用コンソールに蓄積する」ツール一式。
AI 実行（収集・要約・登録・通知）は **このリポジトリをチェックアウトした Claude Code**（Web版ルーティン、またはローカル）がスキルとして行う。

## 構成

| 場所 | 役割 |
|---|---|
| `apps/console/` | Cloudflare Workers + D1 のコンソール（UI + REST API）。AI は呼ばない |
| `.claude/skills/intel-digest/` | 日次収集・要約・登録・通知の手順（source of truth） |
| `.claude/skills/intel-sources-review/` | 月次ソース棚卸し |
| `.claude/skills/intel-digest-routine/` | ルーティンの作成・更新・実行・デバッグ（ローカルで使う） |
| `routine/` | ルーティンに渡すプロンプトと作成テンプレート |
| `scripts/` | `setup.mjs`（セットアップ CLI）/ `fetch-rss.mjs` / `post.mjs`（API クライアント）/ `notify.sh` |
| `tools/xai-search/search.py` | X 収集（xAI x_search） |

## 実行環境の前提

- 環境変数 `INTEL_API_URL` / `INTEL_API_KEY` が必須。ルーティンでは claude.ai の環境設定から、ローカルでは `.env` / `.env.local` から供給される（`scripts/*.mjs` と `notify.sh` は `.env.local` → `.env` の順に自動で読む）
- `XAI_API_KEY` が無ければ X 系ソースをスキップして続行する（エラーにしない）
- 通知先が未設定なら通知をスキップして続行する（エラーにしない）

## 守ること

- **書き込み系 API（POST /api/digests, /api/raw, PUT /api/sources）にダミーデータを送らない**。疎通確認は `GET /api/health`（認証不要）か `GET /api/sources` で行う
- 通知は手順に明記された回数・内容のみ送る。「動作確認」目的の送信はしない（`NOTIFY_DRY_RUN=1` を使う）
- ダイジェストには利用者固有の非公開情報（社名・内部URL・数値目標など）を書かない前提で要約する（通知先が共有チャネルでも安全なように）
- リポジトリへの commit/push は `DIGEST_COMMIT_LOGS=1` のときだけ、`digests/` 配下のみ

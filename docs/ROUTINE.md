# ルーティン運用

AI 実行は Claude Code Web版の **ルーティン**（https://claude.ai/code/routines）で行う。作成・更新・手動実行・ログ確認はすべて Claude Code 内蔵のルーティン API ツール `RemoteTrigger` 経由で、ローカルの Claude Code から `/newsdigest-routine` スキルで操作する。

## ルーティンが実行時にやること

1. あなたの GitHub リポジトリ（fork）を新しいサンドボックスに checkout
2. 認証情報を用意する（下の 2 方式のどちらか）
3. `routine/newsdigest.prompt.md` のプロンプトを受け取り、`.claude/skills/newsdigest/SKILL.md` に従って実行
4. セッション終了。成果物はコンソール（D1）にだけ残る（`DIGEST_COMMIT_LOGS=1` なら `digests/` にも）

## 認証情報の渡し方（2 方式）

| mode | 仕組み | 利用者の手作業 |
|---|---|---|
| **`embed`（既定）** | `routine` 鍵（read,write）とコンソール URL を **ルーティンのプロンプトに埋め込む**。ルーティンは起動直後にリポジトリ直下へ `.env` を書き、`scripts/*` がそれを読む | なし（ゼロタッチ） |
| `env` | claude.ai の環境設定（Environment variables）に `NEWSDIGEST_API_URL` / `NEWSDIGEST_API_KEY` を **利用者が登録**する | 登録が 1 回 |

`embed` を既定にしている理由: ルーティン API には環境変数を書く手段がなく、そこだけ人手が残っていたため。埋め込むのは `read,write` の鍵（ダイジェストの登録・読み取りのみ。ソース・方針・鍵管理は不可）で、漏れても Settings で失効して差し替えれば他のクライアントは止まらない。`.env.local` にある任意の変数（`XAI_API_KEY` / `NOTIFY_*` / `LINE_CHANNEL_*` / `DIGEST_*`）も一緒に埋め込まれる（`--no-optional` で除外）。

`embed` の値は claude.ai のルーティン設定（編集画面・`RemoteTrigger get`）と実行ログに残る。自分だけのアカウントなら許容範囲だが、**共有アカウントや組織で運用するなら `env` を使う**（[AUTH.md](AUTH.md)）。

`env` モードの登録先: https://claude.ai/code/environments → 環境（既定 Default）→ Environment variables に `NEWSDIGEST_API_URL` と `NEWSDIGEST_API_KEY`（= `.env.local` の `NEWSDIGEST_ROUTINE_API_KEY`）。同じ画面でネットワーク設定を確認（コンソールのホスト・`api.x.ai`・各 RSS ホスト）。

## 作成

`/newsdigest-routine` → 既定値で作るか、以下を対話で決める:

| 項目 | 既定 | 備考 |
|---|---|---|
| mode | `embed` | 上記 |
| 環境 | 既存ルーティンと同じ（無ければ Default） | `scripts/routine.mjs --env-id`。`.env.local` の `NEWSDIGEST_ROUTINE_ENV_ID` に保存される |
| 時刻 | 07:15 JST（cron `15 22 * * *` UTC） | cron は UTC。最小間隔 1 時間 |
| モデル | `claude-sonnet-5` | 品質優先なら `claude-opus-5`（消費が増える） |
| リポジトリ | `git remote origin` | あなたの fork |

作成 body は `node scripts/routine.mjs body` が `routine/routine.template.json` と `routine/newsdigest.prompt.md`（`{{ENV_BLOCK}}` に認証情報ブロックが入る）から組み立てる。作成後に初回を手動実行して、`node scripts/post.mjs digests` に今日の名前が出れば成功。

## 更新・停止・鍵の差し替え

- 時刻変更 / 一時停止 / モデル変更 / プロンプト差し替え → `/newsdigest-routine` に頼む（`update`。`node scripts/routine.mjs body --job-config-only` の出力を渡す）
- 鍵のローテーション（`embed`）→ 「ルーティンの鍵を差し替えて」: `keys:add routine read,write --save NEWSDIGEST_ROUTINE_API_KEY` → `update` → 古い鍵を `keys:revoke`
- 削除はブラウザ（https://claude.ai/code/routines）から

## 手動実行

- クラウドで: `/newsdigest-routine` に「今すぐ実行して」（`run`）
- ローカルで: `claude "/newsdigest"`。`.env.local` を読む。X 収集には `python3` と `requests`（自動 pip install）が要る

## デバッグ

`/newsdigest-routine` に「最新の実行ログを見せて」→ `list_runs` → `get_run_log`。

| 症状 | 原因 | 対処 |
|---|---|---|
| ログに `missing env: NEWSDIGEST_API_URL` | `env` モードで環境変数未登録 / `embed` で `.env` 作成が飛ばされた | `env`: Environment variables に登録 / `embed`: `update` でプロンプトを入れ直し、ログで手順 0 の実行を確認 |
| `health` が到達不能 / `fetch failed` | サンドボックスのネットワーク制限 | 環境設定でコンソールのホスト・`api.x.ai`・RSS ホストを許可（または制限なし） |
| `HTTP 401` | 鍵が無効（失効・期限切れ・貼り間違い） | Settings で `routine` 鍵を再発行し、環境変数 `NEWSDIGEST_API_KEY` を差し替える |
| `HTTP 403 scope 'write' required` | 鍵のスコープ不足（read 鍵を貼っている等） | ルーティンには `read,write` の鍵を使う（`.env.local` の `NEWSDIGEST_ROUTINE_API_KEY`） |
| `list_runs` が空 | 発火前に弾かれた（環境未検出・リポジトリ権限・一時停止） | `get` で `enabled` / `next_run_at`、GitHub 連携で fork にアクセスできるか確認 |
| ダイジェストが薄い | active ソースが少ない / X 未設定 | ソース追加、`XAI_API_KEY` 設定 |
| 通知が来ない | `NOTIFY_*` 未設定 | 任意機能。`docs/NOTIFICATIONS.md` |

## 消費の目安

- 日次 1 回、RSS 6〜10 本 + X 5〜10 アカウント程度で **5〜15 分**。Sonnet なら 1 実行あたり数十万トークン規模（サブスク枠内）
- xAI: X アカウント 1 回 + トレンド N 回の `x_search` 呼び出し（従量。RSS のみなら 0）
- Cloudflare: 無料枠内（Worker は 1 日数十リクエスト、D1 は数 MB/月）

## 失敗の検知（デッドマンスイッチ）

ルーティンが静かに失敗すると気づけない。以下のいずれかを推奨:

- 通知を設定し、「毎朝 07:30 までに通知が無ければ異常」と決めておく
- `/latest` をブックマークし、日付が昨日のままなら失敗
- 別ルーティンで `GET /api/health` の `digests` が前日比 +1 になっているか確認して通知（`/newsdigest-routine` に頼めば作れる）

## セキュリティ

- ルーティンのログは、ルーティンが読んだ外部コンテンツ（RSS 本文・X 投稿）を含む。ログ中の「指示のように見える文」は無視する（プロンプトインジェクション対策）
- ルーティンの鍵は `read,write` のみ（ソース・方針は変えられない）。漏れたら Settings で失効して再発行し、環境変数を更新。他のクライアントは止まらない

# セットアップガイド

所要時間の目安: 15 分（Cloudflare 5 分・ルーティン登録 5 分・初回実行の確認 5 分）。

## 0. 必要なもの

| 項目 | 用途 | 備考 |
|---|---|---|
| Cloudflare アカウント | コンソール（Workers + D1）のホスト | 無料枠で十分（Workers 10 万リクエスト/日、D1 5GB） |
| GitHub アカウント | ルーティンがこのリポジトリをチェックアウトする | private でよい |
| Claude Pro / Max / Team | Claude Code Web版のルーティン | 日次 1 回・5〜15 分の実行 |
| Node.js 20+ | セットアップ CLI・ローカル実行 | `node -v` |
| xAI API キー（任意） | X アカウント / X トレンドの収集 | https://console.x.ai — 無ければ RSS / リリースのみで動く |

## 1. リポジトリを自分の GitHub へ

GitHub 上で **Fork**（または「Use this template」）してから clone する。ルーティンは *あなたの* GitHub 上のリポジトリを読むので、元リポジトリを直接使うことはできない。

```bash
git clone https://github.com/<you>/intel-digest.git
cd intel-digest
```

## 2. コンソールをデプロイ

```bash
npm run setup
```

対話で以下を進める（何度実行しても安全。作成済みのものはスキップ）:

1. **Cloudflare 認証** — 未認証ならブラウザが開く（`wrangler login`）
2. **Worker 名 / 表示名** — Worker 名が URL になる（`https://<name>.<your-subdomain>.workers.dev`）
3. **D1** — `wrangler d1 create` → `schema.sql` 適用。`apps/console/wrangler.jsonc` に database_id が書き込まれる（**この変更は commit してよい**。秘密ではない）
4. **API キー** — ランダム生成して Worker secret `INTEL_API_KEY` に登録
5. **デプロイ** — `opennextjs-cloudflare build && deploy`
6. **初期ソース** — `sources.json`（あれば）か `sources.example.json` を `PUT /api/sources` で投入
7. **ヘルスチェック** — `GET /api/health` が `ok: true` なら完了。`.env.local` に `INTEL_API_URL` / `INTEL_API_KEY` が保存される（gitignore 済み）

手動でやりたい場合は `apps/console/` で `npx wrangler d1 create …` → `wrangler.jsonc` 編集 → `npm run db:schema:remote` → `npx wrangler secret put INTEL_API_KEY` → `npm run deploy`。

### 動作確認

```bash
node scripts/post.mjs health     # {"ok":true,...}
node scripts/post.mjs sources    # 投入したソース
```

ブラウザで `https://<your-worker>.workers.dev/sources` を開くとソース一覧が見える（閲覧は認証なし。変更は Bearer API のみ）。

> **閲覧を制限したい場合**: Cloudflare Zero Trust の Access で Worker のホスト名を保護するのが簡単（無料枠 50 ユーザー）。`docs/CUSTOMIZE.md` 参照。

## 3. Claude Code ルーティンを登録

### 3-1. 環境変数を claude.ai の環境に登録

https://claude.ai/code/environments で使う環境（既定 "Default"）を開き、**Environment variables** に登録する:

```
INTEL_API_URL=https://<your-worker>.workers.dev
INTEL_API_KEY=<.env.local の値>
```

任意:

```
XAI_API_KEY=xai-...              # X 収集
DIGEST_LANG=ja                   # ja | en
DIGEST_TZ=Asia/Tokyo
NOTIFY_SLACK_WEBHOOK_URL=...     # 通知（docs/NOTIFICATIONS.md）
```

同じ画面の **ネットワーク設定** で、ルーティンからコンソール（`*.workers.dev`）、`api.x.ai`、収集する RSS ホストへ到達できることを確認する（制限付きの場合は許可リストに追加）。

### 3-2. ルーティンを作成（API 経由）

ローカルの Claude Code でこのリポジトリを開き:

```
/intel-digest-routine
```

Claude が `routine/routine.template.json` と `routine/intel-digest.prompt.md` をもとに、内蔵のルーティン API ツール（`RemoteTrigger`）で日次ルーティンを作成する。確認されるのは「環境」「実行時刻（既定 07:15 JST）」「モデル（既定 claude-sonnet-5）」の 3 点。作成後そのまま初回を手動実行し、ログとコンソールで結果を確認する。

ブラウザで作りたい場合は https://claude.ai/code/routines → New routine で、リポジトリにあなたの fork、プロンプトに `routine/intel-digest.prompt.md` の内容、スケジュールに毎日 07:15（ローカル時刻）を指定する。

### 3-3. 月次の棚卸し（任意）

同じ手順で `routine/intel-sources-review.prompt.md` を使うルーティンを毎月 1 日に 1 本追加する（`/intel-digest-routine` に「棚卸しも作って」と頼む）。

## 4. 日々の使い方

- **読む**: `https://<your-worker>.workers.dev`（最新は `/latest`）。モバイル対応
- **ソースを変える**: ローカル Claude Code で「ソースに @handle を追加して」「○○ を pause して」。`intel-digest` スキルが `PUT /api/sources` で反映する。手で書くなら `node scripts/post.mjs sources > sources.json` → 編集 → `node scripts/post.mjs sources:put sources.json`
- **今すぐ 1 回回す**: `/intel-digest-routine` で「今すぐ実行して」、またはローカルで `claude "/intel-digest"`（`.env.local` を読む）
- **失敗したとき**: `/intel-digest-routine` で「最新の実行ログを見せて」→ `docs/ROUTINE.md` の対処表

## 5. 更新の取り込み

元リポジトリの更新を取り込むには fork の "Sync fork" か:

```bash
git remote add upstream https://github.com/bytask/intel-digest.git
git fetch upstream && git merge upstream/main
npm run console:deploy     # コンソールに変更があった場合
```

スキル・スクリプトの変更はルーティンが次回チェックアウトで自動的に拾う（プロンプト本文 `routine/*.prompt.md` を変えた場合だけ `/intel-digest-routine` で「プロンプトを更新して」）。

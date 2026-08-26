---
name: newsdigest-setup
description: NewsDigest の初期セットアップを Claude Code が代行するスキル。Cloudflare へのコンソールデプロイ（npm run setup）→ MCP 登録 → 利用者への聞き取りでソースと分析方針を設定 → claude.ai 環境変数の案内 → ルーティン作成（/newsdigest-routine）まで。「セットアップして」「初期設定」「newsdigest を始めたい」「インストール」で起動。
---

# NewsDigest セットアップ（Claude Code 主導）

利用者はこのリポジトリを fork/clone して Claude Code を開いただけの状態。ここから **動く状態（明日の朝にダイジェストが届く）** まで持っていく。手を動かすのは Claude、判断（何を読みたいか・どう要約してほしいか）は利用者。

進め方の原則:
- 各フェーズの冒頭で「これから何をするか・利用者に何を聞くか」を 1〜2 行で伝える
- ブラウザ操作が必要な箇所（Cloudflare ログイン、claude.ai 環境変数、GitHub push）は **利用者に依頼して待つ**。代行しようとしない
- 秘密（API キー）はチャットに繰り返し貼らない。`.env.local` と `setup --json` の出力から必要な箇所だけ引用する

## Phase 1: 前提確認

```bash
node -v            # 20+
git remote get-url origin   # 利用者の fork（github.com/<you>/newsdigest）であること
ls .env.local 2>/dev/null && echo "setup済みの可能性"
```

- Node 20 未満 → インストールを依頼して終了
- origin が無い / 元リポジトリ（bytask/newsdigest）を指している → 「自分の GitHub に fork（または Use this template）して、その URL を origin にしてください」と依頼。ルーティンは利用者自身のリポジトリを checkout するため必須
- `.env.local` があれば「再セットアップ」として扱い、Phase 2 は `npm run setup -- --yes` で冪等に流す

## Phase 2: コンソールをデプロイ

1. 利用者に **Worker 名**（URL の一部、既定 `newsdigest`）と **表示名**（既定 `NewsDigest`）を確認する（AskUserQuestion）
2. Cloudflare 認証: `cd apps/console && npx wrangler whoami`。未認証なら利用者に `! cd apps/console && npx wrangler login` を実行してもらう（ブラウザが開く）。CI 的に進めたい場合は `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を環境変数に
3. 実行（非対話）:
   ```bash
   npm run setup -- --yes --name <worker> --app-name "<表示名>" --json 2>&1 | tee .work/setup.log
   ```
   最後の行の JSON（`url` / `api_key` / `mcp_add_command`）を控える。失敗したらログの `✖` 行を読み、対処して再実行（冪等）
4. `node scripts/post.mjs health` が `ok: true` になったことを確認

## Phase 3: MCP を登録

Phase 2 の `mcp_add_command` をそのまま実行する:

```bash
claude mcp add --transport http newsdigest <url>/mcp --header "Authorization: Bearer <key>"
```

登録後、`ToolSearch` で `mcp__newsdigest__list_sources` を読み込み、呼べることを確認する（0 件で正常）。MCP が使えない環境（ツールが見つからない）なら、以降の設定は `scripts/post.mjs`（`sources:put` / `policy:put`）で代替する。

## Phase 4: ソースを設定（聞き取り → 登録）

利用者に聞く（AskUserQuestion、複数回に分けてよい）:

1. **関心領域**（例: 生成 AI の基盤モデル、Cloudflare/エッジ、自分の業界ニュース、特定 OSS の更新）
2. **よく読む媒体・人**（サイト名・ブログ・X アカウント・GitHub リポジトリ）。「思いつかない」と言われたら、関心領域から候補を WebSearch で 5〜8 件探して提示し、選んでもらう
3. X 収集を使うか（xAI API キーの有無）。無ければ `x_account` / `x_trend` は登録しない

登録: MCP `add_source` を 1 件ずつ呼ぶ（`note` に「なぜ・何を期待するか」を必ず入れる — 月次棚卸しの判断材料になる）。RSS は登録前に `node scripts/fetch-rss.mjs <url>` で実在と取得可否を確認する。サイトの RSS URL が不明なら WebFetch でトップページの `<link rel="alternate" type="application/rss+xml">` を探す。GitHub リポジトリは `release` として `owner/name` で登録。

最後に `list_sources` で一覧を見せて確認を取る。目安は合計 5〜15 ソース（多すぎると要約が薄くなる）。

## Phase 5: 分析方針を設定

利用者に聞く:

1. ダイジェストの **言語**（ja / en）
2. **トピック数**（既定 5〜8）
3. **コメントの観点** — 「各トピックについて何を書いてほしいか」（例: 自分の事業への示唆 / 技術的な意味 / 投資判断への影響 / 一般読者向けの背景）
4. **含めない・減らしたいもの**（例: 資金調達ニュースは不要、日本語ソースを優先、政治は除外）
5. 通知先が共有チャネルか（共有なら固有の非公開情報を書かない旨を方針に含める）

`docs/SOURCES-AND-POLICY.md` の雛形に沿って Markdown を書き、利用者に見せて確認後、MCP `set_digest_policy` で保存する。**利用者の回答なしに既定の方針を勝手に入れない**（空のままルーティンを作ると、ルーティンは「方針未設定」で止まる設計）。

## Phase 6: ルーティン用の環境変数（利用者作業）

利用者に依頼して待つ:

> https://claude.ai/code/environments で使う環境（既定 Default）を開き、Environment variables に以下を追加してください:
> - `NEWSDIGEST_API_URL` = `<url>`
> - `NEWSDIGEST_API_KEY` = `.env.local` の値
> - （任意）`XAI_API_KEY`、`NOTIFY_SLACK_WEBHOOK_URL` など（`.env.example` 参照）
>
> 同じ画面でネットワーク設定を確認し、`<url のホスト>`・`api.x.ai`・登録した RSS のホストへ到達できるようにしてください。

通知を使うなら `docs/NOTIFICATIONS.md` に沿って Webhook を用意してもらい、同じ画面に登録する。

## Phase 7: GitHub に push → ルーティン作成

1. `git status` で変更（`apps/console/wrangler.jsonc` の name / database_id）を確認し、commit → push（`.env.local` は gitignore 済みであることを `git status` で再確認）
2. `/newsdigest-routine` を実行（このスキルの続きとして同じセッションで進めてよい）。作成後に初回を手動実行し、`node scripts/post.mjs digests` に今日の名前が出るまで確認する
3. 完了報告: コンソール URL、`/latest`、次回実行時刻、MCP の使い方（「ソースに ○○ を追加して」「今日のダイジェスト見せて」）を利用者に伝える

## トラブル時

`docs/ROUTINE.md` の対処表を参照。セットアップ CLI は冪等なので、何度でも `npm run setup -- --yes` で復旧できる。

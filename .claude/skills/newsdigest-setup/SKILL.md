---
name: newsdigest-setup
description: NewsDigest の初期セットアップを Claude Code が代行するスキル。Cloudflare へのコンソールデプロイ（npm run setup）→ MCP 登録 → 利用者への聞き取りでソースと分析方針を設定 → claude.ai 環境変数の案内 → ルーティン作成（/newsdigest-routine）まで。「セットアップして」「初期設定」「newsdigest を始めたい」「インストール」で起動。
---

# NewsDigest セットアップ（Claude Code 主導）

利用者はこのリポジトリを fork/clone して Claude Code を開いただけの状態。ここから **動く状態（明日の朝にダイジェストが届く）** まで持っていく。手を動かすのは Claude、判断（何を読みたいか・どう要約してほしいか）は利用者。

進め方の原則:
- 各フェーズの冒頭で「これから何をするか・利用者に何を聞くか」を 1〜2 行で伝える
- 利用者の手作業は **Cloudflare ログイン（`wrangler login`、初回 1 回）** と、claude.ai の環境設定で **コンソールのホストを 1 つ許可する（初回 1 回）** の 2 つだけにする。GitHub の fork / push は `gh` で代行し、ルーティンの認証情報はプロンプトに埋め込む（`embed` モード）。ブラウザ操作が避けられない箇所は利用者に依頼して待つ（代行しようとしない）
- 秘密（API キー）はチャットに繰り返し貼らない。`.env.local` と `setup --json` の出力から必要な箇所だけ引用する

## Phase 1: 前提確認

```bash
node -v            # 20+
git remote get-url origin   # 利用者の fork（github.com/<you>/newsdigest）であること
ls .env.local 2>/dev/null && echo "setup済みの可能性"
```

- Node 20 未満 → インストールを依頼して終了
- origin が無い / 元リポジトリ（bytask/newsdigest）を指している → ルーティンは利用者自身のリポジトリを checkout するため fork が必須。`gh auth status` が通るなら代行する:
  ```bash
  gh repo fork bytask/newsdigest --remote=true --default-branch-only   # origin=fork, upstream=元リポジトリ に付け替わる
  git remote get-url origin
  ```
  `gh` が無い / 未認証なら「自分の GitHub に fork（または Use this template）して、その URL を origin にしてください」と依頼して待つ
- `.env.local` があれば「再セットアップ」として扱い、Phase 2 は `npm run setup -- --yes` で冪等に流す

## Phase 2: コンソールをデプロイ

1. 利用者に **Worker 名**（URL の一部、既定 `newsdigest`）と **表示名**（既定 `NewsDigest`）を確認する（AskUserQuestion）
2. Cloudflare 認証: `cd apps/console && npx wrangler whoami`。未認証なら利用者に `! cd apps/console && npx wrangler login` を実行してもらう（ブラウザが開く）。CI 的に進めたい場合は `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を環境変数に
3. 実行（非対話）:
   ```bash
   npm run setup -- --yes --name <worker> --app-name "<表示名>" --json 2>&1 | tee .work/setup.log
   ```
   最後の行の JSON を控える: `url` / `ui_password`（初回のみ。設定済みなら null）/ `api_key`（local 鍵 = read,write,manage,admin）/ `routine_api_key`（read,write）/ `connector_url`（claude.ai 用、read）/ `mcp_add_command` / `settings_url`。失敗したらログの `✖` 行を読み、対処して再実行（冪等）
4. `node scripts/post.mjs health` が `ok: true`、`node scripts/post.mjs whoami` が `local` 鍵を返すことを確認
5. **`ui_password` が非 null なら、利用者にコンソール URL と一緒に 1 回だけ伝える**（「Settings 画面で変更できます」「忘れたら `node scripts/post.mjs password:set`」を添える）。チャットに繰り返し貼らない

## Phase 3: MCP を登録

Phase 2 の `mcp_add_command` をそのまま実行する:

```bash
claude mcp add --transport http newsdigest <url>/mcp --header "Authorization: Bearer <local 鍵>"
```

登録後、`ToolSearch` で `mcp__newsdigest__list_sources` を読み込み、呼べることを確認する（0 件で正常）。MCP が使えない環境（ツールが見つからない）なら、以降の設定は `scripts/post.mjs`（`sources:put` / `policy:put`）で代替する。

claude.ai（Web / モバイル）からも使いたいと言われたら `connector_url`（read 専用の鍵入り URL）をカスタムコネクタに登録するよう案内する。

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

## Phase 6: ネットワーク許可（利用者作業・1 回）と任意設定

ルーティンの認証情報は Phase 7 でプロンプトに埋め込む（`embed` モード）ので環境変数の登録は不要。ただし claude.ai の環境は既定で egress 制限つきなので、**コンソールのホストだけ**許可してもらう。`node scripts/routine.mjs hosts` の出力を添えて依頼し、待つ:

> https://claude.ai/code/environments で使う環境（既定 Default）を開き、**Network access** に `<コンソールのホスト>` を追加してください（または「制限なし」にしてください）。RSS のホストは不要です（コンソール経由で取得します）。

すでに「制限なし」なら不要。確認が取れなくても Phase 7 は進めてよく、初回実行のログが `Host not in allowlist` ならここに戻る。

任意機能の確認:

1. X（xAI）を使うなら `XAI_API_KEY` を `.env.local` に追記してもらう（Phase 4 で聞いていれば済んでいる）
2. 通知が欲しいなら `docs/NOTIFICATIONS.md` に沿って Webhook を用意してもらい、`NOTIFY_SLACK_WEBHOOK_URL` 等を `.env.local` に追記する
3. `.env.local` にあるこれらの値は Phase 7 でルーティンに一緒に埋め込まれる旨を伝える。**「鍵をルーティン設定に残したくない」と言われたら** `env` モード（利用者が claude.ai の Environment variables に登録する。手順は `docs/ROUTINE.md`）に切り替える

## Phase 7: GitHub に push → ルーティン作成（ゼロタッチ）

1. `git status` で変更（`apps/console/wrangler.jsonc` の name / database_id）を確認し、commit → push（`.env.local` は gitignore 済みであることを `git status` で再確認）
2. `/newsdigest-routine` を実行（このスキルの続きとして同じセッションで進めてよい）。既定の `embed` モードで `node scripts/routine.mjs body --env-id <環境 ID>` → `RemoteTrigger create` → 初回を `run` → `list_runs` / `get_run_log` → `node scripts/post.mjs digests` に今日の名前が出るまで確認する。環境 ID は `RemoteTrigger list` の既存ルーティンから拾い、無ければ `/schedule` の一覧から "Default" を選ぶ。初回ログが `Host not in allowlist` なら Phase 6 のネットワーク許可を依頼し、追加後に `run` で再実行する
3. 完了報告: コンソール URL（ログインはセットアップ時に伝えたパスワード）、`/latest`、`/settings`（鍵の管理）、ルーティンの URL と次回実行時刻、MCP の使い方（「ソースに ○○ を追加して」「今日のダイジェスト見せて」）を利用者に伝える。鍵はチャットに貼らない

## トラブル時

`docs/ROUTINE.md` の対処表を参照。セットアップ CLI は冪等なので、何度でも `npm run setup -- --yes` で復旧できる。

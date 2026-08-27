# NewsDigest

> 自分で選んだソース（RSS・GitHub リリース・X アカウント・X トレンド）を毎朝 AI が巡回し、
> 自分で決めた分析方針で要約した日次ダイジェストを、自分専用のコンソールに蓄積する。
> **サーバー常駐なし・月額 0 円**（Cloudflare 無料枠）。AI 実行は **あなたの Claude Code（Web版）のルーティン**。
> セットアップは **Claude Code に「セットアップして」と言うだけ**。

```
[あなたの Claude Code ルーティン（毎朝・クラウド実行）]
   │  この fork を checkout → .claude/skills/newsdigest を実行
   │  RSS / releases.atom / X を収集 → あなたの分析方針で要約 → Mermaid 図解
   ▼  Bearer API
[コンソール  Cloudflare Workers + D1（あなたのアカウント）]
   │  ソースマスタ・分析方針・ダイジェスト・生データの source of truth、閲覧 UI
   │  MCP サーバー内蔵（/mcp）← Claude Code / claude.ai から「ソース追加」「ダイジェスト見せて」
   ▼  任意
[通知  Slack / Discord / LINE 公式アカウント / 任意の Webhook]
```

**v0.2.0 ・ AGPL-3.0 ・ TypeScript / Next.js 15 (OpenNext) / Cloudflare Workers + D1 / Claude Code skills**

---

## 特徴

| | ニュースアプリ / RSS リーダー | 有料 AI ニュースレター | **NewsDigest** |
|---|---|---|---|
| ソース | 提供側が決める | 提供側が決める | **自分で決める**（RSS / OSS リリース / X） |
| 要約の観点 | なし or 定型 | 汎用 | **自分で書いた分析方針**に従う |
| 図解 | ❌ | ❌ | ✅ Mermaid（当日の全体像） |
| 生データ | ❌ | ❌ | ✅ 要約前の全アイテムを保存・閲覧・MCP で検索 |
| ソース棚卸し | ❌ | ❌ | ✅ 月次で低寄与ソースの pause / 入替を提案 |
| AI との連携 | ❌ | ❌ | **MCP サーバー内蔵**。Claude Code / claude.ai から操作 |
| 認証 | アカウント | アカウント | **パスワード + スコープ付き API キー**（Settings で発行・失効） |
| 実行基盤 | — | — | **Claude Code ルーティン**（サーバー不要） |
| 月額 | 0〜 | 数千円〜 | **0 円**（Claude サブスク＋任意の xAI 従量） |
| ソースコード | 非公開 | 非公開 | **AGPL-3.0（このリポ）** |

出荷時点では **ソースも分析方針も空**。何を読み、どう要約するかは、セットアップ時に Claude Code が聞いて設定する。

---

## クイックスタート（約 15 分）

### 必要なもの

- Cloudflare アカウント（無料枠で OK）
- GitHub アカウント（このリポジトリを fork する）
- Claude Pro / Max / Team（Claude Code と Web版ルーティン）
- Node.js 20+
- （任意）xAI API キー — X を収集する場合。RSS / リリースだけなら不要

### 手順

```bash
# 1. GitHub で Fork（または Use this template）→ clone
git clone https://github.com/<you>/newsdigest.git
cd newsdigest

# 2. Claude Code を開く
claude
```

```
> セットアップして
```

あとは `/newsdigest-setup` スキルが進める:

1. **コンソールをデプロイ** — `npm run setup` を非対話で実行（Cloudflare 認証 → D1 作成 → スキーマ → デプロイ → ログインパスワード設定 → API キー 3 本発行）。ブラウザ操作が要るのは Cloudflare ログインだけ。パスワードはここで 1 回だけ表示される
2. **MCP を登録** — `claude mcp add … newsdigest https://<worker>/mcp`（local 鍵）
3. **ソースを設定** — 「何に関心があるか」「よく読む媒体は」を聞き、候補を探して MCP `add_source` で登録
4. **分析方針を設定** — 言語・トピック数・コメントの観点・除外ルールを聞いて Markdown にし、MCP `set_digest_policy` で保存
5. **claude.ai の環境変数**を案内（`NEWSDIGEST_API_URL` / `NEWSDIGEST_API_KEY` = routine 鍵。ここだけ利用者作業）
6. **ルーティン作成** — `/newsdigest-routine` がルーティン API（`RemoteTrigger`）で日次ルーティン（既定 07:15 JST）を作り、初回を手動実行して結果を確認

翌朝から `https://<your-worker>.workers.dev/latest` にダイジェストが並ぶ（閲覧はパスワードでログイン）。

人間が手でやる手順は [docs/SETUP.md](docs/SETUP.md)。

---

## 日々の使い方

Claude Code（MCP 経由）に話すだけ:

> 「ソースに Hacker News の RSS を追加して」「@foo を pause して」
> 「コメントの観点を "自分の事業への示唆" に変えて」
> 「今日のダイジェスト見せて」「昨日の生データで Cloudflare に触れてるものは？」
> 「ルーティンを 8 時にして」「最新の実行ログ見せて」

claude.ai（Web / モバイル）からはカスタムコネクタ `https://<worker>/mcp/<read 専用の鍵>` で閲覧・検索ができる。詳細: [docs/MCP.md](docs/MCP.md)

鍵の追加発行・失効・パスワード変更はコンソールの **Settings**（`/settings`）から。

---

## 主要機能

### 収集
- **RSS / Atom** — 任意のフィード（`scripts/fetch-rss.mjs`、依存ゼロ）
- **OSS リリース** — GitHub `releases.atom` の新リリース検知
- **X アカウント / X トレンド** — xAI `x_search`（任意）

### ダイジェスト
- 同一の出来事を 1 トピックに統合、重要度順に並べる
- 各トピック: 要点 / 出典リンク / コメント（**観点は分析方針で指定**）
- 冒頭に Mermaid mindmap、要約前の生データも全件保存

### 運用
- **月次ソース棚卸し** — 採用実績からソース別の寄与を集計し pause / 追加候補を提案（提案のみ）
- **通知** — Slack / Discord / LINE 公式アカウント / 任意 Webhook（`scripts/notify.sh`）
- **LINE 連携（任意）** — トピック一覧カードの項目タップで詳細を返信する Webhook を同梱

### 認証
- **人はパスワード、機械はスコープ付き API キー**（`read / write / manage / admin`）。鍵はハッシュで保存、Settings 画面で発行・失効
- ルーティンには `read,write` だけ渡す（外部コンテンツ経由のプロンプトインジェクションでもソース・方針を書き換えられない）
- 閲覧 UI はパスワード + 30 日 Cookie。`PUBLIC_UI=1` で公開モードにも戻せる。詳細: [docs/AUTH.md](docs/AUTH.md)

### AI 統合
- **MCP サーバー内蔵** — ソース 4 操作・分析方針 2 操作・ダイジェスト / 生データ取得 4 操作。鍵のスコープ外のツールは見えない
- 収集・要約・登録・通知の全手順は **Claude Code スキル**。ルーティンもローカル実行も同じスキル
- ルーティンの作成・更新・実行・ログ確認は `/newsdigest-routine`

---

## 構成

```
newsdigest/
├── apps/console/              Next.js 15 + OpenNext → Cloudflare Workers + D1（UI + REST API + MCP + 認証）
├── .claude/skills/
│   ├── newsdigest-setup/          初期セットアップ（Claude Code 主導）
│   ├── newsdigest/                日次収集・要約・登録・通知（ルーティンが実行）
│   ├── newsdigest-sources-review/ 月次ソース棚卸し
│   └── newsdigest-routine/        ルーティンの作成・更新・実行・デバッグ
├── routine/                   ルーティンのプロンプトと作成テンプレート
├── scripts/                   setup.mjs / fetch-rss.mjs / post.mjs / notify.sh
├── tools/xai-search/          xAI x_search クライアント
├── sources.template.json      ソースマスタの空テンプレート
└── docs/
```

- **コンソールは AI を呼ばない**。DB + UI + REST + MCP なので無料枠に収まる
- **AI 実行は Claude Code ルーティン**。この fork を checkout し、環境変数からコンソールの URL とキーを受け取ってスキルを実行
- **ルーティンの作成・実行は API 経由**（Claude Code 内蔵の `RemoteTrigger`）。ブラウザ操作は不要

---

## ドキュメント

- [セットアップ（手動手順）](docs/SETUP.md)
- [認証（パスワード・API キー・スコープ）](docs/AUTH.md)
- [ソースと分析方針の書き方（例つき）](docs/SOURCES-AND-POLICY.md)
- [MCP サーバー](docs/MCP.md)
- [ルーティン運用（作成・更新・デバッグ・コスト）](docs/ROUTINE.md)
- [REST API](docs/API.md)
- [通知の設定](docs/NOTIFICATIONS.md)
- [カスタマイズ](docs/CUSTOMIZE.md)
- [アーキテクチャ](docs/ARCHITECTURE.md)

---

## ライセンス

**GNU AGPL-3.0**。個人・社内での利用、改変、再配布は自由。改変版を **ネットワーク越しに第三者へ提供する場合**（SaaS 等）はそのソースコードの公開義務がある（AGPL §13）。AGPL の条件で提供できない用途（商用 SaaS への組み込み、ソース非公開での再配布など）は、著作権者 Taskforce Inc. が別途商用ライセンスを提供できる。問い合わせ: GitHub Issues。

## 由来

Piper（AI 駆動事業体の量産、Taskforce Inc.）で毎朝運用している情報収集ダイジェストを、第三者が自分のアカウントにデプロイできる形に切り出したもの。運用側の VPS cron で動かしていた AI 実行部分を、利用者自身の Claude Code ルーティンに置き換えている。

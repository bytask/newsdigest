# Intel Digest

> 自分で選んだソース（X アカウント・X トレンド・RSS・OSS リリース）を毎朝 AI が巡回し、
> トピック別に要約した日次ダイジェストを自分専用のコンソールに蓄積する。
> **サーバー常駐なし・月額 0 円**（Cloudflare 無料枠）。AI 実行は **あなたの Claude Code（Web版）のルーティン** が担う。

```
[Claude Code ルーティン（あなたのサブスク・クラウド実行・毎朝）]
   │  このリポジトリをチェックアウト → .claude/skills/intel-digest を実行
   │  X / RSS / GitHub releases を収集 → 要約 → Mermaid 図解
   ▼  Bearer API
[intel-console  Cloudflare Workers + D1（あなたのアカウント）]
   │  ソースマスタ・ダイジェスト・生データの source of truth、閲覧 UI
   ▼  任意
[通知  Slack / Discord / LINE 公式アカウント / 任意の Webhook]
```

**現バージョン**: v0.1.0 ・ MIT License ・ TypeScript / Next.js 15 (OpenNext) / Cloudflare Workers + D1 / Claude Code skills

---

## なぜ Intel Digest？

| | ニュースアプリ / RSS リーダー | 有料 AI ニュースレター | **Intel Digest** |
|---|---|---|---|
| ソース | 提供側が決める | 提供側が決める | **自分で決める**（X / RSS / OSS リリース） |
| 要約 | なし or 定型 | 汎用 | 自分の関心に沿って AI が統合・要約 |
| 図解 | ❌ | ❌ | ✅ Mermaid（当日の全体像） |
| 生データ | ❌ | ❌ | ✅ 要約前の全アイテムを保存・閲覧 |
| ソース棚卸し | ❌ | ❌ | ✅ 月次で低寄与ソースの pause / 入替を提案 |
| 実行基盤 | — | — | **Claude Code ルーティン**（サーバー不要） |
| 月額 | 0〜 | 数千円〜 | **0 円**（Claude サブスク＋任意の xAI API 従量） |
| ソースコード | 非公開 | 非公開 | **MIT（このリポ）** |

---

## クイックスタート（約 15 分）

### 必要なもの

- Cloudflare アカウント（無料枠で OK）
- GitHub アカウント（このリポジトリを自分の GitHub に置く）
- Claude Pro / Max / Team のいずれか（Claude Code Web版のルーティンを使う）
- Node.js 20+
- （任意）xAI API キー — X アカウント / X トレンドを収集する場合。RSS だけなら不要

### 1. リポジトリを自分の GitHub へ

```bash
# GitHub 上で Fork（または Use this template）→ clone
git clone https://github.com/<you>/intel-digest.git
cd intel-digest
```

### 2. コンソールをデプロイ（対話 CLI）

```bash
npm run setup
```

CLI が以下を全部やる:

- Cloudflare 認証（`wrangler login`）
- D1 データベース作成 + スキーマ適用
- API キー生成 + Worker secret 登録
- Worker デプロイ（`https://<name>.<subdomain>.workers.dev`）
- 初期ソースの投入（`sources.example.json`）
- ヘルスチェック

完了すると `.env.local` に `INTEL_API_URL` / `INTEL_API_KEY` が書き出される（gitignore 済み）。

### 3. Claude Code ルーティンを登録

1. https://claude.ai/code/environments で使う環境を開き、**環境変数**に `.env.local` の値（`INTEL_API_URL` / `INTEL_API_KEY`、任意で `XAI_API_KEY` と通知系）を登録する
2. ローカルの Claude Code でこのリポジトリを開き、次を実行:

```
/intel-digest-routine
```

Claude が `routine/routine.template.json` をもとに、ルーティン API（`RemoteTrigger`）経由で日次ルーティン（既定 07:15 JST）を作成し、初回を手動実行して結果を確認する。

### 4. 使う

- コンソール `https://<your-worker>.workers.dev` にダイジェストが並ぶ
- ソースを変えたいときはローカル Claude Code で「ソースに @foo を追加して」「Hacker News を pause して」と頼む（`/intel-sources` 相当の操作は `intel-digest` スキル内の API 手順で行う）

詳細は [docs/SETUP.md](docs/SETUP.md)。

---

## 主要機能

### 収集
- **X アカウント** — 指定ハンドルの直近 24 時間の投稿（xAI `x_search`）
- **X トレンド** — 自由文クエリで直近 24 時間の話題を検索
- **RSS / Atom** — 任意のフィード（`scripts/fetch-rss.mjs`、依存ゼロ）
- **OSS リリース** — GitHub `releases.atom` の新リリース検知（重要 OSS の更新を見逃さない）

### ダイジェスト
- 同一の出来事を 1 トピックに統合（複数ソース登場 = 重要度高）、重要度順に 5〜10 トピック
- 各トピック: 要点 / 出典リンク / コメント（背景・意義）
- 冒頭に当日の全体像を **Mermaid mindmap** で図解
- 要約前の生データも全件保存（Raw ビュー）

### 運用
- **月次ソース棚卸し** — 直近 1 ヶ月の採用実績からソース別の寄与を集計し pause / 追加候補を提案（提案のみ、適用は人間）
- **通知** — Slack Incoming Webhook / Discord Webhook / LINE 公式アカウント broadcast / 任意 Webhook（`scripts/notify.sh`）
- **LINE 連携（任意）** — トピック一覧カードの項目タップで詳細をトークに返信する Webhook を同梱

### AI 統合
- 収集・要約・登録・通知の全手順は **Claude Code スキル**（`.claude/skills/`）として定義。ルーティンもローカル実行も同じスキルを使う
- ルーティンの作成・更新・手動実行・ログ確認は `/intel-digest-routine` スキルで Claude に頼む

---

## アーキテクチャ

```
intel-digest/
├── apps/console/              Next.js 15 + OpenNext → Cloudflare Workers + D1（UI + REST API）
├── .claude/skills/
│   ├── intel-digest/          日次収集・要約・登録・通知（ルーティンが実行）
│   ├── intel-sources-review/  月次ソース棚卸し
│   └── intel-digest-routine/  ルーティンの作成・更新・実行・デバッグ（ローカル Claude Code で使う）
├── routine/                   ルーティンのプロンプトと作成テンプレート
├── scripts/
│   ├── setup.mjs              対話セットアップ CLI（npm run setup）
│   ├── fetch-rss.mjs          RSS/Atom → JSON（依存ゼロ）
│   ├── post.mjs               コンソール API クライアント（digest / raw / sources）
│   └── notify.sh              通知（Slack / Discord / LINE / Webhook）
├── tools/xai-search/          xAI x_search クライアント（X 収集）
├── sources.example.json       初期ソースマスタ
└── docs/                      SETUP / ARCHITECTURE / API / ROUTINE / NOTIFICATIONS / CUSTOMIZE
```

- **コンソール**（Worker）は AI を一切呼ばない。ただの DB + UI + REST API なので無料枠に収まる
- **AI 実行**は Claude Code ルーティン（Anthropic のクラウドサンドボックス）。このリポジトリをチェックアウトし、環境変数からコンソールの URL とキーを受け取ってスキルを実行する
- **ルーティンの作成・実行は API 経由**（Claude Code 内蔵の `RemoteTrigger` = claude.ai ルーティン API）。ブラウザ操作は不要

詳細: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) / [docs/ROUTINE.md](docs/ROUTINE.md)

---

## ドキュメント

- [セットアップ](docs/SETUP.md)
- [アーキテクチャ](docs/ARCHITECTURE.md)
- [ルーティン運用（作成・更新・デバッグ・コスト）](docs/ROUTINE.md)
- [REST API](docs/API.md)
- [通知の設定](docs/NOTIFICATIONS.md)
- [カスタマイズ（言語・時刻・プロンプト・ブランディング）](docs/CUSTOMIZE.md)

---

## ライセンス

MIT License. 商用利用・改変・再配布自由。

## 由来

Piper（AI 駆動事業体の量産）で 2026-07 から毎朝運用している intel-digest / intel-console を、第三者が自分のアカウントにデプロイできる形に切り出したもの。運用側の VPS cron で動かしていた AI 実行部分を、利用者自身の Claude Code ルーティンに置き換えている。

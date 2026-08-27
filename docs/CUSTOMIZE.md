# カスタマイズ

## 言語・タイムゾーン・時刻

| 何を | どこで |
|---|---|
| ダイジェストの言語 | 環境変数 `DIGEST_LANG=ja|en` |
| 「昨日〜今日」の基準 TZ | 環境変数 `DIGEST_TZ`（既定 Asia/Tokyo） |
| 実行時刻 | ルーティンの cron（UTC）。`/newsdigest-routine` で変更 |
| 画面のスケジュール表記 | `apps/console/wrangler.jsonc` の `vars.SCHEDULE_LABEL` |

## ダイジェストの中身

観点・トピック数・言語・除外ルールは **分析方針**（コンソールに保存、MCP `set_digest_policy`）で変える。スキルを触る必要はない（[SOURCES-AND-POLICY.md](SOURCES-AND-POLICY.md)）。

手順そのもの（収集ウィンドウ・図の種類・出力フォーマット）を変えたいときは `.claude/skills/newsdigest/SKILL.md` を編集して push する（ルーティンは毎回 checkout する）。よくある変更:

- 図解の種類（`mindmap` → `timeline` / `flowchart`）
- 収集ウィンドウ（`--hours 24` → 週次運用なら `168`）

**変えないこと**: トピック見出しの形式 `### N. タイトル 【重要度: 高】`（LINE Webhook と棚卸しの集計が依存）。

プロンプト本文 `routine/newsdigest.prompt.md` を変えた場合だけ、ルーティン側の更新（`/newsdigest-routine` → update）が必要。

## ソース種別の追加

`kind` を増やす場合は 4 箇所: `apps/console/schema.sql` の CHECK 制約、`lib/store.ts` の型と `getSources` / `putSources`、`app/sources/page.tsx` の表示、スキル Step 2 の収集手順。既存の `rss` に URL を足すだけで済むもの（YouTube チャンネルの RSS、note の RSS、GitHub の commits.atom など）は種別追加不要。

## ブランディング

`apps/console/wrangler.jsonc` の `vars`:

```jsonc
"vars": {
  "APP_NAME": "My Digest",
  "APP_TAGLINE": "…",
  "SCHEDULE_LABEL": "収集 毎朝 8:00",
  "LINE_ADD_URL": "https://line.me/R/ti/p/@xxxx"   // 任意
}
```

配色・レイアウトは `apps/console/app/globals.css`（Apple HIG 風、ライト/ダーク対応）。

## 認証まわり

既定で閲覧 UI はパスワードログイン、API / MCP はスコープ付き API キー（[AUTH.md](AUTH.md)）。

- **公開モードに戻す**: `wrangler.jsonc` の `vars` に `"PUBLIC_UI": "1"`。`/settings` と `/api/*`・`/mcp` は引き続き認証あり
- **セッション期間**: `apps/console/lib/session.ts` の `SESSION_MAX_AGE`（既定 30 日）
- **パスワードのハッシュ強度**: `lib/auth.ts` の `PBKDF2_ITERATIONS`（既定 60,000。Workers 無料枠の CPU 10ms に収まる値。有料プランなら 600,000 まで上げてよい）
- **ログインのレートリミット**: `lib/store.ts` の `allowLoginAttempt`（既定 10 回 / 10 分 / IP）。Cloudflare の WAF Rate Limiting ルール（無料枠 1 本）を `/api/auth/login` に併用するとさらに堅い

### Cloudflare Access を前に置く（任意）

組織の SSO で守りたい場合。Workers ダッシュボード → 対象 Worker → Settings → Domains & Routes → `workers.dev` の **Enable Cloudflare Access**（Worker ごとに `<name> - Production` ポリシーが作られる）。

- 人: Allow（メール OTP / Google など）
- 機械: **Service Auth** ポリシー + Service Token。ルーティンや Claude Code は `CF-Access-Client-Id` / `CF-Access-Client-Secret` ヘッダを付ける（`claude mcp add --header` で 2 つ渡せる。`scripts/post.mjs` は `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` 環境変数があれば自動で付与）
- claude.ai カスタムコネクタはヘッダを送れない → `/mcp/*` を Bypass にする（パス鍵 = read 専用なので露出は閲覧に限られる）
- 独自ドメインで使うなら `wrangler.jsonc` に `routes` を追加（Cloudflare 管理のゾーンが必要）

## ルーティン以外で動かす

スキルは環境変数さえあればどこでも動く:

- **ローカル cron**: `claude -p "$(cat routine/newsdigest.prompt.md)" --allowedTools Bash,Read,Write,Edit,Glob,Grep,Skill,WebFetch,WebSearch`
- **自前 VPS の headless Claude Code**: 同上。Piper ではこの形で運用している
- **GitHub Actions**: Claude Code Action で同じプロンプトを実行（`NEWSDIGEST_*` を Secrets に）

## Piper 本番との差分

Piper 側の newsdigest（運用インスタンス）とこのパッケージの `apps/console` は同じコードベースだが、パッケージ側は表示名・スケジュール表記を `vars` に外出しし、`/api/health` を追加、LINE Webhook の secrets 名を `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` に汎用化している。

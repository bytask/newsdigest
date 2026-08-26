# カスタマイズ

## 言語・タイムゾーン・時刻

| 何を | どこで |
|---|---|
| ダイジェストの言語 | 環境変数 `DIGEST_LANG=ja|en` |
| 「昨日〜今日」の基準 TZ | 環境変数 `DIGEST_TZ`（既定 Asia/Tokyo） |
| 実行時刻 | ルーティンの cron（UTC）。`/intel-digest-routine` で変更 |
| 画面のスケジュール表記 | `apps/console/wrangler.jsonc` の `vars.SCHEDULE_LABEL` |

## ダイジェストの中身

`.claude/skills/intel-digest/SKILL.md` を編集して push するだけ（ルーティンは毎回 checkout する）。よくある変更:

- トピック数（Step 3 の「5〜10」）
- コメントの観点（「業界へのインパクト」を「自分の事業への示唆」に変える、など。ただし通知先が共有チャネルなら固有情報を書かない前提は維持）
- 図解の種類（`mindmap` → `timeline` / `flowchart`）
- 収集ウィンドウ（`--hours 24` → 週次運用なら `168`）

**変えないこと**: トピック見出しの形式 `### N. タイトル 【重要度: 高】`（LINE Webhook と棚卸しの集計が依存）。

プロンプト本文 `routine/intel-digest.prompt.md` を変えた場合だけ、ルーティン側の更新（`/intel-digest-routine` → update）が必要。

## ソース種別の追加

`kind` を増やす場合は 4 箇所: `apps/console/schema.sql` の CHECK 制約、`lib/store.ts` の型と `getSources` / `putSources`、`app/sources/page.tsx` の表示、スキル Step 2 の収集手順。既存の `rss` に URL を足すだけで済むもの（YouTube チャンネルの RSS、note の RSS、GitHub の commits.atom など）は種別追加不要。

## ブランディング

`apps/console/wrangler.jsonc` の `vars`:

```jsonc
"vars": {
  "APP_NAME": "My Intel",
  "APP_TAGLINE": "…",
  "SCHEDULE_LABEL": "収集 毎朝 8:00",
  "LINE_ADD_URL": "https://line.me/R/ti/p/@xxxx"   // 任意
}
```

配色・レイアウトは `apps/console/app/globals.css`（Apple HIG 風、ライト/ダーク対応）。

## 閲覧を制限する

コンソールの UI は認証なし。限定公開にするなら:

- **Cloudflare Access**（推奨・無料枠 50 ユーザー）: Zero Trust → Access → Applications で `<your-worker>.workers.dev` を保護。メール OTP や Google ログインを許可。**`/api/*` はバイパスポリシー**にしてルーティンの Bearer アクセスを通す
- 独自ドメイン: `wrangler.jsonc` に `routes` を追加（Cloudflare 管理のゾーンが必要）

## ルーティン以外で動かす

スキルは環境変数さえあればどこでも動く:

- **ローカル cron**: `claude -p "$(cat routine/intel-digest.prompt.md)" --allowedTools Bash,Read,Write,Edit,Glob,Grep,Skill,WebFetch,WebSearch`
- **自前 VPS の headless Claude Code**: 同上。Piper ではこの形で運用している
- **GitHub Actions**: Claude Code Action で同じプロンプトを実行（`INTEL_*` を Secrets に）

## Piper 本番との差分

Piper 側の intel-console（運用インスタンス）とこのパッケージの `apps/console` は同じコードベースだが、パッケージ側は表示名・スケジュール表記を `vars` に外出しし、`/api/health` を追加、LINE Webhook の secrets 名を `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` に汎用化している。

# MCP サーバー

コンソール（Worker）は MCP サーバー（Streamable HTTP、ステートレス）を内蔵している。Claude Code や claude.ai から、ソースの追加・削除・pause、分析方針の読み書き、ダイジェストと生データの取得ができる。

| エンドポイント | 認証 | 用途 |
|---|---|---|
| `POST https://<worker>/mcp` | `Authorization: Bearer <NEWSDIGEST_API_KEY>` | Claude Code など、ヘッダを付けられるクライアント |
| `POST https://<worker>/mcp/<NEWSDIGEST_API_KEY>` | URL パスのトークン | claude.ai カスタムコネクタなど、ヘッダを設定できないクライアント。**URL 自体が秘密** |

SSE ストリーム（GET）は未対応。ツール呼び出しはすべて 1 リクエスト = 1 レスポンス。

## Claude Code から使う

`npm run setup` の最後に表示されるコマンドをそのまま実行:

```bash
claude mcp add --transport http newsdigest https://<worker>/mcp --header "Authorization: Bearer <key>"
```

プロジェクトに固定したい場合は `.mcp.json`（**キーを含むので commit しない**。`.gitignore` に追加）:

```json
{
  "mcpServers": {
    "newsdigest": {
      "type": "http",
      "url": "https://<worker>/mcp",
      "headers": { "Authorization": "Bearer <key>" }
    }
  }
}
```

登録後はそのまま話せば動く:

> 「ソース一覧見せて」「Hacker News の RSS を追加して」「@foo を pause して」
> 「分析方針を見せて」「コメントの観点を〜に変えて」
> 「今日のダイジェスト見せて」「8/20 の生データで Cloudflare に触れてるものは？」

## claude.ai（Web / モバイル）から使う

設定 → コネクタ → カスタムコネクタを追加 → URL に `https://<worker>/mcp/<NEWSDIGEST_API_KEY>` を入力（認証なし）。Claude チャットや Cowork から同じツールが使える。

## ツール一覧

| ツール | 引数 | 説明 |
|---|---|---|
| `list_sources` | `kind?`, `status?` | ソース一覧 |
| `add_source` | `kind`, `value`, `title?`, `category?`, `note?`, `status?` | 追加（既存なら note/status 等を更新）。`release` は `owner/name` で指定 |
| `update_source` | `kind`, `value`, `status?`, `note?`, `title?`, `category?` | pause / resume、note 変更 |
| `remove_source` | `kind`, `value` | 完全削除（通常は pause を推奨） |
| `get_digest_policy` | – | 分析方針（Markdown） |
| `set_digest_policy` | `markdown` | 分析方針を保存（全置換） |
| `list_digests` | `limit?` | ダイジェスト一覧（新しい順） |
| `get_digest` | `name?` | 本文（Markdown）。省略で最新 |
| `list_raw_dates` | – | 生データのある日付と件数 |
| `get_raw_items` | `date`, `kind?`, `source?`, `limit?` | その日の収集アイテム（要約前）と失敗ソース |

`kind`: `x_account` / `x_trend` / `rss` / `release`。`value` は順に handle / クエリ / URL / `owner/name`。

## 実装

`apps/console/lib/mcp.ts`（JSON-RPC 2.0 の `initialize` / `ping` / `tools/list` / `tools/call` を自前実装、SDK 依存なし）と `app/mcp/route.ts` / `app/mcp/[token]/route.ts`。ツールを増やすときは `TOOLS` に定義を足し、`callTool` に分岐を足す。

## セキュリティ

- 両エンドポイントとも `NEWSDIGEST_API_KEY` を知っている相手に **書き込み権限** を与える。キーが漏れたら `cd apps/console && npx wrangler secret put NEWSDIGEST_API_KEY` で差し替え、claude.ai の環境変数と `claude mcp` の登録も更新する
- パストークン版の URL はブラウザ履歴や共有リンクに残りやすい。claude.ai コネクタ以外では Bearer 版を使う
- キーを別々にしたい（読み取り専用の MCP を配りたい等）場合は `lib/mcp.ts` の `mcpAuthorized` を拡張する

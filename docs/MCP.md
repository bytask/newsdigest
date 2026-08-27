# MCP サーバー

コンソール（Worker）は MCP サーバー（Streamable HTTP、ステートレス）を内蔵している。Claude Code や claude.ai から、ソースの追加・削除・pause、分析方針の読み書き、ダイジェストと生データの取得ができる。

| エンドポイント | 認証 | 用途 |
|---|---|---|
| `POST https://<worker>/mcp` | `Authorization: Bearer <API キー>` | Claude Code など、ヘッダを付けられるクライアント |
| `POST https://<worker>/mcp/<API キー>` | URL パスの鍵。**`read` スコープだけの鍵に限定** | claude.ai カスタムコネクタなど、ヘッダを設定できないクライアント。**URL 自体が秘密** |

API キーはスコープ付き（[AUTH.md](AUTH.md)）。`tools/list` は鍵のスコープ外のツールを返さず、スコープ不足の `tools/call` は JSON-RPC エラー `-32003` になる。

SSE ストリーム（GET）は未対応。ツール呼び出しはすべて 1 リクエスト = 1 レスポンス。

## Claude Code から使う

`npm run setup` の最後に表示されるコマンド（`local` 鍵 = read,write,manage,admin）をそのまま実行:

```bash
claude mcp add --transport http newsdigest https://<worker>/mcp --header "Authorization: Bearer <local 鍵>"
```

別の鍵を使いたければ Settings 画面（`/settings`）の「Claude Code 用」プリセット（read,write,manage）で発行する。

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

設定 → コネクタ → カスタムコネクタを追加 → URL に `https://<worker>/mcp/<claude-ai 鍵>` を入力（認証なし）。`npm run setup` が `claude-ai`（read）鍵を発行して URL を表示する。Settings 画面の「claude.ai コネクタ用」プリセットでも発行できる。

read 専用なので、claude.ai からできるのは閲覧・検索のみ（ソースや方針の変更は Claude Code から）。

## ツール一覧

| ツール | 引数 | 説明 |
|---|---|---|
| `list_sources` | `kind?`, `status?` | ソース一覧 [read] |
| `add_source` | `kind`, `value`, `title?`, `category?`, `note?`, `status?` | 追加（既存なら note/status 等を更新）。`release` は `owner/name` で指定 [manage] |
| `update_source` | `kind`, `value`, `status?`, `note?`, `title?`, `category?` | pause / resume、note 変更 [manage] |
| `remove_source` | `kind`, `value` | 完全削除（通常は pause を推奨） [manage] |
| `get_digest_policy` | – | 分析方針（Markdown） [read] |
| `set_digest_policy` | `markdown` | 分析方針を保存（全置換） [manage] |
| `list_digests` | `limit?` | ダイジェスト一覧（新しい順） [read] |
| `get_digest` | `name?` | 本文（Markdown）。省略で最新 [read] |
| `list_raw_dates` | – | 生データのある日付と件数 [read] |
| `get_raw_items` | `date`, `kind?`, `source?`, `limit?` | その日の収集アイテム（要約前）と失敗ソース [read] |

`kind`: `x_account` / `x_trend` / `rss` / `release`。`value` は順に handle / クエリ / URL / `owner/name`。

## 実装

`apps/console/lib/mcp.ts`（JSON-RPC 2.0 の `initialize` / `ping` / `tools/list` / `tools/call` を自前実装、SDK 依存なし）と `app/mcp/route.ts` / `app/mcp/[token]/route.ts`。認証は `lib/auth.ts` の `authenticate()` が行い、`Principal`（鍵名とスコープ）を `handleMcp` に渡す。ツールを増やすときは `TOOLS` に定義を足し、`TOOL_SCOPES` に必要スコープを、`callTool` に分岐を足す。

## セキュリティ

- 鍵が漏れたら Settings 画面か `node scripts/post.mjs keys:revoke <id>` で **その鍵だけ**失効し、再発行して差し替える。他のクライアントは止まらない
- パス鍵版の URL はブラウザ履歴や共有リンクに残りやすい。だから `read` のみの鍵しか受け付けない。claude.ai コネクタ以外では Bearer 版を使う
- 読み取り専用の MCP を配りたいときは `read` 鍵を発行して渡せばよい（期限付きにもできる）

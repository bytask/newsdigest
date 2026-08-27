---
name: newsdigest
description: NewsDigest の日次ジョブ。コンソールのソースマスタ（X アカウント / X トレンド / RSS / OSS リリース）から直近24時間の情報を収集し、利用者が設定した分析方針に従って要約＋Mermaid 図解付きのダイジェストを生成してコンソールへ登録・通知する。Claude Code ルーティン（日次）またはローカル手動実行で使う。「ダイジェスト作って」「今日のニュースまとめて」で起動。ソースや分析方針の変更依頼も受ける。
---

# NewsDigest — 日次収集・要約

コンソール（`$NEWSDIGEST_API_URL`）のソースマスタと **分析方針（digest policy）** に従い、直近24時間の情報を集めてダイジェストを作り、コンソールへ登録する。承認なしで最後まで自動実行する。

何を集めるか（ソース）と、どう要約するか（分析方針）は **利用者がコンソールに設定したもの** だけを使う。このスキルは手順と出力フォーマットを決めるだけで、関心領域や観点を持ち込まない。

## 前提（環境変数）

| 変数 | 必須 | 用途 |
|---|---|---|
| `NEWSDIGEST_API_URL` / `NEWSDIGEST_API_KEY` | ✅ | コンソール API。ルーティンでは claude.ai の環境変数（`routine` 鍵 = read,write）、ローカルでは `.env.local`（`local` 鍵）から（`scripts/*.mjs` / `notify.sh` が自動で読む。Bash から直接 `curl` する場合は `set -a; source .env.local; set +a`）。HTTP 403 は鍵のスコープ不足 |
| `XAI_API_KEY` | – | X アカウント / X トレンド収集。未設定なら X 系をスキップして続行 |
| `DIGEST_LANG` | – | `ja`（既定）/ `en`。分析方針に言語指定があればそちらが優先 |
| `DIGEST_TZ` | – | 既定 `Asia/Tokyo`。日付判定に使う |
| `NOTIFY_*` / `LINE_CHANNEL_*` | – | 通知先。未設定なら通知をスキップ |
| `DIGEST_COMMIT_LOGS` | – | `1` のとき `digests/YYYY-MM-DD.md` を commit/push する |

作業ファイルは `.work/` に置く（gitignore 済み）。`mkdir -p .work`。

## 手順

### Step 0: 日付と疎通

```bash
mkdir -p .work
TZ="${DIGEST_TZ:-Asia/Tokyo}"; TODAY=$(TZ=$TZ date +%F); YESTERDAY=$(TZ=$TZ date -d "yesterday" +%F 2>/dev/null || TZ=$TZ date -v-1d +%F)
node scripts/post.mjs health
```

health が `ok: false` または到達不能なら、原因（URL / キー / ネットワーク制限）を報告して終了する。**書き込み系 API にダミーデータを送って確かめない。**

### Step 1: ソースマスタと分析方針

```bash
node scripts/post.mjs sources > .work/sources.json
node scripts/post.mjs policy  > .work/policy.md      # 未設定なら exit 3
```

- **分析方針が未設定（exit 3）なら実行しない。** 「分析方針が未設定です。Claude Code で `/newsdigest-setup` を実行するか、MCP の `set_digest_policy` で設定してください（書き方: docs/SOURCES-AND-POLICY.md）」と報告して終了
- `sources.x_accounts / x_trends / rss / releases` の `status: active` を種別ごとに列挙する。active が 0 件なら同様に報告して終了
- `.work/policy.md` を読み、以下を把握する: 言語 / トピック数 / コメントの観点 / 除外・優先ルール / 公開範囲（共有チャネルに流れるか）

### Step 2: 収集（並列）

以下を **並列** に実行し、結果を `.work/` に保存する。

**RSS + OSS リリース**（依存ゼロのパーサ。24時間以内の記事のみ。リリースは初回や低頻度リポなら `--hours 168` で 7 日まで許容）:
```bash
node scripts/fetch-rss.mjs --from-sources .work/sources.json --hours 24 > .work/rss.json
```
`ok: false` のフィードは失敗として記録し続行。直接取得が実行環境のネットワーク制限で失敗した場合は、`fetch-rss.mjs` が自動でコンソールの `GET /api/fetch` 経由に切り替える（結果の `via: "console"`）。**新リリースがあれば必ずダイジェストのトピックに含める**（利用者が明示的に監視対象にしたものだから）。

**X アカウント**（`XAI_API_KEY` がある場合のみ。active な handle をまとめて 1 回、10 件を超えるなら分割）:
```bash
python3 tools/xai-search/search.py \
  "以下のアカウントの直近24時間の投稿から、重要な発表・知見をリストアップしてください。各項目に要約とポストURLを含めてください" \
  --from $YESTERDAY --to $TODAY --handles handle1,handle2,... > .work/x-accounts.txt
```

**X トレンド**（active な query ごとに 1 回）:
```bash
python3 tools/xai-search/search.py "{query}" --from $YESTERDAY --to $TODAY > .work/x-trend-N.txt
```

失敗したソースは記録して続行（全滅のときだけエラー終了）。

収集した全アイテムを要約とは別に生データ JSON `.work/raw.json` にまとめる（ダイジェストに採用しなかったものも全件）:
```json
{"date":"YYYY-MM-DD","collected_at":"YYYY-MM-DDTHH:MM+09:00",
 "items":[{"source":"<ソース表示名>","kind":"rss","title":"...","url":"...","published":"..."}],
 "failures":[{"source":"...","kind":"rss|x_account|x_trend|release","reason":"..."}]}
```
`kind` は `rss` | `x_account` | `x_trend` | `release`。

### Step 3: トピック統合・要約（分析方針に従う）

1. 同一の出来事を 1 トピックに統合（複数ソースに登場 = 重要度が高い）
2. 分析方針のトピック数（未指定なら 5〜8）に絞り、重要度順に並べる。方針の除外・優先ルールをここで適用する
3. 各トピック: **要点**（2〜3 行）/ **出典**（リンク、複数可）/ **コメント**（分析方針で指定された観点で 1〜2 文）

要約は元テキストのコピペではなく自分の言葉で。言語は方針 → `DIGEST_LANG` の順で決める。方針に「共有チャネルに流れる」旨があれば、利用者固有の非公開情報を書かない。

### Step 4: Mermaid 図解

冒頭に当日の全体像を俯瞰する Mermaid 図を 1 つ入れる。基本は `mindmap`（中心=日付、枝=テーマ、葉=トピック）。方針に図の指定があればそれに従う。**ノードテキストに `(` `)` `[` `]` `{` `}` を含めない**（描画エラー防止）。

### Step 5: 保存

`.work/YYYY-MM-DD.md` に以下の形式で書く。**トピック見出しは必ず `### N. タイトル 【重要度: 高/中/低】`**（LINE Webhook と月次棚卸しの集計がこの形式に依存）。

```markdown
---
date: YYYY-MM-DD
sources_ok: N
sources_failed: N
topics: N
---

# Digest: YYYY-MM-DD

## 今日の全体像

```mermaid
mindmap
  root((YYYY-MM-DD))
    テーマA
      トピック1
      トピック2
```

## トピック

### 1. トピック名 【重要度: 高】

- **要点**: ...
- **出典**: [ソース名](URL), [ソース名](URL)
- **コメント**: ...（分析方針の観点で）

（トピック分繰り返し）

## ソース別収集状況

| ソース | 種別 | 件数 | 状態 |
|--------|------|------|------|

## アクションアイテム

- [ ] [newsdigest] ソース運用に関する提案（追加・停止など）があれば
```

コンソールへ登録（一次ストア）:
```bash
node scripts/post.mjs digest $TODAY .work/$TODAY.md
node scripts/post.mjs raw .work/raw.json
```
POST が失敗したらエラーを記録して続行（Step 6 の通知には失敗を明記）。

`DIGEST_COMMIT_LOGS=1` のときだけ、`digests/$TODAY.md` にコピーして **そのファイルのみ** `git add` → commit（`log(newsdigest): digest YYYY-MM-DD`）→ `git push`。競合したら `git pull --rebase` して再 push。それ以外は commit しない。

### Step 6: 通知（任意）

```bash
bash scripts/notify.sh "📡 Digest $TODAY
1. <トピック1タイトル>【高】
2. <トピック2タイトル>【中】
3. <トピック3タイトル>【中】
→ $NEWSDIGEST_API_URL/d/$TODAY"
```

通知先が未設定なら自動でスキップされる（エラーにしない）。**手順にある 1 回だけ送る**。動作確認目的の再送はしない（必要なら `NOTIFY_DRY_RUN=1`）。

### Step 7: 結果報告

最後に: 収集ソース数（成功/失敗）、トピック数、トップ 3 の 1 行要約、失敗ソースの詳細、コンソール URL（`$NEWSDIGEST_API_URL/d/$TODAY`）。

## ソース・分析方針の変更（利用者から頼まれたとき）

MCP `newsdigest` が登録されていればそれを使う（`add_source` / `update_source` / `remove_source` / `set_digest_policy`。`manage` スコープの鍵が必要）。無ければ REST（同じく `manage`）:

1. `node scripts/post.mjs sources > .work/sources.json` → 編集（追加は `status: active`、外すのは `status: paused`）→ `node scripts/post.mjs sources:put .work/sources.json`
2. `node scripts/post.mjs policy > .work/policy.md` → 編集 → `node scripts/post.mjs policy:put .work/policy.md`

変更後は一覧を見せて確認する。書き方の例は `docs/SOURCES-AND-POLICY.md`。

## 注意事項

- 収集は並列に。一部ソースの失敗でジョブを止めない（失敗はレポートに明記 — 棚卸しの判断材料）
- 書き込み系 API（`/api/digests` `/api/raw` `PUT /api/sources` `PUT /api/policy`）へダミーデータを送らない
- 見出し形式（`### N. タイトル 【重要度: …】`）は分析方針より優先して維持する

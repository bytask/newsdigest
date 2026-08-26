# ソースと分析方針の書き方

NewsDigest は **何を読むか（ソース）** と **どう要約するか（分析方針）** を持たずに出荷される。どちらも利用者が設定して初めてルーティンが動く。設定は MCP（`/newsdigest-setup` が代行）か REST API で行う。

## 1. ソース

4 種類。すべて `status: active | paused` を持ち、外すときは削除ではなく `paused` にする（棚卸しの履歴になる）。

| kind | value | 収集方法 | 追加コスト |
|---|---|---|---|
| `rss` | RSS / Atom の URL | `scripts/fetch-rss.mjs`（依存ゼロ） | なし |
| `release` | GitHub の `owner/name` | `releases.atom` を fetch-rss で取得 | なし |
| `x_account` | X の handle（@なし） | xAI `x_search`（直近 24h の投稿） | xAI API 従量 |
| `x_trend` | 自然文の検索クエリ | xAI `x_search` | xAI API 従量 |

### MCP で追加する（Claude Code から）

```
「ソースに Hacker News の RSS を追加して。note は "テック全般の温度感"」
「anthropics/claude-code のリリースを監視して」
「@simonw を X アカウントとして追加」
「X トレンドに "エッジコンピューティング の直近24時間の主要な話題" を追加」
「Hacker News を pause して」
```

Claude が `add_source` / `update_source` を呼ぶ。`note` には **なぜ入れたか・何を期待するか** を書いておくと、月次棚卸しで「期待どおり寄与しているか」を判定できる。

### REST / JSON で一括投入する

`sources.template.json` の形式:

```json
{
  "version": 1,
  "sources": {
    "x_accounts": [
      { "handle": "example_handle", "note": "なぜ追加したか", "added": "2026-01-01", "status": "active" }
    ],
    "x_trends": [
      { "query": "○○ の直近24時間の主要な話題", "note": "…", "added": "2026-01-01", "status": "active" }
    ],
    "rss": [
      { "url": "https://example.com/feed.xml", "title": "Example Blog", "category": "tech", "note": "…", "added": "2026-01-01", "status": "active" }
    ],
    "releases": [
      { "repo": "owner/name", "url": "https://github.com/owner/name/releases.atom", "note": "…", "added": "2026-01-01", "status": "active" }
    ]
  },
  "review": { "cadence": "monthly", "last_reviewed": null }
}
```

```bash
node scripts/post.mjs sources:put sources.json      # 全置換
node scripts/post.mjs sources                        # 確認
```

### 選び方の目安

- 合計 **5〜15 ソース**。多すぎると 1 トピックあたりの要約が薄くなる
- RSS は登録前に `node scripts/fetch-rss.mjs <url>` で取得できることを確認する（`ok: false` なら URL が違う）
- サイトの RSS URL が分からないときは、トップページの `<link rel="alternate" type="application/rss+xml">` を探す。ニュースサイトは `/feed` `/rss` `/atom.xml` が多い
- X トレンドのクエリは「〜の直近24時間の主要な話題」「〜のニュース」のように **期間と対象を含めた自然文** にすると x_search の精度が上がる
- 更新頻度が低いソース（月数回のブログ）は、毎日「新着なし」になるが問題ない。棚卸しで登場回数が低くても、重要トピック寄与があれば残す

## 2. 分析方針（digest policy）

ルーティンが毎朝読む Markdown。「何をどう要約してほしいか」を人に頼むときと同じ言葉で書く。構造は自由だが、以下の項目があるとブレない。

### 雛形

```markdown
# 分析方針

## 読者
- 誰が読むか（例: 自分だけ / チームの Slack に流れる / 顧客にも共有）
- 共有チャネルに流れる場合は「固有の非公開情報を書かない」と明記

## 関心領域（優先順）
1. …
2. …
3. …

## 出力
- 言語: 日本語
- トピック数: 5〜8
- 各トピックの「コメント」は次の観点で書く: …
- 図解: mindmap（テーマ別）

## 取捨選択
- 優先する: …
- 減らす / 除外する: …
- 同じ出来事が複数ソースに出たら 1 トピックにまとめ、重要度を上げる

## 文体
- 断定調で短く。専門用語はそのまま。比喩は使わない
```

### 例 A: 個人の技術キャッチアップ

```markdown
# 分析方針

## 読者
自分だけ。Web 開発者（TypeScript / Cloudflare / AI エージェント）。

## 関心領域（優先順）
1. LLM / エージェント開発の実務的な知見（ツール・SDK・評価手法）
2. Cloudflare Workers / エッジの新機能
3. 監視している OSS のリリース（破壊的変更は必ず拾う）

## 出力
- 言語: 日本語
- トピック数: 5〜7
- コメントは「自分の開発にどう効くか（試す価値があるか、待つべきか）」を 1〜2 文で
- 図解: mindmap

## 取捨選択
- 資金調達・人事・株価のニュースは除外
- 英語ソースの一次情報を優先し、翻訳記事は同じ出来事なら一次情報側にまとめる
- リリースノートはバージョン番号と破壊的変更の有無を必ず書く
```

### 例 B: チーム共有の業界ニュース

```markdown
# 分析方針

## 読者
社内 Slack #news に自動投稿される。営業・企画も読むので前提知識を要求しない。
社名・案件名・社内 URL など固有情報は書かない。

## 関心領域（優先順）
1. 自社が属する業界（例: 飲食・フードテック）の規制・大手の動き
2. 業界に影響する AI 活用事例
3. 競合・隣接プレイヤーのプロダクト発表

## 出力
- 言語: 日本語、敬体ではなく常体
- トピック数: 5
- コメントは「業界への影響と、当社が検討すべき論点」を一般論として 1〜2 文（社内判断は書かない）
- 図解: flowchart LR で「出来事 → 影響 → 論点」

## 取捨選択
- 海外ニュースは日本市場に関係するものだけ
- ゴシップ・人事は除外
```

### 例 C: 英語・投資判断向け

```markdown
# Digest policy

## Reader
Myself. Investor in public tech companies.

## Focus
1. Earnings, guidance, and product announcements from companies in my watchlist (see release/x_account sources)
2. Regulatory actions affecting cloud, AI, and semiconductors
3. Macro data releases

## Output
- Language: English
- 6–8 topics
- Comment = "why it matters for valuation / sector rotation" in one or two sentences; no buy/sell advice
- Diagram: mindmap grouped by sector

## Exclusions
- Opinion pieces without new facts
- Crypto unless it touches listed companies
```

### 保存する

```
「この分析方針を保存して」 → MCP set_digest_policy
```

または

```bash
node scripts/post.mjs policy:put policy.md
node scripts/post.mjs policy            # 確認
```

### 方針を変えたいとき

「コメントの観点を〜に変えて」「トピック数を 5 にして」と Claude Code に頼む（`get_digest_policy` → 編集 → `set_digest_policy`）。次のルーティン実行から反映される。ルーティン自体の更新は不要。

## 3. 変えないもの

ダイジェストの **見出し形式** `### N. タイトル 【重要度: 高/中/低】` はスキルが固定している（LINE Webhook のトピック抽出と月次棚卸しの集計が依存）。方針で文体や観点を変えても、この形式は維持される。

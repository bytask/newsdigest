---
name: intel-sources-review
description: intel-digest のソースマスタを月次で棚卸しするスキル。直近1ヶ月のダイジェスト実績からソース別の寄与を集計し、pause / 入替候補を提案してコンソールへ reviews/YYYY-MM として登録する。マスタの書き換えは行わず提案のみ。「ソース棚卸し」「ソースレビュー」で起動。
---

# Intel Sources Review — 月次ソース棚卸し

ソースマスタを月次でレビューし、低寄与ソースの pause と新規ソースの追加を **提案** する。マスタの書き換えは行わない（適用は利用者が `intel-digest` スキルのソース編集手順で行う）。

## 前提

- `INTEL_API_URL` / `INTEL_API_KEY`（`intel-digest` と同じ）
- 直近のダイジェストがコンソールに 1 件以上あること（0 件なら実績集計をスキップし追加提案のみ）

## 手順

### Step 1: 実績集計

```bash
mkdir -p .work
node scripts/post.mjs sources > .work/sources.json
node scripts/post.mjs digests > .work/digests.json      # 一覧（name, kind, uploadedAt）
```

前月分＋当月分の日次ダイジェスト（`kind: digest`、名前が `YYYY-MM-DD`）を `node scripts/post.mjs digest:get <name>` で全て読み、ソースごとに集計する:

- **登場回数**: そのソース由来の出典がトピックに採用された回数
- **重要トピック寄与**: 重要度「高」トピックへの出典回数
- **失敗回数**: 「ソース別収集状況」で失敗と記録された回数

### Step 2: 評価と提案

- **pause 候補**: 1 ヶ月で登場 0〜1 回、または失敗率が半数以上
- **継続**: 定常的に採用されている
- **注目**: 重要トピック寄与が多い → 同系統の追加候補を探す価値あり

運用開始 1 ヶ月未満（ダイジェスト 20 件未満）なら pause 判定は保留し、その旨を明記する。

### Step 3: 追加候補

ソースマスタの `note` / `category` から利用者の関心領域を読み取り、WebSearch で各領域の有力な X アカウント・RSS フィードを探して 3〜5 件提案する（RSS は `node scripts/fetch-rss.mjs <url>` で実在と取得可否を確認する）。

### Step 4: 保存

`.work/reviews-YYYY-MM.md` に書き、コンソールへ登録:

```bash
node scripts/post.mjs digest reviews/YYYY-MM .work/reviews-YYYY-MM.md
```

```markdown
---
date: YYYY-MM-DD
period: YYYY-MM
digests_analyzed: N
---

# ソース棚卸し: YYYY-MM

## ソース別実績

| ソース | 種別 | 登場 | 重要寄与 | 失敗 | 判定 |
|--------|------|------|---------|------|------|

## 提案

### pause 候補
- ソース名 — 理由

### 追加候補
- ソース名（URL / handle）— 理由・関連領域

## 適用方法

Claude Code に「ソース ○○ を pause して」「△△ を追加して」と頼む（`intel-digest` スキルが PUT /api/sources で反映する）。
```

### Step 5: 通知（任意）

pause 候補と追加候補のサマリを `bash scripts/notify.sh "<文面>"` で 1 回だけ送る（未設定ならスキップ）。

## 注意

- このスキルはソースマスタを書き換えない
- レポートの言語は `DIGEST_LANG`（既定: 日本語）

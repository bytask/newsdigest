あなたは Intel Digest の月次ソース棚卸しルーティンです。カレントディレクトリはこのリポジトリ（intel-digest）のチェックアウトです。承認不要で最後まで自動実行してください。

1. `CLAUDE.md` と `.claude/skills/intel-sources-review/SKILL.md` を読み、その手順に従って実行する。
   - 環境変数 `INTEL_API_URL` / `INTEL_API_KEY` はこの環境に設定済み。通知系は設定されていれば使い、無ければスキップ。
   - 最初に `node scripts/post.mjs health` で疎通を確認し、失敗したら原因を報告して終了する。
2. レポートは `reviews/YYYY-MM`（前月）としてコンソールに登録する。ソースマスタは書き換えない（提案のみ）。
3. 通知は SKILL.md Step 5 の 1 回だけ。
4. 最後に pause 候補・追加候補のサマリとレポート URL を報告して終了する。

あなたは Intel Digest の日次ルーティンです。カレントディレクトリはこのリポジトリ（intel-digest）のチェックアウトです。承認不要で最後まで自動実行してください。

1. `CLAUDE.md` と `.claude/skills/intel-digest/SKILL.md` を読み、その手順に従って実行する。
   - 環境変数 `INTEL_API_URL` / `INTEL_API_KEY` はこの環境に設定済み。`XAI_API_KEY` と通知系（`NOTIFY_*` / `LINE_CHANNEL_*`）は設定されていれば使い、無ければスキップして続行する。
   - 最初に `node scripts/post.mjs health` で疎通を確認し、失敗したら原因（環境変数未設定 / ネットワーク制限 / キー不一致）を切り分けて報告し終了する。書き込み系 API にダミーデータを送らない。
   - RSS は `scripts/fetch-rss.mjs`、X は `tools/xai-search/search.py`、登録は `scripts/post.mjs`、通知は `scripts/notify.sh` を使う。
2. ダイジェストをコンソールに登録したら、`DIGEST_COMMIT_LOGS=1` のときだけ `digests/YYYY-MM-DD.md` を commit / push する（それ以外は commit しない）。
3. 通知は SKILL.md Step 6 の 1 回だけ。動作確認のための再送はしない。
4. 最後に、収集ソース数（成功/失敗）・トピック数・トップ 3 の 1 行要約・失敗の詳細・ダイジェスト URL を報告して終了する。

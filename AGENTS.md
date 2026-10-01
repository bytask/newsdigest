# newsdigest

日次情報ダイジェストの配布パッケージ（公開 / AGPL-3.0）。AI 実行は利用者の Claude Code ルーティン。

## 開発フロー（tskf `01-operations/playbooks/infra/dev-flow.md`）

- **git 方針**: `pr` — `tskf/<項目 id>` ブランチ → PR → CI が緑なら自分で squash merge（`gh pr checks <PR> --watch --fail-fast && gh pr merge <PR> --squash --delete-branch`。tskf BDR-0024。1 人運用でレビュー相手がいない）
- **デプロイ**: 利用者が自分の Cloudflare account に `npm run console:deploy`。この repo の `deploy-console.yml` は `vars.CONSOLE_AUTO_DEPLOY == 'true'` のときだけ動く（検証環境 `newsdigest-test`）
- **本番デプロイは承認ゲートで止める**（まだ自動化していない）

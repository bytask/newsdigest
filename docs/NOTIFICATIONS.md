# 通知の設定

通知は任意。`scripts/notify.sh` が、設定されている宛先すべてに同じ本文（トップ 3 トピック + ダイジェスト URL）を送る。未設定なら本文を表示してスキップする。

環境変数は claude.ai の **環境**（ルーティン用）と、ローカルの `.env.local`（手動実行用）の両方に置く。

## Slack（Incoming Webhook）

1. https://api.slack.com/apps → Create App → Incoming Webhooks を ON → チャンネルを選んで Webhook URL を発行
2. `NOTIFY_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/…`

## Discord（Webhook）

1. サーバー設定 → 連携サービス → Webhook → 新規作成 → URL をコピー
2. `NOTIFY_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/…`

2000 字を超える本文は自動分割。

## 任意の Webhook

`NOTIFY_WEBHOOK_URL=https://…` に `{"text": "<本文>"}` を POST する。Zapier / Make / 自作 Worker などへ。

## LINE 公式アカウント（Messaging API）

友だち全員に broadcast する（**無料枠 200 通/月 = broadcast 数 × 友だち数** に注意。日次 1 通なら友だち 6 人まで）。

1. https://developers.line.biz/ でプロバイダーと Messaging API チャネルを作成
2. チャネル基本設定の **チャネル ID** と **チャネルシークレット** を控える
3. 環境変数:
   ```
   LINE_CHANNEL_ID=2010xxxxxx
   LINE_CHANNEL_SECRET=…
   ```
4. （任意）トピックをタップして詳細を読む Webhook:
   - Worker secret にも登録: `cd apps/console && npx wrangler secret put LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET`
   - LINE Developers の Webhook URL に `https://<your-worker>.workers.dev/api/line/webhook` を設定し「Webhook の利用」を ON
   - 通知をテキストではなく **トピック一覧の Flex カード**（各行が postback `topic:<date>:<n>`）で送ると、タップで該当トピックの本文がトークに返る。カード送信の例は `docs/NOTIFICATIONS.md` 末尾のスニペット参照
5. （任意）About ページに友だち追加ボタンを出す: `wrangler.jsonc` の `vars` に `LINE_ADD_URL=https://line.me/R/ti/p/@xxxx`

## 動作確認

```bash
NOTIFY_DRY_RUN=1 bash scripts/notify.sh "📡 NewsDigest 2026-08-26 …"   # 送らずに payload 表示
```

`test` / `テスト` / `ping` などの本文はスクリプトが拒否する（動作確認のつもりの本番配信を防ぐ）。

## 送信のルール（スキル側）

- 1 実行につき 1 回だけ送る。手順にない再送はしない
- ダイジェスト本文は「共有チャネルに流れても安全」な内容だけを書く（利用者固有の非公開情報を含めない）

## 付録: LINE トピック一覧カード（Flex）の例

```bash
# .work/card.json を作って broadcast する（notify.sh はテキスト専用なので別送）
TOKEN=$(curl -s -X POST https://api.line.me/oauth2/v3/token -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$LINE_CHANNEL_ID&client_secret=$LINE_CHANNEL_SECRET" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')
curl -s -X POST https://api.line.me/v2/bot/message/broadcast -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @.work/card.json
```

```json
{"messages":[{"type":"flex","altText":"📡 NewsDigest 2026-08-26","contents":{"type":"bubble",
 "header":{"type":"box","layout":"vertical","contents":[{"type":"text","text":"📡 NewsDigest 2026-08-26","weight":"bold","size":"md"}]},
 "body":{"type":"box","layout":"vertical","spacing":"sm","contents":[
   {"type":"box","layout":"horizontal","action":{"type":"postback","data":"topic:2026-08-26:1"},"contents":[{"type":"text","text":"1. トピック名","size":"sm","wrap":true,"flex":5},{"type":"text","text":"高","size":"xs","color":"#DC2626","align":"end","flex":1}]}
 ]},
 "footer":{"type":"box","layout":"vertical","contents":[{"type":"button","style":"link","action":{"type":"uri","label":"Web で見る","uri":"https://<your-worker>.workers.dev/d/2026-08-26"}}]}}}]}
```

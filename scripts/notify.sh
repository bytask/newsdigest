#!/usr/bin/env bash
# 通知の共通スクリプト。設定されている宛先すべてに同じ本文を送る。
#   scripts/notify.sh "本文"        /  echo "本文" | scripts/notify.sh
# 宛先（環境変数。.env.local / .env からも読む）:
#   NOTIFY_SLACK_WEBHOOK_URL    Slack Incoming Webhook（{"text": ...}）
#   NOTIFY_DISCORD_WEBHOOK_URL  Discord Webhook（{"content": ...}、2000字で分割）
#   NOTIFY_WEBHOOK_URL          任意の Webhook（{"text": ...} を POST）
#   LINE_CHANNEL_ID + LINE_CHANNEL_SECRET   LINE 公式アカウントへ broadcast（Messaging API）
# どれも未設定なら本文を表示して exit 0（通知は任意機能なのでジョブを止めない）。
# 動作確認は NOTIFY_DRY_RUN=1 を付ける（送らずに payload を表示）。
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

# .env.local → .env（未設定の変数だけ埋める）
for f in "$ROOT/.env.local" "$ROOT/.env"; do
  [ -f "$f" ] || continue
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    k="${line%%=*}"; v="${line#*=}"; v="${v%\"}"; v="${v#\"}"
    [ -n "$k" ] && [ -z "${!k:-}" ] && export "$k=$v"
  done < "$f"
done

TEXT="${1:-$(cat)}"
[ -n "$TEXT" ] || { echo "notify: empty text" >&2; exit 1; }

# ダミー入力ガード: 「疎通確認」のつもりの送信が実配信される事故を防ぐ
case "$(printf %s "$TEXT" | tr '[:upper:]' '[:lower:]')" in
  test|test1|testing|テスト|dummy|probe|sample|hello|ping)
    echo "notify: '$TEXT' はテスト入力とみなし送信しません。動作確認は NOTIFY_DRY_RUN=1 を使ってください" >&2
    exit 2 ;;
esac

json_text() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' -- "$1"; }
sent=0; failed=0

post_json() { # url payload
  if [ "${NOTIFY_DRY_RUN:-}" = "1" ]; then echo "notify: DRY RUN → $1"; echo "$2"; return 0; fi
  local http
  http=$(curl -s -o /tmp/notify-resp.txt -w "%{http_code}" -X POST "$1" -H "Content-Type: application/json" --data-binary "$2")
  case "$http" in 2*) return 0 ;; esac
  echo "notify: HTTP $http $(head -c 300 /tmp/notify-resp.txt)" >&2; return 1
}

if [ -n "${NOTIFY_SLACK_WEBHOOK_URL:-}" ]; then
  post_json "$NOTIFY_SLACK_WEBHOOK_URL" "{\"text\":$(json_text "$TEXT")}" && sent=$((sent+1)) || failed=$((failed+1))
fi
if [ -n "${NOTIFY_WEBHOOK_URL:-}" ]; then
  post_json "$NOTIFY_WEBHOOK_URL" "{\"text\":$(json_text "$TEXT")}" && sent=$((sent+1)) || failed=$((failed+1))
fi
if [ -n "${NOTIFY_DISCORD_WEBHOOK_URL:-}" ]; then
  # Discord は 2000 字制限。超えるときは分割送信
  node -e '
    const t = process.argv[1]; const out = [];
    for (let i = 0; i < t.length; i += 1900) out.push(t.slice(i, i + 1900));
    process.stdout.write(out.map((c) => JSON.stringify({ content: c })).join("\n"));
  ' -- "$TEXT" | while IFS= read -r payload; do
    post_json "$NOTIFY_DISCORD_WEBHOOK_URL" "$payload" || exit 1
  done && sent=$((sent+1)) || failed=$((failed+1))
fi
if [ -n "${LINE_CHANNEL_ID:-}" ] && [ -n "${LINE_CHANNEL_SECRET:-}" ]; then
  payload="{\"messages\":[{\"type\":\"text\",\"text\":$(json_text "${TEXT:0:4900}")}]}"
  if [ "${NOTIFY_DRY_RUN:-}" = "1" ]; then
    echo "notify: DRY RUN → LINE broadcast"; echo "$payload"; sent=$((sent+1))
  else
    token=$(curl -s -X POST https://api.line.me/oauth2/v3/token -H "Content-Type: application/x-www-form-urlencoded" \
      -d "grant_type=client_credentials&client_id=${LINE_CHANNEL_ID}&client_secret=${LINE_CHANNEL_SECRET}" \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).access_token||"")}catch{}})')
    if [ -z "$token" ]; then echo "notify: LINE token error" >&2; failed=$((failed+1))
    else
      http=$(curl -s -o /tmp/notify-resp.txt -w "%{http_code}" -X POST https://api.line.me/v2/bot/message/broadcast \
        -H "Authorization: Bearer $token" -H "Content-Type: application/json" --data-binary "$payload")
      case "$http" in 200) sent=$((sent+1)) ;; *) echo "notify: LINE HTTP $http $(head -c 300 /tmp/notify-resp.txt)" >&2; failed=$((failed+1)) ;; esac
    fi
  fi
fi

if [ $sent -eq 0 ] && [ $failed -eq 0 ]; then
  echo "notify: 通知先が未設定のためスキップしました（NOTIFY_* / LINE_CHANNEL_* を設定すると送信されます）"
  echo "----"; printf '%s\n' "$TEXT"
  exit 0
fi
echo "notify: sent=$sent failed=$failed"
[ $failed -eq 0 ]

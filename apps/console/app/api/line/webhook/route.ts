import { NextRequest, NextResponse } from "next/server";
import { getDigest } from "@/lib/store";

export const dynamic = "force-dynamic";

// LINE 公式アカウントの Webhook（任意機能）。
// 通知でトピック一覧カードを配信したとき、項目タップ（postback: "topic:<date>:<idx>"）を受けて
// 該当トピックの詳細をトークに返信する。
// 必要 secrets: LINE_CHANNEL_ID / LINE_CHANNEL_SECRET（Messaging API チャネル）
// LINE Developers コンソールの Webhook URL に https://<your-worker>/api/line/webhook を設定する。

async function hmacBase64(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function accessToken(id: string, secret: string): Promise<string> {
  const res = await fetch("https://api.line.me/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${id}&client_secret=${secret}`,
  });
  return ((await res.json()) as { access_token: string }).access_token;
}

// digest markdown から「### N. タイトル」のセクションを抜き出す
function extractTopic(md: string, idx: number): { title: string; body: string } | null {
  const sections = md.split(/^###\s+/m).slice(1);
  for (const sec of sections) {
    const lines = sec.split("\n");
    const head = lines[0].trim();
    const m = head.match(/^(\d+)\.\s*(.+)$/);
    if (!m || Number(m[1]) !== idx) continue;
    const body = lines
      .slice(1)
      .join("\n")
      .split(/^##\s+/m)[0] // 次のH2（ソース別収集状況等）が混ざらないように
      .replace(/\*\*/g, "")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1\n$2") // リンクはテキスト+URL行（LINEでタップ可能）
      .replace(/^- /gm, "・")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { title: m[2].trim(), body };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const id = process.env.LINE_CHANNEL_ID;
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!id || !secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const body = await req.text();
  const sig = req.headers.get("x-line-signature");
  if (!sig || sig !== (await hmacBase64(secret, body))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const { events } = JSON.parse(body) as {
    events: { type: string; replyToken?: string; postback?: { data: string } }[];
  };

  for (const ev of events ?? []) {
    if (ev.type !== "postback" || !ev.replyToken || !ev.postback) continue;
    const m = ev.postback.data.match(/^topic:([\w-]+):(\d+)$/);
    if (!m) continue;
    const md = await getDigest(m[1]);
    const topic = md && extractTopic(md, Number(m[2]));
    const text = topic
      ? `【${topic.title}】\n\n${topic.body}`.slice(0, 4900)
      : "該当トピックが見つかりませんでした。";
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken(id, secret)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ replyToken: ev.replyToken, messages: [{ type: "text", text }] }),
    });
  }
  return NextResponse.json({ ok: true });
}

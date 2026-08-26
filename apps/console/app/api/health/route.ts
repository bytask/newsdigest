import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

// 認証不要のヘルスチェック。セットアップ直後の疎通確認・ルーティンの死活確認用。
// D1 が到達可能かと、API キーが設定済みかだけを返す（値は返さない）。
export async function GET() {
  const { env } = getCloudflareContext();
  const e = env as { DB?: D1Database };
  let db: "ok" | "error" = "ok";
  let digests = 0;
  try {
    const row = await e.DB?.prepare("SELECT count(*) AS n FROM digests").first<{ n: number }>();
    digests = row?.n ?? 0;
  } catch {
    db = "error";
  }
  return NextResponse.json({
    ok: db === "ok",
    db,
    digests,
    api_key_configured: Boolean(process.env.INTEL_API_KEY),
    line_webhook_configured: Boolean(process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET),
  });
}

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

// 認証不要のヘルスチェック。セットアップ直後の疎通確認・ルーティンの死活確認用。
// D1 到達性、設定の有無（値は返さない）、ソース数・ダイジェスト数を返す。
export async function GET() {
  const { env } = getCloudflareContext();
  const e = env as { DB?: D1Database };
  let db: "ok" | "error" = "ok";
  let digests = 0, sources_active = 0, policy_configured = false;
  try {
    const [d, s, p] = await Promise.all([
      e.DB!.prepare("SELECT count(*) AS n FROM digests").first<{ n: number }>(),
      e.DB!.prepare("SELECT count(*) AS n FROM sources WHERE status = 'active'").first<{ n: number }>(),
      e.DB!.prepare("SELECT length(value) AS n FROM meta WHERE key = 'digest_policy'").first<{ n: number }>(),
    ]);
    digests = d?.n ?? 0; sources_active = s?.n ?? 0; policy_configured = (p?.n ?? 0) > 0;
  } catch {
    db = "error";
  }
  return NextResponse.json({
    ok: db === "ok",
    db,
    digests,
    sources_active,
    policy_configured,
    api_key_configured: Boolean(process.env.NEWSDIGEST_API_KEY),
    line_webhook_configured: Boolean(process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET),
    mcp: "/mcp",
  });
}

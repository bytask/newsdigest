import { NextRequest, NextResponse } from "next/server";
import { authenticate, requireScope } from "@/lib/auth";
import { getSources } from "@/lib/store";
import { fetchFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";

// GET /api/fetch?url=<feed>&hours=24&limit=15  [read]
// ソースマスタに登録済みの RSS / releases.atom だけをコンソール経由で取得する（オープンプロキシにしない）。
// ルーティンの実行環境が egress 制限つきのとき、scripts/fetch-rss.mjs が自動でここにフォールバックする。
// 1 リクエスト = 1 フィード（Workers の CPU 制限内に収めるため。並列は呼ぶ側が行う）。
export async function GET(req: NextRequest) {
  const denied = requireScope(await authenticate(req), "read");
  if (denied) return denied;
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const hours = Math.max(1, Math.min(24 * 30, Number(req.nextUrl.searchParams.get("hours") ?? 24) || 24));
  const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("limit") ?? 15) || 15));
  if (!/^https?:\/\//.test(url)) return NextResponse.json({ error: "url required" }, { status: 400 });
  const doc = await getSources();
  const src = [...doc.sources.rss.map((r) => ({ url: r.url, title: r.title, kind: "rss" as const })), ...doc.sources.releases.map((r) => ({ url: r.url, title: r.repo, kind: "release" as const }))]
    .find((s) => s.url === url);
  if (!src) return NextResponse.json({ error: "url is not a registered source (add it with add_source first)" }, { status: 403 });
  const r = await fetchFeed(src, { hours, limit });
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}

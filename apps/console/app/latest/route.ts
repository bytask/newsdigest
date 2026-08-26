import { NextRequest, NextResponse } from "next/server";
import { listDigests } from "@/lib/store";

export const dynamic = "force-dynamic";

// 最新ダイジェストへのリダイレクト。?prefix=inbox 等で名前空間を絞れる。
// LINEリッチメニュー等、静的URLから「常に最新」を開く用途（2026-08-08）。
export async function GET(req: NextRequest) {
  const prefix = req.nextUrl.searchParams.get("prefix") ?? "";
  const digests = await listDigests();
  const hit = digests
    .filter((d) => (prefix ? d.name.startsWith(`${prefix}/`) : !d.name.includes("/")))
    .sort((a, b) => b.name.localeCompare(a.name))[0];
  if (!hit) return new NextResponse("not found", { status: 404 });
  return NextResponse.redirect(new URL(`/d/${hit.name}`, req.url));
}

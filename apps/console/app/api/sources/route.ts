import { NextRequest, NextResponse } from "next/server";
import { authenticate, requireScope } from "@/lib/auth";
import { getSources, putSources, type SourcesDoc } from "@/lib/store";

export const dynamic = "force-dynamic";

// VPS収集パイプライン用: ソースマスタ取得
export async function GET(req: NextRequest) {
  const denied = requireScope(await authenticate(req), "read");
  if (denied) return denied;
  return NextResponse.json(await getSources());
}

// ソースマスタ全置換（棚卸し適用や外部同期用）
export async function PUT(req: NextRequest) {
  const denied = requireScope(await authenticate(req), "manage");
  if (denied) return denied;
  const doc = (await req.json()) as SourcesDoc;
  if (!doc?.sources) return NextResponse.json({ error: "invalid sources doc" }, { status: 400 });
  await putSources(doc);
  return NextResponse.json({ ok: true });
}

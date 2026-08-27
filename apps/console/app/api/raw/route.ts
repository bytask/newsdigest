import { NextRequest, NextResponse } from "next/server";
import { authenticate, requireScope } from "@/lib/auth";
import { listRaw, putRaw, type RawCollection } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireScope(await authenticate(req), "read");
  if (denied) return denied;
  return NextResponse.json(await listRaw());
}

// VPS収集パイプライン用: 収集生データ登録（RawCollection そのまま）
export async function POST(req: NextRequest) {
  const denied = requireScope(await authenticate(req), "write");
  if (denied) return denied;
  const data = (await req.json()) as RawCollection;
  if (!data?.date || !Array.isArray(data.items))
    return NextResponse.json({ error: "date and items required" }, { status: 400 });
  await putRaw(data.date, data);
  return NextResponse.json({ ok: true, date: data.date, items: data.items.length });
}

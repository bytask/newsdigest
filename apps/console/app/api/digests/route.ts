import { NextRequest, NextResponse } from "next/server";
import { authenticate, requireScope } from "@/lib/auth";
import { listDigests, putDigest } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireScope(await authenticate(req), "read");
  if (denied) return denied;
  return NextResponse.json(await listDigests());
}

// VPS収集パイプライン用: ダイジェスト登録 { name: "2026-07-07" | "reviews/2026-07", markdown: "..." }
export async function POST(req: NextRequest) {
  const denied = requireScope(await authenticate(req), "write");
  if (denied) return denied;
  const { name, markdown } = (await req.json()) as { name?: string; markdown?: string };
  if (!name || !markdown) return NextResponse.json({ error: "name and markdown required" }, { status: 400 });
  await putDigest(name, markdown);
  return NextResponse.json({ ok: true, name });
}

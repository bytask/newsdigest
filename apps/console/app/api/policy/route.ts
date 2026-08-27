import { NextRequest, NextResponse } from "next/server";
import { authenticate, requireScope } from "@/lib/auth";
import { getPolicy, setPolicy } from "@/lib/store";

export const dynamic = "force-dynamic";

// 分析方針（ダイジェストの作り方）。利用者が設定し、ルーティンが読む。
// GET  → text/markdown（未設定なら 204）
// PUT  → { "markdown": "..." } または text/markdown ボディ
export async function GET(req: NextRequest) {
  const denied = requireScope(await authenticate(req), "read");
  if (denied) return denied;
  const p = await getPolicy();
  if (!p) return new NextResponse(null, { status: 204 });
  return new NextResponse(p, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}

export async function PUT(req: NextRequest) {
  const denied = requireScope(await authenticate(req), "manage");
  if (denied) return denied;
  const ct = req.headers.get("content-type") ?? "";
  let md = "";
  if (ct.includes("application/json")) md = ((await req.json()) as { markdown?: string }).markdown ?? "";
  else md = await req.text();
  if (md.trim().length < 20) return NextResponse.json({ error: "markdown too short (>= 20 chars)" }, { status: 400 });
  await setPolicy(md);
  return NextResponse.json({ ok: true, length: md.length });
}

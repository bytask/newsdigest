import { NextRequest, NextResponse } from "next/server";
import { authenticate, requireScope } from "@/lib/auth";
import { revokeApiKey } from "@/lib/store";

export const dynamic = "force-dynamic";

// 失効（行は残す）。
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireScope(await authenticate(req), "admin");
  if (denied) return denied;
  const { id } = await ctx.params;
  const ok = await revokeApiKey(id);
  return ok ? NextResponse.json({ ok: true, id, revoked: true }) : NextResponse.json({ error: "not found or already revoked" }, { status: 404 });
}

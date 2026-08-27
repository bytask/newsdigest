import { NextRequest, NextResponse } from "next/server";
import { authenticate, requireScope } from "@/lib/auth";
import { getDigest } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ name: string[] }> }) {
  const denied = requireScope(await authenticate(req), "read");
  if (denied) return denied;
  const { name } = await ctx.params;
  const md = await getDigest(name.join("/"));
  if (md === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(md, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}

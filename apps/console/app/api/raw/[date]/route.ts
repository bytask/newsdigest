import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth";
import { getRaw } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ date: string }> }) {
  const denied = requireApiKey(req);
  if (denied) return denied;
  const { date } = await ctx.params;
  const data = await getRaw(date);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

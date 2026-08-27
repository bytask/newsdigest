import { NextRequest, NextResponse } from "next/server";
import { sessionClearCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const headers = new Headers({ "Set-Cookie": sessionClearCookie(), "Cache-Control": "no-store" });
  const isForm = !(req.headers.get("content-type") ?? "").includes("application/json");
  if (isForm) return NextResponse.redirect(new URL("/login", req.url), { status: 303, headers });
  return NextResponse.json({ ok: true }, { headers });
}

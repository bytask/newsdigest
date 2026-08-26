import { NextRequest, NextResponse } from "next/server";

// 機械向けAPI（VPSパイプライン等）の Bearer 認証
export function requireApiKey(req: NextRequest): NextResponse | null {
  const key = process.env.NEWSDIGEST_API_KEY;
  if (!key) return NextResponse.json({ error: "NEWSDIGEST_API_KEY not configured" }, { status: 503 });
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${key}`) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

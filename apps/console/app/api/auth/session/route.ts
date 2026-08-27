import { NextRequest, NextResponse } from "next/server";
import { authenticate, principalInfo } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 「今の資格情報は誰か」。Bearer でも Cookie でも使える。未認証でも 200 で authenticated:false（UI の状態確認用）。
export async function GET(req: NextRequest) {
  const p = await authenticate(req);
  return NextResponse.json(p ? { authenticated: true, ...principalInfo(p) } : { authenticated: false }, { headers: { "Cache-Control": "no-store" } });
}

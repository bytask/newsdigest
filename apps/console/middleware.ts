import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isPublicUi, verifySessionValue } from "@/lib/session";

// 閲覧 UI のゲート。セッション Cookie が無ければ /login へ。
// /api/* と /mcp* は各ルートが自分で認証する（Bearer / Cookie）。/login と静的ファイルは素通り。
// wrangler.jsonc の vars.PUBLIC_UI = "1" で UI を公開（v0.1 と同じ挙動）にできる。/settings だけは常にログイン必須（ページ側で確認）。
export const config = {
  matcher: ["/((?!api/|mcp|_next/|login|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};

export async function middleware(req: NextRequest) {
  if (isPublicUi()) return NextResponse.next();
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && (await verifySessionValue(cookie))) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

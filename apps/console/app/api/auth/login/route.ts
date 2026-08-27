import { NextRequest, NextResponse } from "next/server";
import { SCOPES, verifyPassword } from "@/lib/auth";
import { allowLoginAttempt, getPasswordHash } from "@/lib/store";
import { createSessionValue, sessionSetCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

// パスワードログイン → HttpOnly セッション Cookie。
// フォーム（/login）からは application/x-www-form-urlencoded、スクリプトからは JSON { password } を受ける。
// 失敗はフォームなら /login?error=... へ 303、JSON なら 4xx。IP ごとに 10 回/10 分のレートリミット。

function safeNext(n: string | null | undefined): string {
  if (!n || !n.startsWith("/") || n.startsWith("//") || n.startsWith("/api") || n.startsWith("/login")) return "/";
  return n;
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";
  const isForm = !ct.includes("application/json");
  let password = "", next = "/";
  if (isForm) {
    const fd = await req.formData();
    password = String(fd.get("password") ?? "");
    next = safeNext(String(fd.get("next") ?? "/"));
  } else {
    const b = (await req.json().catch(() => ({}))) as { password?: string; next?: string };
    password = b.password ?? "";
    next = safeNext(b.next);
  }

  const fail = (status: number, code: string) => {
    if (isForm) {
      const u = new URL("/login", req.url);
      u.searchParams.set("error", code);
      if (next !== "/") u.searchParams.set("next", next);
      return NextResponse.redirect(u, 303);
    }
    return NextResponse.json({ ok: false, error: code }, { status, headers: { "Cache-Control": "no-store" } });
  };

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown";
  if (!(await allowLoginAttempt(ip))) return fail(429, "rate_limited");
  const stored = await getPasswordHash();
  if (!stored) return fail(503, "password_not_configured");
  if (!password || !(await verifyPassword(password, stored))) return fail(401, "invalid_password");

  const value = await createSessionValue(SCOPES);
  if (!value) return fail(503, "session_secret_missing");
  const headers = new Headers({ "Set-Cookie": sessionSetCookie(value), "Cache-Control": "no-store" });
  if (isForm) return NextResponse.redirect(new URL(next, req.url), { status: 303, headers });
  return NextResponse.json({ ok: true, next }, { headers });
}

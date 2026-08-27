import { NextRequest, NextResponse } from "next/server";
import { authenticate, hashPassword, requireScope, verifyPassword } from "@/lib/auth";
import { getPasswordHash, setPasswordHash } from "@/lib/store";

export const dynamic = "force-dynamic";

// UI パスワードの設定・変更（admin スコープ）。
// セッション（ブラウザ）からの変更は current_password が必要。API キー / ブートストラップ鍵からはリセット扱いで不要。
async function handler(req: NextRequest) {
  const p = await authenticate(req);
  const denied = requireScope(p, "admin");
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { password?: string; current_password?: string };
  const password = b.password ?? "";
  if (password.length < 8) return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  if (password.length > 200) return NextResponse.json({ error: "password too long" }, { status: 400 });
  if (p!.kind === "session") {
    const stored = await getPasswordHash();
    if (stored && !(await verifyPassword(b.current_password ?? "", stored)))
      return NextResponse.json({ error: "current_password mismatch" }, { status: 403 });
  }
  await setPasswordHash(await hashPassword(password));
  return NextResponse.json({ ok: true, by: p!.name }, { headers: { "Cache-Control": "no-store" } });
}

export { handler as PUT, handler as POST };

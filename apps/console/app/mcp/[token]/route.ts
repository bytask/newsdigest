import { NextRequest, NextResponse } from "next/server";
import { handleMcp } from "@/lib/mcp";
import { authenticate } from "@/lib/auth";

export const dynamic = "force-dynamic";

// MCP（Streamable HTTP）: URL パスに API キーを含める版。
// claude.ai のカスタムコネクタなど、Authorization ヘッダを設定できないクライアント用。
//   https://<worker>/mcp/<read 専用 API キー>
// URL 自体が秘密になるので、read スコープだけの鍵しか受け付けない（write/manage/admin を持つ鍵は 401）。
async function handler(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!process.env.NEWSDIGEST_API_KEY) return NextResponse.json({ error: "NEWSDIGEST_API_KEY not configured" }, { status: 503 });
  const p = await authenticate(req, { pathToken: token });
  if (!p) {
    return NextResponse.json(
      { error: "unauthorized", hint: "path token must be an API key with the 'read' scope only; use the Authorization header for other keys" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const res = await handleMcp(req, p);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export { handler as GET, handler as POST, handler as DELETE };

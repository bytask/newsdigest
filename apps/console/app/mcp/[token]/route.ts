import { NextRequest, NextResponse } from "next/server";
import { handleMcp, mcpAuthorized } from "@/lib/mcp";

export const dynamic = "force-dynamic";

// MCP（Streamable HTTP）: URL パスにトークンを含める版。
// claude.ai のカスタムコネクタなど、Authorization ヘッダを設定できないクライアント用。
//   https://<worker>/mcp/<NEWSDIGEST_API_KEY>
// URL 自体が秘密になるので、共有しない・ログに残さないこと。
async function handler(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!process.env.NEWSDIGEST_API_KEY) return NextResponse.json({ error: "NEWSDIGEST_API_KEY not configured" }, { status: 503 });
  if (!mcpAuthorized(req, token)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return handleMcp(req);
}

export { handler as GET, handler as POST, handler as DELETE };

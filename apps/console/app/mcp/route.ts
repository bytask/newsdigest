import { NextRequest, NextResponse } from "next/server";
import { handleMcp } from "@/lib/mcp";
import { authenticate } from "@/lib/auth";

export const dynamic = "force-dynamic";

// MCP（Streamable HTTP）: Authorization: Bearer <API キー>（Settings で発行。ブートストラップ鍵も可）
// Claude Code: claude mcp add --transport http newsdigest https://<worker>/mcp --header "Authorization: Bearer <key>"
async function handler(req: NextRequest) {
  if (!process.env.NEWSDIGEST_API_KEY) return NextResponse.json({ error: "NEWSDIGEST_API_KEY not configured" }, { status: 503 });
  const p = await authenticate(req);
  if (!p || p.via === "cookie") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="newsdigest"', "Cache-Control": "no-store" } });
  }
  return handleMcp(req, p);
}

export { handler as GET, handler as POST, handler as DELETE };

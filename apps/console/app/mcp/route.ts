import { NextRequest, NextResponse } from "next/server";
import { handleMcp, mcpAuthorized } from "@/lib/mcp";

export const dynamic = "force-dynamic";

// MCP（Streamable HTTP）: Authorization: Bearer <NEWSDIGEST_API_KEY>
// Claude Code: claude mcp add --transport http newsdigest https://<worker>/mcp --header "Authorization: Bearer <key>"
async function handler(req: NextRequest) {
  if (!process.env.NEWSDIGEST_API_KEY) return NextResponse.json({ error: "NEWSDIGEST_API_KEY not configured" }, { status: 503 });
  if (!mcpAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="newsdigest"' } });
  }
  return handleMcp(req);
}

export { handler as GET, handler as POST, handler as DELETE };

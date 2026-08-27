import { NextRequest, NextResponse } from "next/server";
import { authenticate, parseScopes, requireScope } from "@/lib/auth";
import { createApiKey, listApiKeys } from "@/lib/store";

export const dynamic = "force-dynamic";

// API キー管理（admin スコープ）。MCP には載せない（鍵の発行を LLM ツールにしない）。
export async function GET(req: NextRequest) {
  const denied = requireScope(await authenticate(req), "admin");
  if (denied) return denied;
  return NextResponse.json(await listApiKeys(), { headers: { "Cache-Control": "no-store" } });
}

// POST { name, scopes: ["read","write"], expires_at?: "YYYY-MM-DD" } → 平文の鍵はこの応答にだけ載る
export async function POST(req: NextRequest) {
  const denied = requireScope(await authenticate(req), "admin");
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { name?: string; scopes?: string[] | string; expires_at?: string | null };
  const name = (b.name ?? "").trim();
  if (!name || name.length > 40) return NextResponse.json({ error: "name required (<= 40 chars)" }, { status: 400 });
  const scopes = [...parseScopes(b.scopes ?? [])];
  if (scopes.length === 0) return NextResponse.json({ error: "scopes required: read | write | manage | admin" }, { status: 400 });
  let expires: string | null = null;
  if (b.expires_at) {
    if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(b.expires_at)) return NextResponse.json({ error: "expires_at must be YYYY-MM-DD" }, { status: 400 });
    expires = b.expires_at.length === 10 ? `${b.expires_at}T23:59:59Z` : b.expires_at;
  }
  const k = await createApiKey(name, scopes, expires);
  const base = new URL(req.url).origin;
  const readOnly = scopes.length === 1 && scopes[0] === "read";
  return NextResponse.json({
    ok: true, ...k,
    hints: {
      mcp_add_command: `claude mcp add --transport http newsdigest ${base}/mcp --header "Authorization: Bearer ${k.key}"`,
      connector_url: readOnly ? `${base}/mcp/${k.key}` : null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

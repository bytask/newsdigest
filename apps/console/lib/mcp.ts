// NewsDigest MCP サーバー（Streamable HTTP、ステートレス、依存ゼロ）。
// Claude Code / claude.ai から「ソースの追加・削除・pause」「ダイジェスト取得」「生データ取得」「分析方針の読み書き」を行う。
// エンドポイント: POST /mcp（Bearer NEWSDIGEST_API_KEY） / POST /mcp/<NEWSDIGEST_API_KEY>（claude.ai コネクタ用・ヘッダ不要）
import {
  addSource, getDigest, getLatestDigestName, getPolicy, getRaw, getSources, listDigests, listRaw,
  removeSource, setPolicy, updateSource, SOURCE_KINDS, type SourceKind,
} from "./store";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

interface JsonRpcReq { jsonrpc: "2.0"; id?: number | string | null; method: string; params?: Record<string, unknown> }

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const text = (s: string, isError = false): ToolResult => ({ content: [{ type: "text", text: s }], isError });
const json = (v: unknown): ToolResult => text(JSON.stringify(v, null, 2));

const kindSchema = { type: "string", enum: SOURCE_KINDS, description: "x_account（Xアカウント）/ x_trend（X検索クエリ）/ rss（RSS/Atom URL）/ release（GitHub リリース: owner/name）" };

export const TOOLS = [
  {
    name: "list_sources",
    description: "ソースマスタを一覧する。kind / status で絞り込める。",
    inputSchema: { type: "object", properties: { kind: kindSchema, status: { type: "string", enum: ["active", "paused"] } } },
  },
  {
    name: "add_source",
    description: "ソースを追加する（同じものがあれば note/status 等を更新）。x_account は handle（@なし可）、x_trend は自然文の検索クエリ、rss は URL、release は \"owner/name\"。",
    inputSchema: {
      type: "object", required: ["kind", "value"],
      properties: {
        kind: kindSchema,
        value: { type: "string", description: "handle / query / url / owner-name" },
        title: { type: "string", description: "rss の表示名（省略時は URL）" },
        category: { type: "string", description: "任意のカテゴリ（例: ai, business）" },
        note: { type: "string", description: "なぜ追加したか・何を期待するか（棚卸しの判断材料）" },
        status: { type: "string", enum: ["active", "paused"], description: "既定 active" },
      },
    },
  },
  {
    name: "update_source",
    description: "ソースの status（active/paused）や note を変更する。削除ではなく pause を推奨（履歴が残る）。",
    inputSchema: {
      type: "object", required: ["kind", "value"],
      properties: { kind: kindSchema, value: { type: "string" }, status: { type: "string", enum: ["active", "paused"] }, note: { type: "string" }, title: { type: "string" }, category: { type: "string" } },
    },
  },
  {
    name: "remove_source",
    description: "ソースを完全に削除する。通常は update_source で paused にする方がよい。",
    inputSchema: { type: "object", required: ["kind", "value"], properties: { kind: kindSchema, value: { type: "string" } } },
  },
  {
    name: "get_digest_policy",
    description: "分析方針（ダイジェストの作り方: 関心領域・トピック数・言語・コメントの観点など）を Markdown で取得する。空ならまだ設定されていない。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_digest_policy",
    description: "分析方針を Markdown で保存する（全置換）。ルーティンはこれを読んでダイジェストを作る。",
    inputSchema: { type: "object", required: ["markdown"], properties: { markdown: { type: "string" } } },
  },
  {
    name: "list_digests",
    description: "ダイジェストの一覧（新しい順）。name は YYYY-MM-DD（日次）または reviews/YYYY-MM（月次棚卸し）。",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 200, description: "既定 30" } } },
  },
  {
    name: "get_digest",
    description: "ダイジェスト本文（Markdown）を取得する。name 省略時は最新の日次ダイジェスト。",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "YYYY-MM-DD / reviews/YYYY-MM。省略で最新" } } },
  },
  {
    name: "list_raw_dates",
    description: "生データ（要約前の収集アイテム）がある日付と件数の一覧。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_raw_items",
    description: "指定日の生データ（収集した全アイテム）を取得する。kind / source（部分一致）/ limit で絞り込める。失敗したソースも返す。",
    inputSchema: {
      type: "object", required: ["date"],
      properties: { date: { type: "string", description: "YYYY-MM-DD" }, kind: { type: "string", enum: ["rss", "x_account", "x_trend", "release"] }, source: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 2000 } },
    },
  },
];

async function callTool(name: string, a: Record<string, unknown>): Promise<ToolResult> {
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);
  switch (name) {
    case "list_sources": {
      const doc = await getSources();
      const kind = s("kind"); const status = s("status");
      const rows: Record<string, unknown>[] = [];
      for (const x of doc.sources.x_accounts) rows.push({ kind: "x_account", value: x.handle, note: x.note, added: x.added, status: x.status });
      for (const x of doc.sources.x_trends) rows.push({ kind: "x_trend", value: x.query, note: x.note, added: x.added, status: x.status });
      for (const x of doc.sources.rss) rows.push({ kind: "rss", value: x.url, title: x.title, category: x.category, note: x.note, added: x.added, status: x.status });
      for (const x of doc.sources.releases) rows.push({ kind: "release", value: x.repo, url: x.url, note: x.note, added: x.added, status: x.status });
      const out = rows.filter((r) => (!kind || r.kind === kind) && (!status || r.status === status));
      return json({ count: out.length, review: doc.review, sources: out });
    }
    case "add_source": {
      const r = await addSource({ kind: s("kind") as SourceKind, value: s("value") ?? "", title: s("title"), category: s("category"), note: s("note"), status: s("status") as "active" | "paused" | undefined });
      return json({ ok: true, created: r.created, kind: r.kind, value: r.value, title: r.title });
    }
    case "update_source": {
      const ok = await updateSource(s("kind") as SourceKind, s("value") ?? "", { status: s("status") as "active" | "paused" | undefined, note: s("note"), title: s("title"), category: s("category") });
      return ok ? json({ ok: true }) : text("not found", true);
    }
    case "remove_source": {
      const ok = await removeSource(s("kind") as SourceKind, s("value") ?? "");
      return ok ? json({ ok: true, removed: true }) : text("not found", true);
    }
    case "get_digest_policy": {
      const p = await getPolicy();
      return text(p || "(分析方針は未設定です。set_digest_policy で設定してください。書き方の例: docs/SOURCES-AND-POLICY.md)");
    }
    case "set_digest_policy": {
      const md = s("markdown") ?? "";
      if (md.trim().length < 20) return text("markdown が短すぎます（20文字以上）", true);
      await setPolicy(md);
      return json({ ok: true, length: md.length });
    }
    case "list_digests": return json(await listDigests(typeof a.limit === "number" ? a.limit : 30));
    case "get_digest": {
      const name = s("name") || (await getLatestDigestName());
      if (!name) return text("ダイジェストがまだありません", true);
      if (!/^([\w-]+\/)?[\w-]+$/.test(name)) return text(`invalid name: ${name}`, true);
      const md = await getDigest(name);
      return md === null ? text(`not found: ${name}`, true) : text(md);
    }
    case "list_raw_dates": return json(await listRaw());
    case "get_raw_items": {
      const date = s("date") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return text("date は YYYY-MM-DD", true);
      const r = await getRaw(date, { kind: s("kind"), source: s("source"), limit: typeof a.limit === "number" ? a.limit : undefined });
      return r ? json(r) : text(`no raw items for ${date}`, true);
    }
    default: return text(`unknown tool: ${name}`, true);
  }
}

const rpcError = (id: JsonRpcReq["id"], code: number, message: string) =>
  ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function handleMcp(req: Request): Promise<Response> {
  if (req.method === "GET") return new Response("SSE stream not supported; use POST", { status: 405, headers: { Allow: "POST, DELETE" } });
  if (req.method === "DELETE") return new Response(null, { status: 200 });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let body: JsonRpcReq | JsonRpcReq[];
  try { body = (await req.json()) as JsonRpcReq | JsonRpcReq[]; }
  catch { return Response.json(rpcError(null, -32700, "parse error"), { status: 400 }); }

  const msgs = Array.isArray(body) ? body : [body];
  const responses: unknown[] = [];
  for (const m of msgs) {
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") { responses.push(rpcError(m?.id, -32600, "invalid request")); continue; }
    const isNotification = m.id === undefined;
    try {
      let result: unknown;
      switch (m.method) {
        case "initialize": {
          const requested = (m.params?.protocolVersion as string) || PROTOCOL_VERSIONS[0];
          result = {
            protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "newsdigest", version: "0.1.0" },
            instructions: "NewsDigest: ソースマスタ（X/RSS/OSSリリース）と分析方針の管理、日次ダイジェストと生データの取得ができます。ソースは削除より update_source で paused にするのが基本です。",
          };
          break;
        }
        case "ping": result = {}; break;
        case "tools/list": result = { tools: TOOLS }; break;
        case "tools/call": {
          const name = m.params?.name as string;
          const args = (m.params?.arguments as Record<string, unknown>) ?? {};
          if (!TOOLS.some((t) => t.name === name)) { responses.push(rpcError(m.id, -32602, `unknown tool: ${name}`)); continue; }
          try { result = await callTool(name, args); }
          catch (e) { result = text(`error: ${e instanceof Error ? e.message : String(e)}`, true); }
          break;
        }
        case "notifications/initialized":
        case "notifications/cancelled":
        case "notifications/roots/list_changed":
          continue; // 通知は応答なし
        case "resources/list": result = { resources: [] }; break;
        case "prompts/list": result = { prompts: [] }; break;
        default:
          if (isNotification) continue;
          responses.push(rpcError(m.id, -32601, `method not found: ${m.method}`));
          continue;
      }
      if (!isNotification) responses.push({ jsonrpc: "2.0", id: m.id, result });
    } catch (e) {
      if (!isNotification) responses.push(rpcError(m.id, -32603, e instanceof Error ? e.message : String(e)));
    }
  }
  if (responses.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0]);
}

// 認証: Authorization: Bearer <NEWSDIGEST_API_KEY>、または URL パスのトークン（claude.ai コネクタ用）
export function mcpAuthorized(req: Request, pathToken?: string): boolean {
  const key = process.env.NEWSDIGEST_API_KEY;
  if (!key) return false;
  if (pathToken) return timingSafeEqual(pathToken, key);
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") && timingSafeEqual(auth.slice(7).trim(), key);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

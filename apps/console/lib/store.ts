// Cloudflare D1 をデータストアとして使う。
// テーブル: sources / digests / raw_items / raw_failures / meta（スキーマは schema.sql）
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface XAccount { handle: string; note?: string; added?: string; status: string }
export interface XTrend { query: string; note?: string; added?: string; status: string }
export interface RssSource { url: string; title: string; category?: string; note?: string; added?: string; status: string }
// OSSリリース監視: url は GitHub の releases.atom、repo は "owner/name"
export interface ReleaseSource { repo: string; url: string; note?: string; added?: string; status: string }
export interface SourcesDoc {
  version: number;
  sources: { x_accounts: XAccount[]; x_trends: XTrend[]; rss: RssSource[]; releases: ReleaseSource[] };
  review: { cadence: string; last_reviewed: string | null };
}

function db(): D1Database {
  const { env } = getCloudflareContext();
  return (env as { DB: D1Database }).DB;
}

interface SourceRowDb {
  kind: "x_account" | "x_trend" | "rss" | "release";
  value: string;
  title: string | null;
  category: string | null;
  note: string | null;
  added: string | null;
  status: string;
}

// ── ソースマスタ（API互換のため SourcesDoc 形状で入出力する） ──

export async function getSources(): Promise<SourcesDoc> {
  const [rows, meta] = await Promise.all([
    db().prepare("SELECT kind, value, title, category, note, added, status FROM sources ORDER BY id").all<SourceRowDb>(),
    db().prepare("SELECT key, value FROM meta").all<{ key: string; value: string }>(),
  ]);
  const m = Object.fromEntries(meta.results.map((r) => [r.key, r.value]));
  const doc: SourcesDoc = {
    version: 1,
    sources: { x_accounts: [], x_trends: [], rss: [], releases: [] },
    review: { cadence: m.review_cadence ?? "monthly", last_reviewed: m.review_last_reviewed || null },
  };
  for (const r of rows.results) {
    const common = { note: r.note ?? undefined, added: r.added ?? undefined, status: r.status };
    if (r.kind === "x_account") doc.sources.x_accounts.push({ handle: r.value, ...common });
    else if (r.kind === "x_trend") doc.sources.x_trends.push({ query: r.value, ...common });
    else if (r.kind === "release") doc.sources.releases.push({ repo: r.title ?? r.value, url: r.value, ...common });
    else doc.sources.rss.push({ url: r.value, title: r.title ?? r.value, category: r.category ?? undefined, ...common });
  }
  return doc;
}

export async function putSources(doc: SourcesDoc): Promise<void> {
  const stmts = [db().prepare("DELETE FROM sources")];
  const ins = db().prepare(
    "INSERT INTO sources (kind,value,title,category,note,added,status) VALUES (?1,?2,?3,?4,?5,?6,?7)"
  );
  for (const a of doc.sources.x_accounts)
    stmts.push(ins.bind("x_account", a.handle, null, null, a.note ?? null, a.added ?? null, a.status));
  for (const t of doc.sources.x_trends)
    stmts.push(ins.bind("x_trend", t.query, null, null, t.note ?? null, t.added ?? null, t.status));
  for (const r of doc.sources.rss)
    stmts.push(ins.bind("rss", r.url, r.title, r.category ?? null, r.note ?? null, r.added ?? null, r.status));
  for (const r of doc.sources.releases ?? [])
    stmts.push(ins.bind("release", r.url, r.repo, null, r.note ?? null, r.added ?? null, r.status));
  if (doc.review.last_reviewed)
    stmts.push(db().prepare("UPDATE meta SET value = ?1 WHERE key = 'review_last_reviewed'").bind(doc.review.last_reviewed));
  await db().batch(stmts);
}

// ── ダイジェスト ──

export interface DigestMeta { name: string; kind: "digest" | "review"; uploadedAt: string; size: number }

export async function listDigests(): Promise<DigestMeta[]> {
  const { results } = await db()
    .prepare("SELECT name, kind, updated_at, length(markdown) AS size FROM digests ORDER BY replace(name,'reviews/','') DESC")
    .all<{ name: string; kind: "digest" | "review"; updated_at: string; size: number }>();
  return results.map((r) => ({ name: r.name, kind: r.kind, uploadedAt: r.updated_at, size: r.size }));
}

export async function getDigest(name: string): Promise<string | null> {
  const row = await db().prepare("SELECT markdown FROM digests WHERE name = ?1").bind(name).first<{ markdown: string }>();
  return row?.markdown ?? null;
}

export async function putDigest(name: string, markdown: string): Promise<void> {
  // 名前空間: なし=日次ダイジェスト / reviews/=月次棚卸し / その他任意の1階層（一覧には出ない拡張用）
  if (!/^([\w-]+\/)?[\w-]+$/.test(name)) throw new Error(`invalid digest name: ${name}`);
  const kind = name.startsWith("reviews/") ? "review" : "digest";
  await db()
    .prepare(
      "INSERT INTO digests (name, kind, markdown, updated_at) VALUES (?1,?2,?3,datetime('now')) " +
      "ON CONFLICT(name) DO UPDATE SET markdown = ?3, updated_at = datetime('now')"
    )
    .bind(name, kind, markdown)
    .run();
}

// ── 収集生データ ──

export interface RawItem {
  source: string;
  kind: "rss" | "x_account" | "x_trend" | "release";
  title: string;
  url?: string;
  published?: string;
  note?: string;
}
export interface RawCollection {
  date: string;
  collected_at?: string;
  items: RawItem[];
  failures?: { source: string; kind: string; reason: string }[];
}

export async function listRaw(): Promise<{ date: string; count: number }[]> {
  const { results } = await db()
    .prepare("SELECT date, count(*) AS count FROM raw_items GROUP BY date ORDER BY date DESC")
    .all<{ date: string; count: number }>();
  return results;
}

export async function getRaw(date: string): Promise<RawCollection | null> {
  const [items, failures] = await Promise.all([
    db().prepare("SELECT source, kind, title, url, published, note FROM raw_items WHERE date = ?1 ORDER BY id").bind(date).all<RawItem>(),
    db().prepare("SELECT source, kind, reason FROM raw_failures WHERE date = ?1 ORDER BY id").bind(date).all<{ source: string; kind: string; reason: string }>(),
  ]);
  if (items.results.length === 0 && failures.results.length === 0) return null;
  return { date, items: items.results, failures: failures.results };
}

export async function putRaw(date: string, data: RawCollection): Promise<void> {
  if (!/^[\d-]+$/.test(date)) throw new Error(`invalid raw date: ${date}`);
  const stmts = [
    db().prepare("DELETE FROM raw_items WHERE date = ?1").bind(date),
    db().prepare("DELETE FROM raw_failures WHERE date = ?1").bind(date),
  ];
  const insItem = db().prepare("INSERT INTO raw_items (date,source,kind,title,url,published,note) VALUES (?1,?2,?3,?4,?5,?6,?7)");
  for (const i of data.items)
    stmts.push(insItem.bind(date, i.source, i.kind, i.title, i.url ?? null, i.published ?? null, i.note ?? null));
  const insFail = db().prepare("INSERT INTO raw_failures (date,source,kind,reason) VALUES (?1,?2,?3,?4)");
  for (const f of data.failures ?? []) stmts.push(insFail.bind(date, f.source, f.kind, f.reason));
  await db().batch(stmts);
}

// ── frontmatter ──

export interface Frontmatter { [k: string]: string | number }

export function parseFrontmatter(md: string): { meta: Frontmatter; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: md };
  const meta: Frontmatter = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: md.slice(m[0].length) };
}

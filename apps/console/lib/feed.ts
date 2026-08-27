// RSS 2.0 / Atom / RDF の軽量パーサ（scripts/fetch-rss.mjs と同じ正規表現ロジックの TS 版）。
// ルーティンの実行環境が egress 制限つきでも、コンソール（このアプリ）経由でフィードを取れるようにするためのもの。
// AI は呼ばない。取得は Workers の fetch（サブリクエスト）で、本文は MAX_BYTES で打ち切る（CPU 制限対策。フィードは新しい順なので打ち切っても直近分は残る）。

export interface FeedItem { title: string; url: string; published: string }
export interface FeedResult { url: string; title: string; kind: "rss" | "release"; ok: boolean; items: FeedItem[]; total?: number; error?: string; via: "console" }

const MAX_BYTES = 512 * 1024;

const decode = (s = "") => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

export function parseFeed(xml: string): { feedTitle: string; items: FeedItem[]; isFeed: boolean } {
  const isFeed = /<(rss|feed|rdf:RDF)/i.test(xml);
  const feedTitle = decode((xml.match(/<(?:channel|feed)[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const blocks = [...xml.matchAll(/<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  const items = blocks.map((b) => {
    let url = "";
    const atomAlt = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || b.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
    const rssLink = b.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i);
    if (rssLink && rssLink[1].trim()) url = decode(rssLink[1]);
    else if (atomAlt) url = decode(atomAlt[1]);
    if (!url) { const g = b.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i); if (g && /^https?:/.test(decode(g[1]))) url = decode(g[1]); }
    const published = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    return { title: tag(b, "title"), url, published };
  });
  return { feedTitle, items, isFeed };
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const chunks: Uint8Array[] = []; let n = 0;
  while (n < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); n += value.length;
  }
  try { await reader.cancel(); } catch { /* ignore */ }
  const all = new Uint8Array(n); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return new TextDecoder().decode(all);
}

export async function fetchFeed(t: { url: string; title?: string; kind: "rss" | "release" }, opts: { hours?: number; limit?: number; timeoutMs?: number } = {}): Promise<FeedResult> {
  const hours = opts.hours ?? 24, limit = opts.limit ?? 15, timeoutMs = opts.timeoutMs ?? 20_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(t.url, { signal: ctrl.signal, headers: { "User-Agent": "newsdigest/0.2 (+https://github.com/bytask/newsdigest)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, redirect: "follow" });
    if (!res.ok) return { url: t.url, title: t.title ?? "", kind: t.kind, ok: false, items: [], error: `HTTP ${res.status}`, via: "console" };
    const xml = await readCapped(res);
    const { feedTitle, items, isFeed } = parseFeed(xml);
    if (items.length === 0 && !isFeed) return { url: t.url, title: t.title ?? "", kind: t.kind, ok: false, items: [], error: "not a feed", via: "console" };
    const cutoff = Date.now() - hours * 3600 * 1000;
    const recent = items.filter((it) => { if (!it.published) return true; const ts = Date.parse(it.published); return Number.isNaN(ts) ? true : ts >= cutoff; });
    return { url: t.url, title: t.title || feedTitle, kind: t.kind, ok: true, items: recent.slice(0, limit), total: items.length, via: "console" };
  } catch (e) {
    const err = e as Error;
    return { url: t.url, title: t.title ?? "", kind: t.kind, ok: false, items: [], error: err.name === "AbortError" ? "timeout" : String(err.message || err), via: "console" };
  } finally {
    clearTimeout(timer);
  }
}

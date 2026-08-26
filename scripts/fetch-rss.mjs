#!/usr/bin/env node
// RSS 2.0 / Atom / RDF フィードを取得して JSON にする（依存ゼロ・正規表現ベース）。
// GitHub の releases.atom もこれで読める。
//
//   node scripts/fetch-rss.mjs [--hours 24] [--limit 15] [--timeout 20] <url> [<url> ...]
//   node scripts/fetch-rss.mjs --from-sources <sources.json>   # sources.rss + sources.releases の active を全部
//
// 出力（stdout, JSON）:
//   [{ "url": "...", "title": "<feed title>", "kind": "rss"|"release", "ok": true, "items": [{title,url,published}], "error"?: "..." }]
// 直近 --hours 時間の記事だけ残す（日付が取れないものは残す）。
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const hours = Number(opt("--hours", 24));
const limit = Number(opt("--limit", 15));
const timeoutMs = Number(opt("--timeout", 20)) * 1000;
const fromSources = opt("--from-sources");

let targets = [];
if (fromSources) {
  const doc = JSON.parse(readFileSync(fromSources, "utf8"));
  for (const r of doc.sources?.rss ?? []) if (r.status === "active") targets.push({ url: r.url, title: r.title, kind: "rss" });
  for (const r of doc.sources?.releases ?? []) if (r.status === "active") targets.push({ url: r.url, title: r.repo, kind: "release" });
} else {
  targets = args.filter((a, i) => !a.startsWith("--") && !["--hours", "--limit", "--timeout", "--from-sources"].includes(args[i - 1]))
    .map((url) => ({ url, kind: /releases\.atom$/.test(url) ? "release" : "rss" }));
}
if (targets.length === 0) { console.error("no feed urls"); process.exit(1); }

const decode = (s = "") => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

function parse(xml) {
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
  return { feedTitle, items };
}

const cutoff = Date.now() - hours * 3600 * 1000;
const recent = (it) => {
  if (!it.published) return true;
  const t = Date.parse(it.published);
  return Number.isNaN(t) ? true : t >= cutoff;
};

async function fetchOne(t) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(t.url, { signal: ctrl.signal, headers: { "User-Agent": "newsdigest/0.1 (+https://github.com/bytask/newsdigest)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" } });
    if (!res.ok) return { ...t, ok: false, items: [], error: `HTTP ${res.status}` };
    const xml = await res.text();
    const { feedTitle, items } = parse(xml);
    if (items.length === 0 && !/<(rss|feed|rdf:RDF)/i.test(xml)) return { ...t, ok: false, items: [], error: "not a feed" };
    return { ...t, title: t.title || feedTitle, ok: true, items: items.filter(recent).slice(0, limit), total: items.length };
  } catch (e) {
    return { ...t, ok: false, items: [], error: e.name === "AbortError" ? "timeout" : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

const results = await Promise.all(targets.map(fetchOne));
console.log(JSON.stringify(results, null, 2));
if (results.every((r) => !r.ok)) process.exit(1);

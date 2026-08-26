import Link from "next/link";
import { Marked } from "marked";
import { notFound } from "next/navigation";
import Mermaid from "@/components/Mermaid";
import { getDigest, parseFrontmatter } from "@/lib/store";
import { ChevronBack } from "@/components/icons";

export const dynamic = "force-dynamic";

// mermaid コードブロックは <pre class="mermaid"> にしてクライアントで描画する
const marked = new Marked({
  renderer: {
    code({ text, lang }) {
      if (lang === "mermaid") return `<pre class="mermaid">${escapeHtml(text)}</pre>`;
      return `<pre><code>${escapeHtml(text)}</code></pre>`;
    },
  },
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default async function DigestPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const name = slug.map(decodeURIComponent).join("/");
  if (!/^([\w-]+\/)?[\w-]+$/.test(name)) notFound();

  const text = await getDigest(name);
  if (text === null) notFound();

  const { meta, body } = parseFrontmatter(text);
  const html = await marked.parse(body);

  return (
    <>
      <Link className="back-link" href="/">
        <ChevronBack />
        News
      </Link>
      {Object.keys(meta).length > 0 && (
        <div className="fm-strip">
          {Object.entries(meta).map(([k, v]) => (
            <span className="fm-chip" key={k}>{k}: <b>{String(v)}</b></span>
          ))}
        </div>
      )}
      <article className="digest" dangerouslySetInnerHTML={{ __html: html }} />
      <Mermaid />
    </>
  );
}

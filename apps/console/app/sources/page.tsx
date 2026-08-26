import { getSources } from "@/lib/store";
import { ExternalArrow } from "@/components/icons";

export const dynamic = "force-dynamic";

// ソースマスタは読み取り専用ビュー。
// 変更（追加・pause/resume・削除）は Bearer 認証付き API（PUT /api/sources）経由のみ（2026-08-08方針）。

function SourceRow(props: { main: string; href: string; note?: string; added?: string; status: string }) {
  const active = props.status === "active";
  const sub = [props.note, props.added && `追加 ${props.added}`].filter(Boolean).join(" ・ ");
  return (
    <li>
      <a className="row" href={props.href} target="_blank" rel="noreferrer">
        <span className="row-body">
          <span className={`row-title ${active ? "" : "muted"}`}>
            {props.main}
            <ExternalArrow />
          </span>
          {sub && <span className="row-sub">{sub}</span>}
        </span>
        <span className="row-trailing">
          <span className={`status ${active ? "active" : "paused"}`}>{props.status}</span>
        </span>
      </a>
    </li>
  );
}

export default async function SourcesPage() {
  const doc = await getSources();
  const { x_accounts, x_trends, rss, releases } = doc.sources;
  const count = (l: { status: string }[]) => `${l.filter((i) => i.status === "active").length}/${l.length} active`;

  const sections: { title: string; count: string; rows: React.ReactNode }[] = [
    {
      title: "X Accounts", count: count(x_accounts),
      rows: x_accounts.map((a) => (
        <SourceRow key={a.handle} main={`@${a.handle}`} href={`https://x.com/${a.handle}`}
          note={a.note} added={a.added} status={a.status} />
      )),
    },
    {
      title: "X Trends", count: count(x_trends),
      rows: x_trends.map((t) => (
        <SourceRow key={t.query} main={t.query}
          href={`https://x.com/search?q=${encodeURIComponent(t.query)}&f=live`}
          note={t.note} added={t.added} status={t.status} />
      )),
    },
    {
      title: "OSS Releases", count: count(releases),
      rows: releases.map((r) => (
        <SourceRow key={r.url} main={r.repo} href={`https://github.com/${r.repo}/releases`}
          note={r.note} added={r.added} status={r.status} />
      )),
    },
    {
      title: "RSS", count: count(rss),
      rows: rss.map((r) => (
        <SourceRow key={r.url} main={r.title} href={r.url}
          note={[r.category, r.url].filter(Boolean).join(" — ")} added={r.added} status={r.status} />
      )),
    },
  ];

  return (
    <>
      <h1 className="page-title">Sources</h1>
      <p className="page-sub">
        ソースマスタ（このアプリが source of truth — ルーティンは GET /api/sources を参照）
        {doc.review.last_reviewed && ` ・ 最終棚卸し: ${doc.review.last_reviewed}`}
      </p>

      {sections.map((s) => (
        <section key={s.title}>
          <h2 className="group-header">
            {s.title}
            <span className="group-count">{s.count}</span>
          </h2>
          <ul className="list-group">{s.rows}</ul>
        </section>
      ))}

      <p className="group-footer">
        このページは読み取り専用です。ソースの追加・一時停止・削除は Bearer 認証付き API
        （PUT /api/sources）または月次棚卸し（intel-sources-review）から行います。
      </p>
    </>
  );
}

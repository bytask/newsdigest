import Link from "next/link";
import { notFound } from "next/navigation";
import { getRaw, type RawItem } from "@/lib/store";
import { parseDateName, dayLabel } from "@/lib/format";
import { ChevronBack } from "@/components/icons";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { rss: "RSS", x_account: "X Account", x_trend: "X Trend", release: "OSS Release" };

export default async function RawDay({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^[\d-]+$/.test(date)) notFound();
  const data = await getRaw(date);
  if (!data) notFound();

  const bySource = new Map<string, RawItem[]>();
  for (const item of data.items) {
    const key = `${item.kind}::${item.source}`;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key)!.push(item);
  }

  const parts = parseDateName(data.date);

  return (
    <>
      <Link className="back-link" href="/raw">
        <ChevronBack />
        Raw Feed
      </Link>
      <h1 className="page-title">{parts ? dayLabel(parts) : data.date}</h1>
      <p className="page-sub">
        {data.items.length} items ・ {bySource.size} sources
        {data.collected_at && ` ・ 収集 ${data.collected_at}`}
        {" ・ "}
        <Link href={`/d/${date}`} style={{ color: "var(--accent)", textDecoration: "none" }}>ダイジェストを見る →</Link>
      </p>

      {[...bySource.entries()].map(([key, items]) => {
        const [kind, source] = key.split("::");
        return (
          <section key={key}>
            <h2 className="group-header">
              {KIND_LABEL[kind] ?? kind} / {source}
              <span className="group-count">{items.length} 件</span>
            </h2>
            <ul className="list-group">
              {items.map((item, i) => (
                <li key={i}>
                  {item.url ? (
                    <a className="row" href={item.url} target="_blank" rel="noreferrer">
                      <span className="row-body">
                        <span className="row-title">{item.title}</span>
                        {(item.note || item.published) && (
                          <span className="row-sub">{[item.note, item.published].filter(Boolean).join(" ・ ")}</span>
                        )}
                      </span>
                    </a>
                  ) : (
                    <div className="row">
                      <span className="row-body">
                        <span className="row-title">{item.title}</span>
                        {(item.note || item.published) && (
                          <span className="row-sub">{[item.note, item.published].filter(Boolean).join(" ・ ")}</span>
                        )}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {data.failures && data.failures.length > 0 && (
        <section>
          <h2 className="group-header" style={{ color: "var(--red)" }}>
            Failures
            <span className="group-count">{data.failures.length} 件</span>
          </h2>
          <ul className="list-group">
            {data.failures.map((f, i) => (
              <li key={i}>
                <div className="row">
                  <span className="row-body">
                    <span className="row-title">{f.source}</span>
                    <span className="row-sub">{f.reason}</span>
                  </span>
                  <span className="row-trailing">
                    <span className="tag">{f.kind}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

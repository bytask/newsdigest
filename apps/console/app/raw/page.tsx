import Link from "next/link";
import { listRaw } from "@/lib/store";
import { parseDateName, dayLabel, monthLabel } from "@/lib/format";
import { Chevron } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function RawIndex() {
  const days = await listRaw();

  // 月ごとにグルーピング（listRaw は日付降順で返す）
  const groups = new Map<string, typeof days>();
  for (const d of days) {
    const parts = parseDateName(d.date);
    const key = parts ? monthLabel(parts) : "その他";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  return (
    <>
      <h1 className="page-title">Raw Feed</h1>
      <p className="page-sub">要約前の収集生データ（ソース別アイテム一覧）</p>

      {[...groups.entries()].map(([month, items]) => (
        <section key={month}>
          <h2 className="group-header">{month}</h2>
          <ul className="list-group">
            {items.map((d) => {
              const parts = parseDateName(d.date);
              return (
                <li key={d.date}>
                  <Link className="row" href={`/raw/${d.date}`}>
                    <span className="row-body">
                      <span className="row-title">{parts ? dayLabel(parts) : d.date}</span>
                    </span>
                    <span className="row-trailing">
                      <span>{d.count} 件</span>
                      <Chevron />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {days.length === 0 && (
        <ul className="list-group">
          <li className="empty-row">
            まだ生データがありません — 次回のルーティン実行から蓄積されます
          </li>
        </ul>
      )}
    </>
  );
}

import Link from "next/link";
import { listDigests, type DigestMeta } from "@/lib/store";
import { parseDateName, dayLabel, monthLabel } from "@/lib/format";
import { Chevron } from "@/components/icons";
import { APP_NAME } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  // 一覧に出すのは日次ダイジェスト（名前空間なし）と reviews/（月次棚卸し）のみ。
  // それ以外の名前空間（拡張用）は URL 直打ちでのみ閲覧できる。
  const digests = (await listDigests()).filter(
    (d) => !d.name.includes("/") || d.name.startsWith("reviews/")
  );

  // 月ごとにグルーピング（listDigests は日付降順で返す）
  const groups = new Map<string, DigestMeta[]>();
  for (const d of digests) {
    const parts = parseDateName(d.name.replace("reviews/", ""));
    const key = parts ? monthLabel(parts) : "その他";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  return (
    <>
      <h1 className="page-title">{APP_NAME}</h1>
      <p className="page-sub">
        {digests.filter((d) => d.kind === "digest").length} digests・
        {digests.filter((d) => d.kind === "review").length} reviews
      </p>

      {[...groups.entries()].map(([month, items]) => (
        <section key={month}>
          <h2 className="group-header">{month}</h2>
          <ul className="list-group">
            {items.map((d) => {
              const parts = parseDateName(d.name.replace("reviews/", ""));
              return (
                <li key={d.name}>
                  <Link className="row" href={`/d/${d.name}`}>
                    <span className="row-body">
                      <span className="row-title">{parts ? dayLabel(parts) : d.name}</span>
                    </span>
                    <span className="row-trailing">
                      {d.kind === "review"
                        ? <span className="tag review">棚卸し</span>
                        : <span>デイリー</span>}
                      <Chevron />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {digests.length === 0 && (
        <ul className="list-group">
          <li className="empty-row">
            まだダイジェストがありません — ルーティン（Claude Code）が POST /api/digests で登録すると並びます。
            <Link href="/about" style={{ color: "var(--accent)", textDecoration: "none" }}> 仕組みを見る →</Link>
          </li>
        </ul>
      )}
    </>
  );
}

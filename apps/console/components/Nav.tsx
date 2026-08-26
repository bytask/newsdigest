"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconNews, IconList, IconRadiowaves, IconInfo, IconMenu } from "./icons";

const ITEMS = [
  { href: "/", label: "Digests", icon: IconNews, match: (p: string) => p === "/" || p.startsWith("/d/") },
  { href: "/raw", label: "Raw", icon: IconList, match: (p: string) => p.startsWith("/raw") },
  { href: "/sources", label: "Sources", icon: IconRadiowaves, match: (p: string) => p.startsWith("/sources") },
  { href: "/about", label: "About", icon: IconInfo, match: (p: string) => p.startsWith("/about") },
];

function NavItems({ pathname }: { pathname: string }) {
  return (
    <>
      {ITEMS.map(({ href, label, icon: Icon, match }) => (
        <Link key={href} href={href} className={`side-nav-item ${match(pathname) ? "current" : ""}`}>
          <Icon size={19} />
          {label}
        </Link>
      ))}
    </>
  );
}

// デスクトップ: サイドバー内の縦ナビ
export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="side-nav">
      <NavItems pathname={pathname} />
    </nav>
  );
}

// モバイル: ヘッダー（ハンバーガー）＋ 左からスライドインするドロワー
export function MobileChrome({ appName, scheduleLabel }: { appName: string; scheduleLabel: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // ページ遷移で閉じる
  useEffect(() => { setOpen(false); }, [pathname]);

  // 開いている間は Esc で閉じる＋背景スクロールを止める
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="mobile-header">
        <button
          className="menu-btn" aria-label="メニューを開く" aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <IconMenu size={22} />
        </button>
        <Link href="/" className="brand">
          <span className="brand-mark">◈</span>{appName}
        </Link>
        <span className="menu-btn-spacer" aria-hidden />
      </header>

      <div
        className={`drawer-scrim ${open ? "open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <nav className={`drawer ${open ? "open" : ""}`} aria-hidden={!open} inert={!open}>
        <div className="drawer-brand">
          <span className="brand-mark">◈</span>{appName}
        </div>
        <div className="side-nav">
          <NavItems pathname={pathname} />
        </div>
        <div className="drawer-foot">
          <div>INTEL DIGEST</div>
          <div>{scheduleLabel}</div>
        </div>
      </nav>
    </>
  );
}

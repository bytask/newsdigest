import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SideNav, MobileChrome } from "@/components/Nav";
import { APP_NAME, APP_TAGLINE, SCHEDULE_LABEL } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // iPhone のノッチ・ホームバー領域まで描画し safe-area で避ける
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <Link href="/" className="brand">
              <span className="brand-mark">◈</span>{APP_NAME}
            </Link>
            <SideNav />
            <div className="sidebar-foot">
              <div>INTEL DIGEST</div>
              <div>{SCHEDULE_LABEL}</div>
            </div>
          </aside>

          <MobileChrome appName={APP_NAME} scheduleLabel={SCHEDULE_LABEL} />

          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}

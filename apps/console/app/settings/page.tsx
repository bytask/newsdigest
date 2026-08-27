import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isPublicUi, verifySessionValue } from "@/lib/session";
import { getPasswordHash, listApiKeys } from "@/lib/store";
import { APP_NAME } from "@/lib/config";
import { SettingsClient } from "@/components/Settings";

export const metadata: Metadata = { title: `Settings — ${APP_NAME}` };
export const dynamic = "force-dynamic";

// 鍵の発行・失効とパスワード変更。PUBLIC_UI=1 でも、このページだけはログイン必須。
export default async function SettingsPage() {
  const c = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySessionValue(c);
  if (!session) redirect("/login?next=/settings");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const base = host ? `https://${host}` : "";
  const [keys, pw] = await Promise.all([listApiKeys(), getPasswordHash()]);

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">API キーの発行・失効とパスワード変更{isPublicUi() && " ・ UI は公開モード（PUBLIC_UI=1）"}</p>
      <SettingsClient initialKeys={keys} baseUrl={base} passwordConfigured={Boolean(pw)} />
    </>
  );
}

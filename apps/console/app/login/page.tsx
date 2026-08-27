import type { Metadata } from "next";
import { APP_NAME } from "@/lib/config";

export const metadata: Metadata = { title: `ログイン — ${APP_NAME}` };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid_password: "パスワードが違います",
  rate_limited: "試行回数が多すぎます。10 分ほど待ってから再試行してください",
  password_not_configured: "パスワードが未設定です。`node scripts/post.mjs password:set` で設定してください",
  session_secret_missing: "サーバーの秘密鍵が未設定です（SESSION_SECRET / NEWSDIGEST_API_KEY）",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  const error = sp.error ? ERRORS[sp.error] ?? "ログインに失敗しました" : "";
  return (
    <div className="auth-screen">
      <form className="card auth-card" method="post" action="/api/auth/login">
        <div className="auth-brand"><span className="brand-mark">◈</span>{APP_NAME}</div>
        <p className="auth-sub">閲覧にはパスワードが必要です</p>
        <input type="hidden" name="next" value={next} />
        <label className="field">
          <span>パスワード</span>
          <input className="input" type="password" name="password" autoComplete="current-password" autoFocus required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary block" type="submit">ログイン</button>
        <p className="auth-foot">API / MCP はパスワードではなく API キー（Settings で発行）を使います</p>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { ApiKeyPublic } from "@/lib/store";

const SCOPE_INFO: { id: string; label: string; desc: string }[] = [
  { id: "read", label: "read", desc: "ダイジェスト・生データ・ソース・方針の取得" },
  { id: "write", label: "write", desc: "ダイジェスト・生データの登録（ルーティン用）" },
  { id: "manage", label: "manage", desc: "ソース・分析方針の変更（MCP の add_source 等）" },
  { id: "admin", label: "admin", desc: "鍵の発行・失効、パスワード変更" },
];

const PRESETS: { label: string; name: string; scopes: string[]; hint: string }[] = [
  { label: "ルーティン用", name: "routine", scopes: ["read", "write"], hint: "claude.ai の環境変数 NEWSDIGEST_API_KEY に" },
  { label: "Claude Code 用", name: "claude-code", scopes: ["read", "write", "manage"], hint: "claude mcp add の Bearer に" },
  { label: "claude.ai コネクタ用", name: "claude-ai", scopes: ["read"], hint: "URL に鍵を含める方式。read のみ" },
];

type Created = { id: string; key: string; name: string; scopes: string[]; hints: { mcp_add_command: string; connector_url: string | null } };

function fmt(ts: string | null) {
  return ts ? ts.replace("T", " ").slice(0, 16) : "—";
}

export function SettingsClient({ initialKeys, baseUrl, passwordConfigured }: { initialKeys: ApiKeyPublic[]; baseUrl: string; passwordConfigured: boolean }) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [err, setErr] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  const reload = async () => {
    const r = await fetch("/api/keys", { cache: "no-store" });
    if (r.ok) setKeys(await r.json());
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(""); setCreated(null);
    try {
      const r = await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, scopes, expires_at: expires || null }) });
      const j = (await r.json()) as Created & { error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setCreated(j); setName(""); setExpires("");
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? `HTTP ${r.status}`);
      setConfirmId(null);
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const copy = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(""), 1500); } catch { /* noop */ }
  };

  const toggle = (s: string) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  return (
    <>
      {created && (
        <section>
          <h2 className="group-header">発行した鍵（この画面を閉じると二度と表示されません）</h2>
          <div className="card key-reveal">
            <div className="key-reveal-row">
              <code className="key-code">{created.key}</code>
              <button className="btn small" type="button" onClick={() => copy("key", created.key)}>{copied === "key" ? "コピー済み" : "コピー"}</button>
            </div>
            <p className="key-hint"><b>{created.name}</b> ・ {created.scopes.join(", ")}</p>
            <p className="key-hint">Claude Code に登録:</p>
            <div className="key-reveal-row">
              <code className="key-code small">{created.hints.mcp_add_command}</code>
              <button className="btn small" type="button" onClick={() => copy("cmd", created.hints.mcp_add_command)}>{copied === "cmd" ? "コピー済み" : "コピー"}</button>
            </div>
            {created.hints.connector_url && (
              <>
                <p className="key-hint">claude.ai カスタムコネクタの URL（read のみの鍵なので URL に含められます）:</p>
                <div className="key-reveal-row">
                  <code className="key-code small">{created.hints.connector_url}</code>
                  <button className="btn small" type="button" onClick={() => copy("url", created.hints.connector_url!)}>{copied === "url" ? "コピー済み" : "コピー"}</button>
                </div>
              </>
            )}
            <p className="key-hint">ルーティン用なら claude.ai の環境設定（Environment variables）に <code>NEWSDIGEST_API_KEY</code> として登録します。</p>
          </div>
        </section>
      )}

      <section>
        <h2 className="group-header">API キー<span className="group-count">{active.length} active</span></h2>
        <ul className="list-group">
          {active.length === 0 && <li className="empty-row">鍵はまだありません。下で発行してください</li>}
          {active.map((k) => (
            <li key={k.id}>
              <div className="row">
                <span className="row-body">
                  <span className="row-title">{k.name} <code className="key-id">nd_{k.id}_…</code></span>
                  <span className="row-sub">
                    {k.scopes.split(",").map((s) => <span key={s} className={`tag scope-${s}`}>{s}</span>)}
                    {" "}作成 {fmt(k.created_at)} ・ 最終使用 {fmt(k.last_used)}{k.expires_at && ` ・ 期限 ${fmt(k.expires_at)}`}
                  </span>
                </span>
                <span className="row-trailing">
                  {confirmId === k.id ? (
                    <>
                      <button className="btn small danger" type="button" disabled={busy} onClick={() => revoke(k.id)}>失効する</button>
                      <button className="btn small" type="button" onClick={() => setConfirmId(null)}>やめる</button>
                    </>
                  ) : (
                    <button className="btn small" type="button" onClick={() => setConfirmId(k.id)}>失効</button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {revoked.length > 0 && (
          <p className="group-footer">失効済み: {revoked.map((k) => `${k.name} (nd_${k.id}, ${fmt(k.revoked_at)})`).join(" / ")}</p>
        )}
      </section>

      <section>
        <h2 className="group-header">新しい鍵を発行</h2>
        <form className="card" onSubmit={create}>
          <div className="preset-row">
            {PRESETS.map((p) => (
              <button key={p.name} type="button" className={`btn small ${name === p.name ? "primary" : ""}`} title={p.hint}
                onClick={() => { setName(p.name); setScopes(p.scopes); }}>{p.label}</button>
            ))}
          </div>
          <label className="field">
            <span>名前（用途）</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="routine / claude-code / claude-ai …" maxLength={40} required />
          </label>
          <div className="field">
            <span>スコープ</span>
            <div className="checks">
              {SCOPE_INFO.map((s) => (
                <label key={s.id} className="check">
                  <input type="checkbox" checked={scopes.includes(s.id)} onChange={() => toggle(s.id)} />
                  <b>{s.label}</b><span>{s.desc}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="field">
            <span>有効期限（任意）</span>
            <input className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          {err && <p className="form-error" role="alert">{err}</p>}
          <button className="btn primary" type="submit" disabled={busy || !name || scopes.length === 0}>発行</button>
        </form>
      </section>

      <PasswordForm configured={passwordConfigured} />

      <section>
        <h2 className="group-header">セッション</h2>
        <form className="card" method="post" action="/api/auth/logout">
          <p>このブラウザのログインを終了します（API キーには影響しません）。</p>
          <button className="btn" type="submit">ログアウト</button>
        </form>
      </section>

      <p className="group-footer">
        コンソール: {baseUrl} ・ MCP: {baseUrl}/mcp ・ 鍵の発行は CLI（<code>node scripts/post.mjs keys:add</code>）からもできます。
      </p>
    </>
  );
}

function PasswordForm({ configured }: { configured: boolean }) {
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(""); setErr("");
    if (pw !== pw2) { setErr("新しいパスワードが一致しません"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/password", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw, current_password: cur }) });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMsg("パスワードを変更しました"); setCur(""); setPw(""); setPw2("");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <section>
      <h2 className="group-header">パスワード</h2>
      <form className="card" onSubmit={submit}>
        {configured && (
          <label className="field"><span>現在のパスワード</span>
            <input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></label>
        )}
        <label className="field"><span>新しいパスワード（8 文字以上）</span>
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        <label className="field"><span>新しいパスワード（確認）</span>
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} required /></label>
        {err && <p className="form-error" role="alert">{err}</p>}
        {msg && <p className="form-ok">{msg}</p>}
        <button className="btn primary" type="submit" disabled={busy}>変更</button>
      </form>
    </section>
  );
}

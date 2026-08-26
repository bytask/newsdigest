import type { Metadata } from "next";
import Link from "next/link";
import { IconNews, IconList, IconRadiowaves, Chevron } from "@/components/icons";
import { APP_NAME, LINE_ADD_URL, SCHEDULE_LABEL } from "@/lib/config";

export const metadata: Metadata = { title: `About — ${APP_NAME}` };

export default function AboutPage() {
  return (
    <>
      <h1 className="page-title">About</h1>
      <p className="page-sub">このアプリの仕組みと使い方</p>

      <section>
        <h2 className="group-header">概要</h2>
        <div className="card">
          <p>
            {APP_NAME} は、自分で選んだソース（Xアカウント・Xトレンド・RSS・OSSリリース）を
            毎日自動で巡回し、AI が要約した日次ダイジェストを蓄積・閲覧するためのコンソールです。
          </p>
          <p>
            AI による収集・要約は、あなた自身の Claude Code（Web版）の
            <b>ルーティン</b>が実行します。サーバーの常駐は不要で、このアプリは
            Cloudflare Workers + D1 の無料枠で動きます。
          </p>
          <p>
            月に一度はソースの棚卸しレポートも登録され、採用実績の少ないソースの一時停止・入替を提案します。
          </p>
        </div>
      </section>

      <section>
        <h2 className="group-header">毎日の流れ（{SCHEDULE_LABEL}）</h2>
        <div className="card">
          <ol className="steps">
            <li>
              <b>収集</b>
              <span>Claude Code ルーティンがソースマスタ（GET /api/sources）を参照し、各ソースの直近24時間分を収集</span>
            </li>
            <li>
              <b>AI 要約</b>
              <span>収集アイテムを重要トピック順に統合・要約し、図解（Mermaid）付きのダイジェストを生成</span>
            </li>
            <li>
              <b>登録</b>
              <span>ダイジェストと要約前の生データをこのアプリに登録（POST /api/digests・/api/raw）</span>
            </li>
            <li>
              <b>通知（任意）</b>
              <span>Slack / Discord / LINE 公式アカウントなど、設定したチャネルへトップトピックを配信</span>
            </li>
          </ol>
        </div>
      </section>

      <section>
        <h2 className="group-header">画面</h2>
        <ul className="list-group">
          <li>
            <Link className="row" href="/">
              <span className="icon-tile blue"><IconNews size={19} /></span>
              <span className="row-body">
                <span className="row-title">Digests</span>
                <span className="row-sub">日次ダイジェスト一覧。月次の棚卸しレポートもここに並ぶ</span>
              </span>
              <span className="row-trailing"><Chevron /></span>
            </Link>
          </li>
          <li>
            <Link className="row" href="/raw">
              <span className="icon-tile orange"><IconList size={19} /></span>
              <span className="row-body">
                <span className="row-title">Raw</span>
                <span className="row-sub">要約前の収集生データをソース別に閲覧</span>
              </span>
              <span className="row-trailing"><Chevron /></span>
            </Link>
          </li>
          <li>
            <Link className="row" href="/sources">
              <span className="icon-tile purple"><IconRadiowaves size={19} /></span>
              <span className="row-body">
                <span className="row-title">Sources</span>
                <span className="row-sub">ソースマスタ（このアプリが source of truth・読み取り専用）</span>
              </span>
              <span className="row-trailing"><Chevron /></span>
            </Link>
          </li>
        </ul>
        <p className="group-footer">
          ソースの追加・一時停止・削除は GUI からは行いません。Bearer 認証付き API（PUT /api/sources）
          または Claude Code から「ソースに ○○ を追加して」と頼むと、API 経由で更新されます。
        </p>
      </section>

      {LINE_ADD_URL && (
        <section>
          <h2 className="group-header">公式LINE</h2>
          <div className="card">
            <p>公式LINEを友だち追加すると、毎朝のダイジェストが LINE に届きます。</p>
            <p style={{ marginTop: "0.9rem" }}>
              <a className="line-btn" href={LINE_ADD_URL} target="_blank" rel="noreferrer">
                友だち追加
              </a>
            </p>
          </div>
        </section>
      )}

      <section>
        <h2 className="group-header">固定URL</h2>
        <ul className="list-group">
          <li>
            <div className="row">
              <span className="row-body">
                <span className="row-title">/latest</span>
                <span className="row-sub">常に最新のダイジェストへリダイレクトする固定URL（ブックマーク・リッチメニュー用）</span>
              </span>
            </div>
          </li>
          <li>
            <div className="row">
              <span className="row-body">
                <span className="row-title">/d/YYYY-MM-DD</span>
                <span className="row-sub">その日のダイジェスト。/d/reviews/YYYY-MM は月次棚卸し</span>
              </span>
            </div>
          </li>
        </ul>
      </section>
    </>
  );
}

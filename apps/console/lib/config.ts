// 画面の表示名など、秘密でない設定。wrangler.jsonc の vars（本番）/ .dev.vars（ローカル）から読む。
export const APP_NAME = process.env.APP_NAME || "Intel Digest";
export const APP_TAGLINE =
  process.env.APP_TAGLINE || "ソースマスタ起点の日次インテリジェンス・ダイジェスト";
export const SCHEDULE_LABEL = process.env.SCHEDULE_LABEL || "収集 毎朝・棚卸し 毎月1日";
// LINE 公式アカウントの友だち追加URL（任意。設定すると About に友だち追加ボタンが出る）
export const LINE_ADD_URL = process.env.LINE_ADD_URL || "";

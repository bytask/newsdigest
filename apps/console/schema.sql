-- intel-console D1 schema
-- 適用: npm run db:schema:remote（本番） / npm run db:schema:local（wrangler dev 用）
-- 冪等（IF NOT EXISTS）なので何度流してもよい。

-- ソースマスタ（このアプリが source of truth）
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('x_account','x_trend','rss','release')),
  value TEXT NOT NULL,              -- x_account: handle / x_trend: query / rss: url / release: releases.atom url
  title TEXT,                       -- rss: 表示名 / release: "owner/name"
  category TEXT,
  note TEXT,
  added TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  UNIQUE (kind, value)
);

-- ダイジェスト本文（Markdown）。name = "YYYY-MM-DD" | "reviews/YYYY-MM" | "<ns>/<name>"
CREATE TABLE IF NOT EXISTS digests (
  name TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('digest','review')),
  markdown TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 要約前の収集生データ（RAWビュー用）
CREATE TABLE IF NOT EXISTS raw_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  published TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS raw_items_date ON raw_items (date);

CREATE TABLE IF NOT EXISTS raw_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS raw_failures_date ON raw_failures (date);

-- 設定値（棚卸し周期・最終棚卸し日）
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
INSERT OR IGNORE INTO meta (key, value) VALUES ('review_cadence', 'monthly');
INSERT OR IGNORE INTO meta (key, value) VALUES ('review_last_reviewed', '');

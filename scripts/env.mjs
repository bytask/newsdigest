// .env.local → .env の順に読み、未設定の環境変数だけ埋める（依存ゼロ）。
// ルーティン（claude.ai 環境変数）では何も読まずに素通りする。
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v && process.env[k] === undefined) process.env[k] = v;
    }
  }
  return process.env;
}

export function requireEnv(...keys) {
  loadEnv();
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`missing env: ${missing.join(", ")} (set in claude.ai environment, or .env.local)`);
    process.exit(2);
  }
  return keys.map((k) => process.env[k]);
}

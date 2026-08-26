// 一覧表示用の日付ラベル（"2026-08-10" → 「8月10日（月）」「2026年8月」）
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export interface DateParts { y: number; m: number; d: number; weekday: string }

export function parseDateName(name: string): DateParts | null {
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return { y, m: mo, d, weekday: WEEKDAYS[date.getUTCDay()] };
}

export function dayLabel(p: DateParts): string {
  return `${p.m}月${p.d}日（${p.weekday}）`;
}

export function monthLabel(p: DateParts): string {
  return `${p.y}年${p.m}月`;
}

// Date helpers. Starlog days are local calendar days; the backend derives
// ISO weekday (1=Monday..7=Sunday) via extract(isodow from entry_date).
import { intlLocale } from './i18n';

/** Locale-aware weekday names, Monday-first. Recomputed per call so a
 *  language change takes effect on the next render. */
function weekdayNamesFor(style: 'long' | 'short'): string[] {
  const fmt = new Intl.DateTimeFormat(intlLocale(), { weekday: style });
  // 2026-09-28 is a Monday; walk the week from there.
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(2026, 8, 28 + i)),
  );
}

/** e.g. ["Monday", …, "Sunday"] / ["星期一", …] / ["月曜日", …] */
export function weekdayNames(): string[] {
  return weekdayNamesFor('long');
}

/** e.g. ["Mon", …, "Sun"] / ["周一", …] / ["月", …] */
export function weekdayShort(): string[] {
  return weekdayNamesFor('short');
}

/** ISO weekday: 1 (Monday) .. 7 (Sunday). Matches the entries.weekday column. */
export function isoWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** Local yyyy-mm-dd (for entry_date comparisons, NOT UTC). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Sep 26" / "9月26日" — locale-aware, built per call so a language
 *  change takes effect on the next render. */
export function formatShort(d: Date): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** "September 2026" / "2026年9月" */
export function formatMonth(d: Date): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** Start of the week containing d, at local midnight. weekStart is ISO 1..7. */
export function startOfWeek(d: Date, weekStart: 1 | 7 = 1): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(c, -((isoWeekday(c) - weekStart + 7) % 7));
}

/** Whole days from a to b (b - a), by calendar day. */
export function daysBetween(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

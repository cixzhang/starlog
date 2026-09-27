// Date helpers. Starlog days are local calendar days; the backend derives
// ISO weekday (1=Monday..7=Sunday) via extract(isodow from entry_date).

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

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

/** "Saturday, September 26, 2026" */
const shortFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

/** "Sep 26" */
export function formatShort(d: Date): string {
  return shortFmt.format(d);
}

const monthFmt = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
});

/** "September 2026" */
export function formatMonth(d: Date): string {
  return monthFmt.format(d);
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

// Starlog preferences, persisted in localStorage.

/** ISO weekday the week starts on: 1 = Monday, 7 = Sunday. */
export type WeekStart = 1 | 7;

const WEEK_START_KEY = 'starlog.weekStart';

export function getWeekStart(): WeekStart {
  try {
    return window.localStorage.getItem(WEEK_START_KEY) === '7' ? 7 : 1;
  } catch {
    return 1;
  }
}

export function setWeekStart(w: WeekStart): void {
  try {
    window.localStorage.setItem(WEEK_START_KEY, String(w));
  } catch {
    /* private mode */
  }
}

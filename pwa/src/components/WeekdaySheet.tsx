// WeekdaySheet: one weekday column of the journal.
//
// Renders the dates for a single ISO weekday (e.g. all Thursdays) on a
// fixed 30,000px canvas with absolute positioning. k=0 (this week) sits at
// MIDDLE (15,000px) in every sheet, so all seven align vertically by
// construction.
//
// The parent (Journal) owns the single shared vertical scroll container,
// the `past`/`future` window, scroll-to-k=0 init, and infinite scroll.
// This sheet only renders the canvas and positions its dates.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { addDays, daysBetween, formatShort, parseISODate, toISODate } from '../lib/dates';
import { fmt, useStrings, type Strings } from '../lib/i18n';
import { Markdown } from '../lib/markdown';
import { sanitizeSvg } from '../lib/svg';
import { ErrorNote } from './ui';
import SoundSnippets from './SoundSnippets';
import type {
  Score,
  Decoration,
  Entry,
  Prompt,
  Reminder,
  SbConfig,
} from '../lib/supabase';

const CONTAINER_HEIGHT = 30000;
const MIDDLE = CONTAINER_HEIGHT / 2;

/**
 * Merge the plain-CSS jump-highlight class with a stylex props object.
 * The highlight ring is a plain `.sl-sheet-highlight` rule in index.css
 * (outline + outline-offset) because the build silently drops stylex
 * nested pseudo-element selectors.
 */
function hlClass(sxClassName: string | undefined, on: boolean): string {
  return [sxClassName, on && 'sl-sheet-highlight'].filter(Boolean).join(' ');
}

interface DateItem {
  k: number;
  date: Date;
  iso: string;
}

interface WeekdaySheetProps {
  weekday: number;
  anchor: Date;
  now: Date;
  todayIso: string;
  /** ISO date whose header should flash (jump target). */
  highlightedDate: string | null;
  /** Reminder row that should flash (radar jump target). */
  highlightedReminderId: string | null;
  fetchError: string | null;
  /** Weeks rendered before/after k=0. Owned by the parent (shared). */
  past: number;
  future: number;
  entriesByDate: Record<string, Entry>;
  promptsByDate: Record<string, Prompt>;
  decosByDate: Record<string, Decoration[]>;
  remindersByDate: Record<string, Reminder[]>;
  scoresByEntryId: Record<string, Score[]>;
  cfg: SbConfig;
  onNeedDates: (dates: string[]) => void;
  /** ISO date to jump to. Only set on the sheet whose weekday matches. */
  jumpDate: string | null;
  /** Specific reminder to scroll to (radar jumps). Falls back to jumpDate. */
  jumpReminderId: string | null;
  /** True when this column is the centered one: the scroll must wait for
   *  the reorder transform to flush before running. */
  jumpReady: boolean;
  onJumpHandled: () => void;
  /** Tap on a span-continuation line: jump to the span's start day. */
  onReminderTap: (date: string, reminderId: string) => void;
  /** Request the parent to extend the shared window (for jump-to-date). */
  onNeedWindow: (past: number, future: number) => void;
}

function relativeLabel(k: number, s: Strings): string | null {
  if (k === 0) return s.sheet.thisWeek;
  if (k === 1) return s.sheet.nextWeek;
  if (k === -1) return s.sheet.lastWeek;
  if (k === 2 || k === 3) return fmt(s.sheet.weeksOut, { n: k });
  if (k === -2 || k === -3) return fmt(s.sheet.weeksAgo, { n: -k });
  return null;
}

// Decoration color palette: names tied to theme tokens.
// Agents specify meta.color as one of these; the PWA resolves to
// the CSS variable so decorations adapt to light/dark mode.
// SVGs should use stroke="currentColor" / fill="currentColor".
const DECO_PALETTE: Record<string, string> = {
  ink: '--color-text-primary',
  muted: '--color-text-secondary',
  coral: '--color-coral',
  navy: '--color-navy',
  // Astryx non-semantic icon colors
  red: '--color-icon-red',
  orange: '--color-icon-orange',
  yellow: '--color-icon-yellow',
  green: '--color-icon-green',
  teal: '--color-icon-teal',
  cyan: '--color-icon-cyan',
  blue: '--color-icon-blue',
  purple: '--color-icon-purple',
  pink: '--color-icon-pink',
  gray: '--color-icon-gray',
};

// Agent-controlled decoration presentation via meta:
// { width (px max), align (left|center|right), rotation (deg), color (palette name) }
function DecoView({ d }: { d: { id: string; svg: string; meta?: unknown } }) {
  const svg = sanitizeSvg(d.svg);
  if (!svg) return null;
  const meta = (d.meta ?? {}) as {
    width?: number;
    align?: 'left' | 'center' | 'right';
    rotation?: number;
    color?: string;
  };
  const colorVar = DECO_PALETTE[meta.color ?? 'ink'] ?? DECO_PALETTE.ink;
  const style: import('react').CSSProperties = {
    color: `var(${colorVar})`,
  };
  if (meta.width) {
    style.maxWidth = meta.width;
    style.width = '100%';
  }
  if (meta.align === 'left') style.marginRight = 'auto';
  else if (meta.align === 'right') style.marginLeft = 'auto';
  if (meta.rotation) {
    style.transform = `rotate(${meta.rotation}deg)`;
  }
  return (
    <div
      key={d.id}
      data-decoration-id={d.id}
      {...stylex.props(styles.deco)}
      style={style}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default function WeekdaySheet(props: WeekdaySheetProps) {
  const {
    weekday,
    anchor,
    now,
    todayIso,
    highlightedDate,
    highlightedReminderId,
    fetchError,
    past,
    future,
    entriesByDate,
    promptsByDate,
    decosByDate,
    remindersByDate,
    scoresByEntryId,
    cfg,
    onNeedDates,
    jumpDate,
    jumpReminderId,
    jumpReady,
    onJumpHandled,
    onReminderTap,
    onNeedWindow,
  } = props;

  const innerRef = useRef<HTMLDivElement>(null);
  // Tap-to-expand for reminder details (stores the expanded reminder id).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const datesRef = useRef<DateItem[]>([]);
  const s = useStrings();
  // Rendered content edges (in container coordinates). The parent's infinite
  // scroll triggers off these, not the 30,000px canvas edges.
  const contentTopRef = useRef(MIDDLE);
  const contentBottomRef = useRef(MIDDLE);

  const dates = useMemo<DateItem[]>(() => {
    const out: DateItem[] = [];
    for (let k = -past; k <= future; k++) {
      const date = addDays(anchor, k * 7);
      out.push({ k, date, iso: toISODate(date) });
    }
    return out;
  }, [anchor, past, future]);
  datesRef.current = dates;

  // Report the dates this sheet needs so the parent can fetch their data.
  useEffect(() => {
    onNeedDates(dates.map((d) => d.iso));
  }, [dates, onNeedDates]);

  // Absolute positioning: k=0 (this week) sits at the fixed MIDDLE.
  // Previous weeks are positioned above with negative virtual tops,
  // future weeks below with positive. The inner wrapper has a fixed tall
  // height so the scroll container is stable from the first frame.
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    // Measure each date's height and calculate tops.
    // k=0 at top:0, k>0 below, k<0 above (negative).
    let top = 0;
    const tops = new Map<string, number>();
    // First pass: k>=0 (top:0 and below)
    for (const d of datesRef.current) {
      if (d.k < 0) continue;
      const el = inner.querySelector(
        `[data-sheet-iso="${d.iso}"]`,
      ) as HTMLElement | null;
      if (!el) continue;
      tops.set(d.iso, top);
      top += el.offsetHeight;
    }
    // (bottomTotal not needed — container height is fixed.)
    // Second pass: k<0 (above, negative tops). Work backwards from k=-1.
    let negTop = 0;
    const negDates = datesRef.current.filter((d) => d.k < 0).sort((a, b) => b.k - a.k);
    for (const d of negDates) {
      const el = inner.querySelector(
        `[data-sheet-iso="${d.iso}"]`,
      ) as HTMLElement | null;
      if (!el) continue;
      negTop -= el.offsetHeight;
      tops.set(d.iso, negTop);
    }
    // Position relative to the fixed MIDDLE: k=0's virtual top:0 becomes
    // MIDDLE in the DOM. Past weeks go above, future below. The container
    // has a fixed tall height, so no height recalculation jank.
    // Track the rendered content edges for the infinite scroll triggers.
    contentTopRef.current = MIDDLE + negTop;
    contentBottomRef.current = MIDDLE + top;
    for (const [iso, t] of tops) {
      const el = inner.querySelector(
        `[data-sheet-iso="${iso}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.style.position = 'absolute';
        el.style.top = `${t + MIDDLE}px`;
        el.style.left = '0';
        el.style.right = '0';
      }
    }
    inner.style.position = 'relative';
    // (height is set declaratively in the JSX — fixed tall container.)
    // Note: scroll init and infinite scroll are owned by the parent (Journal)
    // which has the single shared scroll container.
  });

  // Jump-to-date: ask the parent to extend the window to include the target
  // date, then scroll the shared container to it.
  useEffect(() => {
    if (!jumpDate) return;
    const k = Math.round(daysBetween(anchor, parseISODate(jumpDate)) / 7);
    onNeedWindow(k < 0 ? -k + 2 : 8, k > 0 ? k + 2 : 8);
  }, [jumpDate, anchor, onNeedWindow]);

  useEffect(() => {
    if (!jumpDate || !jumpReady) return;
    if (!dates.some((d) => d.iso === jumpDate)) return;
    // Scroll AFTER the column-reorder transform is flushed to the browser.
    // Double rAF: the first fires before paint (styles applied), the second
    // after the browser has painted the reordered columns, so
    // scrollIntoView sees the target in its final centered position and
    // inline:'nearest' leaves the horizontal axis alone.
    let raf2: number = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const inner = innerRef.current;
        // Point directly at the reminder row for radar jumps; fall back to
        // the date sheet for calendar jumps (no specific reminder).
        const target =
          (jumpReminderId
            ? inner?.querySelector(
                `[data-reminder-id="${jumpReminderId}"]`,
              )
            : null) ??
          inner?.querySelector(`[data-sheet-iso="${jumpDate}"]`);
        (target as HTMLElement | null)?.scrollIntoView({
          block: 'start',
          behavior: 'smooth',
        });
        onJumpHandled();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [jumpDate, jumpReady, jumpReminderId, dates, onJumpHandled]);

  // (Prepend stability via absolute positioning: the layout effect above
  // recalculates all tops on every render, so k=0 never shifts.)

  // Note: infinite scroll is owned by the parent (Journal) which has the
  // single shared scroll container.

  return (
    <div {...stylex.props(styles.column)} data-sheet-column={weekday}>
      <div
        {...stylex.props(styles.inner)}
        ref={innerRef}
        style={{ position: 'relative', height: CONTAINER_HEIGHT }}
      >
          {fetchError && (
            <div {...stylex.props(styles.fetchError)}>
              <ErrorNote title={s.sheet.loadError} detail={fetchError} />
            </div>
          )}
          {dates.map(({ k, date, iso }, i) => {
            const entry = entriesByDate[iso];
            const prompt = promptsByDate[iso];
            const dayReminders = remindersByDate[iso] ?? [];
            const decos = decosByDate[iso] ?? [];
            const label = relativeLabel(k, s);
            const hasAnno = prompt != null || dayReminders.length > 0;
            const sheetSx = stylex.props(
              styles.sheet,
              k !== 0 && styles.sheetMuted,
              i > 0 && styles.sheetDivider,
            );
            const headSx = stylex.props(styles.sheetHead);
            return (
              <article
                id={`sheet-${iso}`}
                data-sheet-iso={iso}
                data-sheet-k={k}
                data-muted={k !== 0 ? 'true' : undefined}
                {...sheetSx}
              >
                  <div
                    {...headSx}
                    className={hlClass(
                      headSx.className,
                      highlightedDate === iso,
                    )}
                  >
                    <h2
                      {...stylex.props(styles.sheetDate)}
                      style={
                        k !== 0 ? { color: 'var(--color-text-secondary)' } : undefined
                      }
                    >
                      {formatShort(date)}
                      {date.getFullYear() !== now.getFullYear() && (
                        <span {...stylex.props(styles.yearLabel)}>
                          {' '}{date.getFullYear()}
                        </span>
                      )}
                    </h2>
                    {iso === todayIso ? (
                      <span {...stylex.props(styles.todayPill)}>{s.sheet.today}</span>
                    ) : (
                      label != null && (
                        <span {...stylex.props(styles.relLabel)}>{label}</span>
                      )
                    )}
                  </div>
                  {iso === todayIso && entry == null && (
                    <div {...stylex.props(styles.emptyState)}>
                      {s.sheet.empty1}
                      <br />
                      {s.sheet.empty2}
                    </div>
                  )}
                  {entry != null && <Markdown source={entry.body_text} />}
                  {hasAnno && (
                    <div {...stylex.props(styles.anno)}>
                      {prompt != null && (
                        <div {...stylex.props(styles.annoLine)}>
                          <span {...stylex.props(styles.annoLabel)}>
                            {s.sheet.prompt}
                          </span>
                          <span>{prompt.body}</span>
                        </div>
                      )}
                      {dayReminders.map((r) => {
                        const rowSx = stylex.props(styles.annoLine);
                        // Match Journal's keying: local-midnight date of remind_at.
                        const startD = new Date(r.remind_at);
                        startD.setHours(0, 0, 0, 0);
                        const startIso = toISODate(startD);
                        const endIso = r.end_at
                          ? (() => {
                              const d = new Date(r.end_at);
                              d.setHours(0, 0, 0, 0);
                              return toISODate(d);
                            })()
                          : null;
                        const isSpan = endIso != null && endIso !== startIso;
                        const isContinuation = isSpan && iso !== startIso;
                        if (isContinuation && endIso) {
                          // Slim continuation line on middle/end days of a span.
                          const total = daysBetween(parseISODate(startIso), parseISODate(endIso)) + 1;
                          const dayN = daysBetween(parseISODate(startIso), parseISODate(iso)) + 1;
                          return (
                            <div
                              key={r.id}
                              data-reminder-id={r.id}
                              {...rowSx}
                              className={hlClass(
                                rowSx.className,
                                highlightedReminderId === r.id,
                              )}
                              onClick={() => onReminderTap(startIso, r.id)}
                              style={{ cursor: 'pointer', opacity: 0.75 }}
                            >
                              <span {...stylex.props(styles.annoLabel)}>→</span>
                              <span>
                                {r.title} ·{' '}
                                {fmt(s.sheet.spanDayOf, { d: String(dayN), n: String(total) })}
                              </span>
                            </div>
                          );
                        }
                        const expanded = expandedId === r.id;
                        return (
                          <div
                            key={r.id}
                            data-reminder-id={r.id}
                            {...rowSx}
                            className={hlClass(
                              rowSx.className,
                              highlightedReminderId === r.id,
                            )}
                            onClick={() => setExpandedId(expanded ? null : r.id)}
                            style={{ cursor: r.detail ? 'pointer' : undefined }}
                          >
                            {r.importance === 'high' ? (
                              <span {...stylex.props(styles.annoDot)} />
                            ) : (
                              <span {...stylex.props(styles.annoLabel)}>
                                {r.urgency === 'high' ? s.sheet.important : s.sheet.reminder}
                              </span>
                            )}
                            <span>
                              <span>{r.title}</span>
                              {isSpan && endIso && (
                                <span {...stylex.props(styles.annoLabel)}>
                                  {' '}{startIso.slice(5).replace('-', '/')} →{' '}
                                  {endIso.slice(5).replace('-', '/')} ·{' '}
                                  {fmt(s.sheet.spanDays, {
                                    n: String(daysBetween(parseISODate(startIso), parseISODate(endIso)) + 1),
                                  })}
                                </span>
                              )}
                              {expanded && r.detail && (
                                <span style={{ display: 'block', marginTop: 4, opacity: 0.85 }}>
                                  {r.detail}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {decos.map((d) => (
                    <DecoView key={d.id} d={d} />
                  ))}
                  <SoundSnippets
                    cfg={cfg}
                    scores={
                      entry ? (scoresByEntryId[entry.id] ?? []) : []
                    }
                  />
                </article>
            );
          })}
      </div>
    </div>
  );
}

const styles = stylex.create({
  // One carousel column: exactly 1/7 of the strip = full viewport width.
  // No scroll container here — the parent owns the single shared scroll.
  column: {
    width: 'calc(100% / 7)',
    flexShrink: 0,
    minHeight: 0,
  },
  inner: {
    width: '100%',
    maxWidth: 680,
    margin: '0 auto',
    padding: '4px 0 72px',
    borderLeftWidth: 1,
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--color-border)',
    // No right border: adjacent columns would create a double border.
    // The left border of the next column serves as the divider.
    boxSizing: 'border-box',
  },
  sheet: {
    padding: '20px 20px 28px',
    color: 'var(--color-text-primary)',
    // Each day holds its ground even when empty — the min-height is the
    // breathing room between date headings.
    minHeight: '20vh',
    // For scrollIntoView({block: 'start'}): leave room for the sticky header.
    scrollMarginTop: '80px',
    // Explicit border-box: the Astryx reset is in a @layer (lower priority
    // than unlayered StyleX), so don't rely on it for layout-critical dims.
    boxSizing: 'border-box',
  },
  // Divider between dates: top border (longhands — StyleX drops the
  // shorthand with var() colors). Applied to all but the first date.
  sheetDivider: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  // Non-current weeks recede: dimmer text via secondary token.
  // The current week gets a lifted background per the plan mock
  // (translucent white overlay on the viewport's paper).
  sheetMuted: {
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-background-surface)',
  },
  sheetHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  sheetDate: {
    margin: 0,
    fontFamily: 'var(--font-heading)',
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: '0.01em',
  },
  yearLabel: {
    fontSize: 13,
    fontWeight: 400,
    opacity: 0.6,
  },
  relLabel: {
    fontFamily: 'var(--font-code)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
  },
  todayPill: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-on-accent)',
    backgroundColor: 'var(--color-accent)',
    borderRadius: 999,
    padding: '3px 10px',
    whiteSpace: 'nowrap',
  },
  emptyState: {
    margin: '4px 0 0',
    fontSize: 14,
    fontStyle: 'italic',
    opacity: 0.55,
  },
  anno: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  annoLine: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    fontSize: 13,
    opacity: 0.75,
  },
  annoLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    opacity: 0.6,
    whiteSpace: 'nowrap',
  },
  annoDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: 'var(--color-accent)',
    flexShrink: 0,
    alignSelf: 'center',
  },
  deco: {
    marginTop: 14,
  },
  fetchError: {
    padding: '12px 0 0',
  },
});

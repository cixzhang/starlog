// WeekdaySheet: one weekday column of the journal.
//
// Renders the dates for a single ISO weekday (e.g. all Thursdays) in its own
// vertically scrolling column. Each sheet owns:
//   - its own `past`/`future` window (initially 3/3) with independent infinite
//     scrolling in both directions,
//   - its own overflow-y scroll container and scroll position,
//   - prepend stability via element anchoring (the visible position never
//     moves when older dates are added above),
//   - initial alignment: on load, scrolls so this week's date sits at the top
//     of the container, the same for all seven sheets.
//
// Sheets are keyed by weekday number, so horizontal swiping only changes which
// mounted sheet is visible — it never touches another sheet's scroll position.

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Divider } from '@astryxdesign/core';
import { addDays, daysBetween, formatShort, parseISODate, toISODate } from '../lib/dates';
import { Markdown } from '../lib/markdown';
import { sanitizeSvg } from '../lib/svg';
import { ErrorNote } from './ui';
import type { Decoration, Entry, Prompt, Reminder } from '../lib/supabase';

const INIT_PAST = 3;
const INIT_FUTURE = 3;
const EXTEND_PAST = 8;
const EXTEND_FUTURE = 4;
const EDGE_PX = 240;
const SCROLL_COOLDOWN_MS = 400;

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
  highlighted: string | null;
  fetchError: string | null;
  entriesByDate: Record<string, Entry>;
  promptsByDate: Record<string, Prompt>;
  decosByDate: Record<string, Decoration[]>;
  remindersByDate: Record<string, Reminder[]>;
  onNeedDates: (dates: string[]) => void;
  /** ISO date to jump to. Only set on the sheet whose weekday matches. */
  jumpDate: string | null;
  onJumpHandled: () => void;
  /** Max pastTotal across all 7 sheets — used as the uniform alignment offset. */
  alignOffset: number;
  /** Report this sheet's measured pastTotal to the parent. */
  onPastTotal: (weekday: number, total: number) => void;
}

function relativeLabel(k: number): string | null {
  if (k === 0) return 'this week';
  if (k === 1) return 'next week';
  if (k === -1) return 'last week';
  if (k > 1) return `${k} weeks out`;
  return `${-k} weeks ago`;
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
    highlighted,
    fetchError,
    entriesByDate,
    promptsByDate,
    decosByDate,
    remindersByDate,
    onNeedDates,
    jumpDate,
    onJumpHandled,
    alignOffset,
    onPastTotal,
  } = props;

  const [past, setPast] = useState(INIT_PAST);
  const [future, setFuture] = useState(INIT_FUTURE);

  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const scrollCooldown = useRef(0);
  const datesRef = useRef<DateItem[]>([]);
  // Latest bottom position for prepended content (negative offset above top:0).
  // e.g. after prepending a 167px week, latestBottom = -167.
  const latestBottomRef = useRef(0);
  const initializedRef = useRef(false);

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

  // Absolute positioning: k=0 (this week) gets top:0. Previous weeks are
  // positioned above with negative tops, tracked via latestBottomRef.
  // Future weeks go below with positive tops. The inner wrapper gets an
  // explicit height so the scroll container stays scrollable.
  // Heights are measured from the DOM (data is variable).
  useLayoutEffect(() => {
    const container = scrollRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

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
    const bottomTotal = top;
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
    const pastTotal = -negTop;
    latestBottomRef.current = negTop;

    // Report this sheet's pastTotal; parent computes the max across all 7.
    onPastTotal(weekday, pastTotal);

    // Shift virtual tops by the UNIFORM alignOffset (max pastTotal across
    // all sheets) so k=0 lands at the same scroll position in every column.
    // Sheets with shorter past content get empty space above k=0.
    for (const [iso, t] of tops) {
      const el = inner.querySelector(
        `[data-sheet-iso="${iso}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.style.position = 'absolute';
        el.style.top = `${t + alignOffset}px`;
        el.style.left = '0';
        el.style.right = '0';
      }
    }
    inner.style.position = 'relative';
    inner.style.height = `${alignOffset + bottomTotal}px`;

    // Initialize scroll so k=0 sits at the viewport top in every sheet.
    // Wait until alignOffset > 0 (all sheets have reported); otherwise we'd
    // pin scrollTop=0 and never show the current date.
    // Defer via rAF so the browser applies the new positions/heights first —
    // otherwise scrollTop gets clamped to the old (shorter) scrollHeight.
    // On prepend (alignOffset grows), increase scrollTop by the delta.
    if (!initializedRef.current && alignOffset > 0) {
      initializedRef.current = true;
      const target = alignOffset;
      requestAnimationFrame(() => {
        const c = scrollRef.current;
        if (c) c.scrollTop = target;
      });
    } else if (initializedRef.current) {
      const prevAlign = (container as any)._prevAlignOffset ?? alignOffset;
      const delta = alignOffset - prevAlign;
      if (Math.abs(delta) > 1) {
        container.scrollTop += delta;
      }
    }
    (container as any)._prevAlignOffset = alignOffset;
  });

  // Jump-to-date: extend the window to include the target date, then scroll
  // this sheet (and only this sheet) to it.
  useEffect(() => {
    if (!jumpDate) return;
    const k = Math.round(daysBetween(anchor, parseISODate(jumpDate)) / 7);
    setPast((p) => Math.max(p, k < 0 ? -k + 2 : INIT_PAST));
    setFuture((f) => Math.max(f, k > 0 ? k + 2 : INIT_FUTURE));
  }, [jumpDate, anchor]);

  useLayoutEffect(() => {
    if (!jumpDate) return;
    if (!dates.some((d) => d.iso === jumpDate)) return;
    const container = scrollRef.current;
    const el = container?.querySelector(`[data-sheet-iso="${jumpDate}"]`);
    if (el && container) {
      const cRect = container.getBoundingClientRect();
      const eRect = (el as HTMLElement).getBoundingClientRect();
      container.scrollTop += eRect.top - cRect.top;
    }
    onJumpHandled();
  }, [jumpDate, dates, onJumpHandled]);

  // (Prepend stability via absolute positioning: the layout effect above
  // recalculates all tops on every render, so k=0 never shifts. Scroll
  // adjustment for prepend happens there via pastTotal delta.)

  // Infinite scroll inside this sheet's own scroll container.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => {
      const t = Date.now();
      if (t - scrollCooldown.current < SCROLL_COOLDOWN_MS) return;
      const nearTop = container.scrollTop < EDGE_PX;
      const nearBottom =
        container.scrollTop + container.clientHeight > container.scrollHeight - EDGE_PX;
      if (!nearTop && !nearBottom) return;
      scrollCooldown.current = t;
      // With absolute positioning, prepending just extends the window;
      // the layout effect recalculates tops and adjusts scrollTop.
      if (nearTop) setPast((p) => p + EXTEND_PAST);
      if (nearBottom) setFuture((f) => f + EXTEND_FUTURE);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div {...stylex.props(styles.column)} data-sheet-column={weekday}>
      <div {...stylex.props(styles.scroll)} ref={scrollRef} data-sheet-scroll={weekday}>
        <div {...stylex.props(styles.inner)} ref={innerRef}>
          {fetchError && (
            <div {...stylex.props(styles.fetchError)}>
              <ErrorNote title="Couldn't load entries." detail={fetchError} />
            </div>
          )}
          {dates.map(({ k, date, iso }, i) => {
            const entry = entriesByDate[iso];
            const prompt = promptsByDate[iso];
            const dayReminders = remindersByDate[iso] ?? [];
            const decos = decosByDate[iso] ?? [];
            const label = relativeLabel(k);
            const hasAnno = prompt != null || dayReminders.length > 0;
            return (
              <Fragment key={iso}>
                {i > 0 && <Divider />}
                <article
                  id={`sheet-${iso}`}
                  data-sheet-iso={iso}
                  data-muted={k !== 0 ? 'true' : undefined}
                  {...stylex.props(
                    styles.sheet,
                    k !== 0 && styles.sheetMuted,
                    highlighted === iso && styles.highlight,
                  )}
                >
                  <div {...stylex.props(styles.sheetHead)}>
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
                      <span {...stylex.props(styles.todayPill)}>TODAY</span>
                    ) : (
                      label != null && (
                        <span {...stylex.props(styles.relLabel)}>{label}</span>
                      )
                    )}
                  </div>
                  {iso === todayIso && entry == null && (
                    <div {...stylex.props(styles.emptyState)}>
                      Nothing here yet.
                      <br />
                      Ask your agent to add an entry for today.
                    </div>
                  )}
                  {entry != null && <Markdown source={entry.body_text} />}
                  {hasAnno && (
                    <div {...stylex.props(styles.anno)}>
                      {prompt != null && (
                        <div {...stylex.props(styles.annoLine)}>
                          <span {...stylex.props(styles.annoLabel)}>
                            PROMPT ·
                          </span>
                          <span>{prompt.body}</span>
                        </div>
                      )}
                      {dayReminders.map((r) => (
                        <div key={r.id} {...stylex.props(styles.annoLine)}>
                          {r.importance === 'high' ? (
                            <span {...stylex.props(styles.annoDot)} />
                          ) : (
                            <span {...stylex.props(styles.annoLabel)}>
                              {r.urgency === 'high' ? 'IMPORTANT ·' : 'REMINDER ·'}
                            </span>
                          )}
                          <span>{r.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {decos.map((d) => (
                    <DecoView key={d.id} d={d} />
                  ))}
                </article>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles = stylex.create({
  // One carousel column: exactly 1/7 of the strip = full viewport width.
  column: {
    width: 'calc(100% / 7)',
    flexShrink: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  // This sheet's own vertical scroll container.
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    touchAction: 'pan-y',
  },
  inner: {
    width: '100%',
    maxWidth: 680,
    margin: '0 auto',
    padding: '4px 0 72px',
    borderLeftWidth: 1,
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--color-border)',
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: 'var(--color-border)',
  },
  sheet: {
    padding: '20px 20px 28px',
    color: 'var(--color-text-primary)',
    // Each day holds its ground even when empty — the min-height is the
    // breathing room between date headings.
    minHeight: '20vh',
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
  highlight: {
    animationName: 'sl-flash',
    animationDuration: '2.4s',
    animationTimingFunction: 'ease-out',
  },
});

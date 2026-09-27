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

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  } = props;

  const [past, setPast] = useState(INIT_PAST);
  const [future, setFuture] = useState(INIT_FUTURE);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollCooldown = useRef(0);
  const prependAnchor = useRef<{ iso: string; top: number } | null>(null);
  const datesRef = useRef<DateItem[]>([]);
  const userScrolled = useRef(false);
  const alignState = useRef<'pending' | 'initial' | 'done'>('pending');

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

  const alignToCurrentWeek = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const k0 = datesRef.current.find((d) => d.k === 0);
    if (!k0) return;
    const el = container.querySelector(`[data-sheet-iso="${k0.iso}"]`);
    if (el) {
      const cRect = container.getBoundingClientRect();
      const eRect = (el as HTMLElement).getBoundingClientRect();
      container.scrollTop += eRect.top - cRect.top;
    }
  }, []);

  // Initial alignment: on mount, scroll so this week's date sits at the top
  // of the container. All seven sheets do this, so they start aligned.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (alignState.current === 'pending' && !userScrolled.current) {
        alignToCurrentWeek();
        alignState.current = 'initial';
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [alignToCurrentWeek]);

  // Re-align once after the first data arrives, since entry/prompt heights
  // can shift dates. Never after the user has scrolled.
  useEffect(() => {
    if (alignState.current === 'initial' && !userScrolled.current) {
      alignToCurrentWeek();
      alignState.current = 'done';
    }
  }, [entriesByDate, promptsByDate, decosByDate, remindersByDate, alignToCurrentWeek]);

  // Track user-initiated scrolling via touch/wheel so auto-alignment never
  // fights the user. Programmatic scrollTop doesn't fire these events.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const mark = () => {
      userScrolled.current = true;
    };
    container.addEventListener('touchstart', mark, { passive: true });
    container.addEventListener('wheel', mark, { passive: true });
    return () => {
      container.removeEventListener('touchstart', mark);
      container.removeEventListener('wheel', mark);
    };
  }, []);

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

  // Prepend stability: after older dates are added above, restore the
  // anchored element to its previous position so the visible content
  // doesn't move.
  useLayoutEffect(() => {
    const a = prependAnchor.current;
    if (a) {
      prependAnchor.current = null;
      const container = scrollRef.current;
      const el = container?.querySelector(`[data-sheet-iso="${a.iso}"]`);
      if (el && container) {
        const delta = (el as HTMLElement).getBoundingClientRect().top - a.top;
        if (Math.abs(delta) > 1) container.scrollTop += delta;
      }
    }
  });

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
      if (nearTop) {
        const first = datesRef.current[0];
        if (first) {
          const el = container.querySelector(`[data-sheet-iso="${first.iso}"]`);
          if (el) {
            prependAnchor.current = {
              iso: first.iso,
              top: (el as HTMLElement).getBoundingClientRect().top,
            };
          }
        }
        setPast((p) => p + EXTEND_PAST);
      }
      if (nearBottom) setFuture((f) => f + EXTEND_FUTURE);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div {...stylex.props(styles.column)} data-sheet-column={weekday}>
      <div {...stylex.props(styles.scroll)} ref={scrollRef} data-sheet-scroll={weekday}>
        <div {...stylex.props(styles.inner)}>
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
                        k !== 0 ? { color: 'var(--sl-ink-soft)' } : undefined
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
    borderLeftColor: 'var(--sl-line)',
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: 'var(--sl-line)',
  },
  sheet: {
    padding: '20px 20px 28px',
    color: 'var(--sl-ink)',
    // Each day holds its ground even when empty — the min-height is the
    // breathing room between date headings.
    minHeight: '20vh',
  },
  // Non-current weeks recede via foreground only: dimmer text,
  // background stays identical for visual consistency.
  sheetMuted: {
    color: 'var(--sl-ink-faint)',
  },
  sheetHead: {
    display: 'flex',
    alignItems: 'baseline',
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
    fontSize: 12,
    opacity: 0.55,
    whiteSpace: 'nowrap',
  },
  todayPill: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--sl-accent-ink)',
    backgroundColor: 'var(--sl-accent)',
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
    backgroundColor: 'var(--sl-coral)',
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

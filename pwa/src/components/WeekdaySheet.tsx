// WeekdaySheet: one weekday column of the journal.
//
// Renders the dates for a single ISO weekday (e.g. all Thursdays) in normal
// document flow. The parent (Journal) owns:
//   - the shared `past`/`future` window (how many weeks rendered each way),
//   - the single vertical scroll container,
//   - scroll-to-k=0 on mount and on swipe,
//   - infinite scroll extension.
//
// Each date article carries `data-sheet-k` (week offset from this week) and
// `data-sheet-iso` so the parent can find and scroll to specific weeks.

import { Fragment, useEffect, useMemo } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Divider } from '@astryxdesign/core';
import { addDays, formatShort, toISODate } from '../lib/dates';
import { Markdown } from '../lib/markdown';
import { sanitizeSvg } from '../lib/svg';
import { ErrorNote } from './ui';
import type { Decoration, Entry, Prompt, Reminder } from '../lib/supabase';

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
  /** Weeks rendered before/after k=0. Owned by the parent. */
  past: number;
  future: number;
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
//   meta.width     — px width of the decoration (default 200, clamp 40..600)
//   meta.rotation  — degrees, clockwise (default 0)
//   meta.color     — palette name above (default 'ink')
//   meta.x         — horizontal nudge, px (default 0)
//   meta.y         — vertical nudge, px (default 0)
// Unknown keys are ignored; bad values fall back to defaults.
function DecoView({ d }: { d: { id: string; svg: string; meta?: unknown } }) {
  const svg = sanitizeSvg(d.svg);
  if (!svg) return null;
  const meta = (d.meta ?? {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const width = Math.min(600, Math.max(40, num(meta.width, 200)));
  const rotation = num(meta.rotation, 0);
  const x = num(meta.x, 0);
  const y = num(meta.y, 0);
  const colorName = typeof meta.color === 'string' ? meta.color : 'ink';
  const colorVar = DECO_PALETTE[colorName] ?? DECO_PALETTE.ink;
  return (
    <div
      {...stylex.props(styles.deco)}
      style={{
        width,
        transform: `translate(${x}px, ${y}px) rotate(${rotation}deg)`,
        color: `var(${colorVar})`,
      }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function WeekdaySheet({
  weekday,
  anchor,
  now,
  todayIso,
  highlighted,
  fetchError,
  past,
  future,
  entriesByDate,
  promptsByDate,
  decosByDate,
  remindersByDate,
  onNeedDates,
  jumpDate,
  onJumpHandled,
}: WeekdaySheetProps) {
  // The rendered window: k in [-past, +future].
  const dates = useMemo<DateItem[]>(() => {
    const out: DateItem[] = [];
    for (let k = -past; k <= future; k++) {
      const date = addDays(anchor, k * 7);
      out.push({ k, date, iso: toISODate(date) });
    }
    return out;
  }, [anchor, past, future]);

  // Report the dates this sheet needs so the parent can fetch their data.
  useEffect(() => {
    onNeedDates(dates.map((d) => d.iso));
  }, [dates, onNeedDates]);

  // Jump-to-date: the parent extends the window to include the target,
  // then scrolls to it. We just acknowledge the jump was handled.
  useEffect(() => {
    if (!jumpDate) return;
    onJumpHandled();
  }, [jumpDate, onJumpHandled]);

  return (
    <div {...stylex.props(styles.column)} data-sheet-column={weekday}>
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
                data-sheet-k={k}
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
  );
}

const styles = stylex.create({
  // One carousel column: exactly 1/7 of the strip = full viewport width.
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
    gap: 8,
    fontSize: 13,
    lineHeight: 1.5,
  },
  annoLabel: {
    fontFamily: 'var(--font-code)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
    paddingTop: 2,
  },
  annoDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'var(--color-accent)',
    marginTop: 6,
    flexShrink: 0,
  },
  deco: {
    marginTop: 12,
  },
  highlight: {
    outlineWidth: 2,
    outlineStyle: 'solid',
    outlineColor: 'var(--color-accent)',
    outlineOffset: -2,
    borderRadius: 8,
  },
  fetchError: {
    padding: '12px 20px',
  },
});

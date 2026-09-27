// Calendar: months scroll infinitely in both directions, like the journal.
// The current month holds the foreground; past and future months recede
// into muted bands. Days with entries get a quiet gold dot; tapping a day
// jumps to the journal for its weekday, highlighting that date.

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Divider } from '@astryxdesign/core';
import {
  fetchEntryDates,
  type SbConfig,
} from '../lib/supabase';
import {
  addDays,
  formatMonth,
  isoWeekday,
  toISODate,
} from '../lib/dates';
import { ErrorNote } from '../components/ui';
import { WEEKDAY_SHORT } from '../lib/dates';

const INIT_PAST = 2;
const INIT_FUTURE = 3;
const EXTEND_PAST = 3;
const EXTEND_FUTURE = 3;
const EDGE_PX = 900;
const SCROLL_COOLDOWN_MS = 400;

const styles = stylex.create({
  months: {
    maxWidth: 560,
    margin: '0 auto',
    padding: '4px 0 72px',
  },
  monthSheet: {
    padding: '20px 20px 28px',
    color: 'var(--sl-ink)',
  },
  // Months other than this one recede: muted band, muted text.
  monthMuted: {
    backgroundColor: 'var(--sl-paper-deep)',
    color: 'var(--sl-ink-soft)',
  },
  monthTitle: {
    fontFamily: 'var(--font-heading)',
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    margin: '0 0 12px',
    color: 'var(--sl-ink)',
  },
  monthTitleMuted: {
    color: 'var(--sl-ink-soft)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 2,
  },
  dow: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--sl-ink-faint)',
    padding: '8px 0',
  },
  cell: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    aspectRatio: '1',
    borderRadius: 12,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    fontSize: 15,
    color: 'var(--sl-ink-soft)',
    fontFamily: 'var(--font-body)',
    ':hover': { backgroundColor: 'var(--sl-paper-deep)' },
  },
  cellDim: {
    color: 'var(--sl-ink-faint)',
    opacity: 0.45,
  },
  cellToday: {
    fontWeight: 700,
    color: 'var(--sl-ink)',
    boxShadow: 'inset 0 0 0 1.5px var(--sl-gold)',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    backgroundColor: 'var(--sl-gold)',
  },
  dotEmpty: {
    width: 5,
    height: 5,
  },
});

interface Props {
  cfg: SbConfig;
  tenantId: string;
  onPickDay: (isoDate: string) => void;
  weekStart: 1 | 7;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Calendar({ cfg, tenantId, onPickDay, weekStart }: Props) {
  const today = useMemo(() => new Date(), []);
  const todayIso = toISODate(today);
  // The k=0 month: the current month, fixed at mount.
  const base = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today],
  );

  const [past, setPast] = useState(INIT_PAST);
  const [future, setFuture] = useState(INIT_FUTURE);
  const [dates, setDates] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchedRef = useRef<{ from: string; to: string } | null>(null);
  const pendingPrepend = useRef<number | null>(null);
  const scrollCooldown = useRef(0);
  const centerKey = useRef<string | null>(monthKey(base));

  const months = useMemo(() => {
    const out: { k: number; start: Date; key: string }[] = [];
    for (let k = -past; k <= future; k++) {
      const start = new Date(base.getFullYear(), base.getMonth() + k, 1);
      out.push({ k, start, key: monthKey(start) });
    }
    return out;
  }, [base, past, future]);

  // Entry dates for the visible window; refetch when the window grows.
  useEffect(() => {
    if (months.length === 0) return;
    const first = months[0].start;
    const last = months[months.length - 1].start;
    const from = toISODate(addDays(first, -7));
    const to = toISODate(
      addDays(new Date(last.getFullYear(), last.getMonth() + 1, 0), 7),
    );
    const f = fetchedRef.current;
    if (f && from >= f.from && to <= f.to) return;
    let alive = true;
    (async () => {
      try {
        const ds = await fetchEntryDates(cfg, tenantId, from, to);
        if (!alive) return;
        fetchedRef.current = {
          from: f ? (from < f.from ? from : f.from) : from,
          to: f ? (to > f.to ? to : f.to) : to,
        };
        setDates((prev) => {
          const next = new Set(prev ?? []);
          for (const d of ds) next.add(d);
          return next;
        });
        setError(null);
      } catch (e) {
        if (alive) {
          fetchedRef.current = null;
          setError(e instanceof Error ? e.message : 'Couldn’t load the calendar.');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [cfg, tenantId, months]);

  // Infinite scroll: grow the window near either edge.
  useEffect(() => {
    const onScroll = () => {
      const t = Date.now();
      if (t - scrollCooldown.current < SCROLL_COOLDOWN_MS) return;
      const doc = document.documentElement;
      const nearTop = window.scrollY < EDGE_PX;
      const nearBottom =
        window.innerHeight + window.scrollY > doc.scrollHeight - EDGE_PX;
      if (!nearTop && !nearBottom) return;
      scrollCooldown.current = t;
      if (nearTop) {
        pendingPrepend.current = doc.scrollHeight;
        setPast((p) => p + EXTEND_PAST);
      }
      if (nearBottom) setFuture((f) => f + EXTEND_FUTURE);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Center the current month vertically on first paint.
  const recenter = () => {
    const key = centerKey.current;
    centerKey.current = null;
    if (!key) return;
    const el = document.getElementById(`month-${key}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    const header = document.getElementById('sl-app-header');
    if (header) window.scrollBy(0, -header.offsetHeight / 2);
  };

  useLayoutEffect(() => {
    recenter();
    if (pendingPrepend.current != null) {
      const delta =
        document.documentElement.scrollHeight - pendingPrepend.current;
      pendingPrepend.current = null;
      if (delta > 0) window.scrollBy(0, delta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  // Day-of-week headers ordered from the configured week start.
  const dowOrder = useMemo(
    () =>
      weekStart === 7
        ? [...WEEKDAY_SHORT.slice(6), ...WEEKDAY_SHORT.slice(0, 6)]
        : WEEKDAY_SHORT,
    [weekStart],
  );

  const cellsFor = (monthStart: Date) => {
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
    );
    const lead = (isoWeekday(monthStart) - weekStart + 7) % 7;
    const total = Math.ceil((lead + monthEnd.getDate()) / 7) * 7;
    const first = addDays(monthStart, -lead);
    return { cells: Array.from({ length: total }, (_, i) => addDays(first, i)), monthEnd };
  };

  return (
    <div {...stylex.props(styles.months)}>
      {error && (
        <div style={{ padding: '0 20px' }}>
          <ErrorNote title="The calendar didn’t load." detail={error} />
        </div>
      )}

      {months.map(({ k, start, key }, i) => {
        const { cells } = cellsFor(start);
        return (
          <Fragment key={key}>
            {i > 0 && <Divider />}
            <section
              id={`month-${key}`}
              {...stylex.props(
                styles.monthSheet,
                k !== 0 && styles.monthMuted,
              )}
            >
              <h2
                {...stylex.props(
                  styles.monthTitle,
                  k !== 0 && styles.monthTitleMuted,
                )}
              >
                {formatMonth(start)}
              </h2>
              <div
                {...stylex.props(styles.grid)}
                role="grid"
                aria-label={formatMonth(start)}
              >
                {dowOrder.map((d) => (
                  <div key={d} {...stylex.props(styles.dow)}>
                    {d}
                  </div>
                ))}
                {cells.map((d) => {
                  const iso = toISODate(d);
                  const inMonth = d.getMonth() === start.getMonth();
                  // Dots fill in when entry dates arrive; cells render
                  // immediately so month heights (and scroll position)
                  // stay stable from the first paint.
                  const hasEntry = dates !== null && dates.has(iso);
                  return (
                    <button
                      key={iso}
                      role="gridcell"
                      aria-label={`${iso}${hasEntry ? ', has entry' : ''}`}
                      {...stylex.props(
                        styles.cell,
                        !inMonth && styles.cellDim,
                        iso === todayIso && styles.cellToday,
                      )}
                      onClick={() => onPickDay(iso)}
                    >
                      {d.getDate()}
                      <span
                        {...stylex.props(hasEntry ? styles.dot : styles.dotEmpty)}
                      />
                    </button>
                  );
                })}
              </div>
            </section>
          </Fragment>
        );
      })}
    </div>
  );
}

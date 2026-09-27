// Calendar: months scroll infinitely in both directions, like the journal.
// The current month holds the foreground; past and future months recede
// into muted bands. Days with entries get a quiet gold dot; tapping a day
// jumps to the journal for its weekday, highlighting that date.

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Divider } from '@astryxdesign/core';
import { createClient } from '@supabase/supabase-js';
import {
  fetchEntryDates,
  fetchReminders,
  type Reminder,
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
    color: 'var(--color-text-primary)',
  },
  // Months other than this one recede via foreground only: dimmer text,
  // background stays identical for visual consistency.
  monthMuted: {
    color: 'var(--color-text-secondary)',
  },
  monthTitle: {
    fontFamily: 'var(--font-heading)',
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    margin: '0 0 12px',
    color: 'var(--color-text-primary)',
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
    color: 'var(--color-text-disabled)',
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
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-body)',
    ':hover': { backgroundColor: 'var(--color-background-surface)' },
  },
  cellDim: {
    color: 'var(--color-text-disabled)',
    opacity: 0.45,
  },
  cellToday: {
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    boxShadow: 'inset 0 0 0 1.5px var(--color-accent)',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    backgroundColor: 'var(--color-accent)',
  },
  dotReminder: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    backgroundColor: 'var(--color-accent)',
  },
  dotReminderOffset: {
    marginLeft: 3,
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
  const [reminders, setReminders] = useState<Map<string, Reminder[]>>(new Map());
  const [realtimeNonce, setRealtimeNonce] = useState(0);
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
        const [ds, rs] = await Promise.all([
          fetchEntryDates(cfg, tenantId, from, to),
          fetchReminders(cfg, tenantId, from, to),
        ]);
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
        setReminders((prev) => {
          const next = new Map(prev);
          for (const r of rs) {
            const date = toISODate(new Date(r.remind_at));
            const list = next.get(date) ?? [];
            if (!list.some((x) => x.id === r.id)) {
              next.set(date, [...list, r]);
            }
          }
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
  }, [cfg, tenantId, months, realtimeNonce]);

  // Realtime: invalidate the entry-dates cache when entries change, so the
  // gold dots update live.
  useEffect(() => {
    const sb = createClient(cfg.url, cfg.anonKey);
    const channel = sb
      .channel('calendar-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries' },
        () => {
          fetchedRef.current = null;
          // Trigger a refetch by forcing the months effect to re-run.
          // We do this by updating a nonce state.
          setRealtimeNonce((n) => n + 1);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reminders' },
        () => {
          fetchedRef.current = null;
          setRealtimeNonce((n) => n + 1);
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [cfg]);

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
                {...stylex.props(styles.monthTitle)}
                style={
                  k !== 0
                    ? { color: 'var(--color-text-secondary)' }
                    : undefined
                }
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
                  // Out-of-month leading cells stay empty: the previous month
                  // is visible right above, so muted dates are redundant.
                  if (!inMonth && d < start) {
                    return (
                      <span key={iso} {...stylex.props(styles.cell)} aria-hidden="true" />
                    );
                  }
                  // Dots fill in when entry dates arrive; cells render
                  // immediately so month heights (and scroll position)
                  // stay stable from the first paint.
                  const hasEntry = dates !== null && dates.has(iso);
                  const dayReminders = reminders.get(iso) ?? [];
                  const hasReminder = dayReminders.length > 0;
                  return (
                    <button
                      key={iso}
                      role="gridcell"
                      aria-label={`${iso}${hasEntry ? ', has entry' : ''}${hasReminder ? `, ${dayReminders.length} reminder${dayReminders.length > 1 ? 's' : ''}` : ''}`}
                      {...stylex.props(
                        styles.cell,
                        !inMonth && styles.cellDim,
                        iso === todayIso && styles.cellToday,
                      )}
                      onClick={() => onPickDay(iso)}
                    >
                      {d.getDate()}
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {hasEntry ? (
                          <span {...stylex.props(styles.dot)} />
                        ) : !hasReminder ? (
                          <span {...stylex.props(styles.dotEmpty)} />
                        ) : null}
                        {hasReminder && (
                          <span
                            {...stylex.props(
                              styles.dotReminder,
                              hasEntry && styles.dotReminderOffset,
                            )}
                          />
                        )}
                      </span>
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

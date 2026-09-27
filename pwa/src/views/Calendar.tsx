// Calendar: a conventional monthly calendar. Days that have entries get
// a quiet gold dot; tapping a day jumps to the journal for its weekday,
// highlighting that date.

import { useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
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
import { ErrorNote, Loading } from '../components/ui';
import { WEEKDAY_SHORT } from '../lib/dates';

const styles = stylex.create({
  wrap: {
    maxWidth: 560,
    margin: '0 auto',
    padding: '16px 20px 80px',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  month: {
    fontFamily: 'var(--font-heading)',
    fontSize: 19,
    fontWeight: 600,
    color: 'var(--sl-ink)',
    margin: 0,
  },
  arrow: {
    appearance: 'none',
    border: '1px solid var(--sl-line)',
    background: 'var(--sl-paper)',
    color: 'var(--sl-ink-soft)',
    fontSize: 18,
    lineHeight: 1,
    width: 36,
    height: 36,
    borderRadius: '50%',
    cursor: 'pointer',
    ':hover': { borderColor: 'var(--sl-gold)' },
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
}

export default function Calendar({ cfg, tenantId, onPickDay }: Props) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [dates, setDates] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const monthStart = useMemo(
    () => new Date(cursor.getFullYear(), cursor.getMonth(), 1),
    [cursor],
  );
  const monthEnd = useMemo(
    () => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0),
    [cursor],
  );

  useEffect(() => {
    let alive = true;
    setDates(null);
    setError(null);
    (async () => {
      try {
        // pad a little so the leading/trailing dim days resolve too
        const from = toISODate(addDays(monthStart, -7));
        const to = toISODate(addDays(monthEnd, 7));
        const ds = await fetchEntryDates(cfg, tenantId, from, to);
        if (alive) setDates(new Set(ds));
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : 'Couldn’t load the calendar.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [cfg, tenantId, monthStart, monthEnd]);

  // cells: leading dim days (Mon-based) + month days + trailing to fill 6 rows
  const cells = useMemo(() => {
    const lead = isoWeekday(monthStart) - 1;
    const total = Math.ceil((lead + monthEnd.getDate()) / 7) * 7;
    const first = addDays(monthStart, -lead);
    return Array.from({ length: total }, (_, i) => addDays(first, i));
  }, [monthStart, monthEnd]);

  const todayIso = toISODate(today);

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.head)}>
        <button
          {...stylex.props(styles.arrow)}
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
          }
          aria-label="Previous month"
        >
          ‹
        </button>
        <h2 {...stylex.props(styles.month)}>{formatMonth(cursor)}</h2>
        <button
          {...stylex.props(styles.arrow)}
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
          }
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {error && <ErrorNote title="The calendar didn’t load." detail={error} />}
      {!error && dates === null && <Loading label="Turning pages…" />}

      {!error && dates !== null && (
        <div {...stylex.props(styles.grid)} role="grid" aria-label={formatMonth(cursor)}>
          {WEEKDAY_SHORT.map((d) => (
            <div key={d} {...stylex.props(styles.dow)}>
              {d}
            </div>
          ))}
          {cells.map((d) => {
            const iso = toISODate(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const hasEntry = dates.has(iso);
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
                <span {...stylex.props(hasEntry ? styles.dot : styles.dotEmpty)} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

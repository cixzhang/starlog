// Reminders: a muted list plus the compass — a small lunar dial showing
// open reminders across the previous, current, and next week regions.
// Shape conveys urgency (▲ high · ● normal · ○ low); size conveys how
// close the reminder is. Abstract and quiet, never game-like.

import { useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  fetchReminders,
  type Reminder,
  type SbConfig,
} from '../lib/supabase';
import {
  addDays,
  daysBetween,
  formatShort,
  isoWeekday,
  startOfWeek,
} from '../lib/dates';
import { EmptyNote, ErrorNote, Loading } from '../components/ui';

const styles = stylex.create({
  wrap: {
    maxWidth: 680,
    margin: '0 auto',
    padding: '8px 20px 80px',
  },
  compassCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 0 8px',
  },
  legend: {
    fontSize: 12.5,
    color: 'var(--sl-ink-faint)',
    marginTop: 10,
    letterSpacing: '0.02em',
  },
  groupHead: {
    fontSize: 12.5,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--sl-ink-faint)',
    margin: '28px 0 4px',
  },
  item: {
    padding: '14px 0',
    borderBottom: '1px solid var(--sl-line)',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--sl-ink)',
    margin: 0,
  },
  when: {
    fontSize: 13,
    color: 'var(--sl-ink-soft)',
    whiteSpace: 'nowrap',
  },
  detail: {
    fontSize: 14.5,
    lineHeight: 1.6,
    color: 'var(--sl-ink-soft)',
    margin: '6px 0 0',
    whiteSpace: 'pre-wrap',
  },
  tags: {
    display: 'flex',
    gap: 12,
    marginTop: 8,
  },
  tag: {
    fontSize: 12,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--sl-ink-faint)',
  },
  tagHigh: {
    color: 'var(--sl-coral-deep)',
  },
  foot: {
    marginTop: 32,
    fontSize: 13,
    fontStyle: 'italic',
    color: 'var(--sl-ink-faint)',
    textAlign: 'center',
  },
});

type Region = 'prev' | 'this' | 'next';

function regionOf(day: Date, weekStart: Date): Region {
  if (day < weekStart) return 'prev';
  if (day >= addDays(weekStart, 7)) return 'next';
  return 'this';
}

function relativeLabel(target: Date, now: Date): string {
  const n = daysBetween(now, target);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1 && n < 7) return `in ${n} days`;
  if (n < -1 && n > -7) return `${-n} days ago`;
  return formatShort(target);
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(' ', '');
}

// --- compass ---

const RING_R: Record<Region, number> = { prev: 46, this: 72, next: 98 };
const SIZE = 240;
const C = SIZE / 2;

interface Placed {
  r: Reminder;
  x: number;
  y: number;
  radius: number;
  region: Region;
}

function Compass({ reminders, now }: { reminders: Reminder[]; now: Date }) {
  const weekStart = startOfWeek(now);
  const placed: Placed[] = useMemo(() => {
    const cells = new Map<string, number>();
    return reminders.map((r) => {
      const day = new Date(
        new Date(r.remind_at).getFullYear(),
        new Date(r.remind_at).getMonth(),
        new Date(r.remind_at).getDate(),
      );
      const region = regionOf(day, weekStart);
      const angle =
        ((isoWeekday(day) - 1) / 7) * Math.PI * 2 - Math.PI / 2;
      const key = `${region}-${isoWeekday(day)}`;
      const k = cells.get(key) ?? 0;
      cells.set(key, k + 1);
      const spread = (k - 0) * 0.14;
      const ringR = RING_R[region] + (k % 2 === 0 ? 0 : 7);
      const days = Math.abs(daysBetween(now, day));
      const radius = 3.5 + 5 / (1 + days / 7);
      return {
        r,
        x: C + ringR * Math.cos(angle + spread),
        y: C + ringR * Math.sin(angle + spread),
        radius,
        region,
      };
    });
  }, [reminders, now, weekStart]);

  const ring = (rr: number, label: string) => (
    <g key={label}>
      <circle
        cx={C}
        cy={C}
        r={rr}
        fill="none"
        stroke="var(--sl-line-strong)"
        strokeWidth="1"
        strokeDasharray="2 5"
        opacity="0.8"
      />
      <text
        x={C}
        y={C - rr - 4}
        textAnchor="middle"
        fontSize="9.5"
        letterSpacing="0.08em"
        fill="var(--sl-ink-faint)"
        style={{ textTransform: 'uppercase' }}
      >
        {label}
      </text>
    </g>
  );

  return (
    <div {...stylex.props(styles.compassCard)}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Compass of open reminders across last week, this week, and next week"
      >
        {ring(RING_R.prev, 'last week')}
        {ring(RING_R.this, 'this week')}
        {ring(RING_R.next, 'next week')}
        {/* today: the moon at the center */}
        <circle cx={C} cy={C} r={13} fill="var(--sl-paper-deep)" />
        <circle
          cx={C}
          cy={C}
          r={13}
          fill="none"
          stroke="var(--sl-gold)"
          strokeWidth="1.5"
        />
        <circle cx={C - 4} cy={C - 3} r={3} fill="var(--sl-line-strong)" opacity="0.5" />
        {placed.map((p) => {
          const high = p.r.urgency === 'high';
          const fill = high ? 'var(--sl-coral)' : 'var(--sl-ink)';
          const label = `${p.r.title} — ${relativeLabel(new Date(p.r.remind_at), now)}`;
          if (p.r.urgency === 'high') {
            const s = p.radius + 1.5;
            return (
              <polygon
                key={p.r.id}
                points={`${p.x},${p.y - s} ${p.x + s * 0.9},${p.y + s * 0.75} ${p.x - s * 0.9},${p.y + s * 0.75}`}
                fill={fill}
                opacity="0.9"
              >
                <title>{label}</title>
              </polygon>
            );
          }
          if (p.r.urgency === 'low') {
            return (
              <circle
                key={p.r.id}
                cx={p.x}
                cy={p.y}
                r={p.radius}
                fill="none"
                stroke={fill}
                strokeWidth="1.5"
                opacity="0.75"
              >
                <title>{label}</title>
              </circle>
            );
          }
          return (
            <circle key={p.r.id} cx={p.x} cy={p.y} r={p.radius} fill={fill} opacity="0.8">
              <title>{label}</title>
            </circle>
          );
        })}
      </svg>
      <div {...stylex.props(styles.legend)}>
        ▲ high urgency · ● normal · ○ low — larger is closer
      </div>
    </div>
  );
}

// --- view ---

const REGION_HEAD: Record<Region, string> = {
  prev: 'Earlier',
  this: 'This week',
  next: 'Next week',
};

export default function Reminders({
  cfg,
  tenantId,
}: {
  cfg: SbConfig;
  tenantId: string;
}) {
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const weekStart = startOfWeek(now);
        const from = addDays(weekStart, -7);
        const to = addDays(weekStart, 14);
        const rs = await fetchReminders(
          cfg,
          tenantId,
          from.toISOString(),
          to.toISOString(),
        );
        if (alive) setReminders(rs);
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : 'Couldn\u2019t load reminders.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [cfg, tenantId, now]);

  const groups = useMemo(() => {
    const g: Record<Region, Reminder[]> = { prev: [], this: [], next: [] };
    if (!reminders) return g;
    const weekStart = startOfWeek(now);
    for (const r of reminders) {
      const d = new Date(r.remind_at);
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      g[regionOf(day, weekStart)].push(r);
    }
    return g;
  }, [reminders, now]);

  return (
    <div {...stylex.props(styles.wrap)}>
      {error && <ErrorNote title="The reminders didn\u2019t load." detail={error} />}
      {!error && reminders === null && <Loading label="Checking reminders…" />}
      {!error && reminders !== null && reminders.length === 0 && (
        <EmptyNote>
          No open reminders in this window.
          <br />
          Nothing asking for you.
        </EmptyNote>
      )}
      {!error && reminders !== null && reminders.length > 0 && (
        <>
          <Compass reminders={reminders} now={now} />
          {(Object.keys(REGION_HEAD) as Region[]).map(
            (region) =>
              groups[region].length > 0 && (
                <section key={region}>
                  <h2 {...stylex.props(styles.groupHead)}>
                    {REGION_HEAD[region]}
                  </h2>
                  {groups[region].map((r) => {
                    const d = new Date(r.remind_at);
                    return (
                      <article key={r.id} {...stylex.props(styles.item)}>
                        <div {...stylex.props(styles.titleRow)}>
                          <h3 {...stylex.props(styles.title)}>{r.title}</h3>
                          <span {...stylex.props(styles.when)}>
                            {relativeLabel(
                              new Date(d.getFullYear(), d.getMonth(), d.getDate()),
                              now,
                            )}{' '}
                            · {timeLabel(r.remind_at)}
                          </span>
                        </div>
                        {r.detail && (
                          <p {...stylex.props(styles.detail)}>{r.detail}</p>
                        )}
                        <div {...stylex.props(styles.tags)}>
                          <span {...stylex.props(styles.tag)}>
                            {r.importance} importance
                          </span>
                          <span
                            {...stylex.props(
                              styles.tag,
                              r.urgency === 'high' && styles.tagHigh,
                            )}
                          >
                            {r.urgency} urgency
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </section>
              ),
          )}
          <p {...stylex.props(styles.foot)}>
            Reminders are kept by your assistant — this journal only reads them.
          </p>
        </>
      )}
    </div>
  );
}

// Lunar compass: open reminders across last week, this week, and next week.
// Shape conveys urgency (▲ high · ● normal · ○ low); size conveys how
// close the reminder is. Abstract and quiet, never game-like.

import { useMemo } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { Reminder } from '../lib/supabase';
import {
  addDays,
  daysBetween,
  formatShort,
  isoWeekday,
  startOfWeek,
} from '../lib/dates';

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 0 4px',
  },
  legend: {
    fontSize: 12,
    color: 'var(--color-text-disabled)',
    marginTop: 8,
    letterSpacing: '0.02em',
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

interface Placed {
  r: Reminder;
  x: number;
  y: number;
  radius: number;
  region: Region;
}

export default function Compass({
  reminders,
  now,
  size = 240,
}: {
  reminders: Reminder[];
  now: Date;
  size?: number;
}) {
  const weekStart = startOfWeek(now);
  const C = size / 2;
  const k = size / 240;
  const RING_R: Record<Region, number> = {
    prev: 46 * k,
    this: 72 * k,
    next: 98 * k,
  };

  const placed: Placed[] = useMemo(() => {
    const cells = new Map<string, number>();
    return reminders.map((r) => {
      const at = new Date(r.remind_at);
      const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
      const region = regionOf(day, weekStart);
      const angle = ((isoWeekday(day) - 1) / 7) * Math.PI * 2 - Math.PI / 2;
      const key = `${region}-${isoWeekday(day)}`;
      const n = cells.get(key) ?? 0;
      cells.set(key, n + 1);
      const spread = n * 0.14;
      const ringR = RING_R[region] + (n % 2 === 0 ? 0 : 7 * k);
      const days = Math.abs(daysBetween(now, day));
      const radius = (3.5 + 5 / (1 + days / 7)) * k;
      return {
        r,
        x: C + ringR * Math.cos(angle + spread),
        y: C + ringR * Math.sin(angle + spread),
        radius,
        region,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders, now, weekStart, size]);

  const ring = (rr: number, label: string) => (
    <g key={label}>
      <circle
        cx={C}
        cy={C}
        r={rr}
        fill="none"
        stroke="var(--color-border-emphasized)"
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
        fill="var(--color-text-disabled)"
        style={{ textTransform: 'uppercase' }}
      >
        {label}
      </text>
    </g>
  );

  return (
    <div {...stylex.props(styles.card)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Compass of open reminders across last week, this week, and next week"
      >
        {ring(RING_R.prev, 'last week')}
        {ring(RING_R.this, 'this week')}
        {ring(RING_R.next, 'next week')}
        {/* today: the moon at the center */}
        <circle cx={C} cy={C} r={13 * k} fill="var(--color-background-surface)" />
        <circle
          cx={C}
          cy={C}
          r={13 * k}
          fill="none"
          stroke="var(--color-text-yellow)"
          strokeWidth="1.5"
        />
        <circle
          cx={C - 4 * k}
          cy={C - 3 * k}
          r={3 * k}
          fill="var(--color-border-emphasized)"
          opacity="0.5"
        />
        {placed.map((p) => {
          const high = p.r.urgency === 'high';
          const fill = high ? 'var(--color-coral)' : 'var(--color-text-primary)';
          const at = new Date(p.r.remind_at);
          const label = `${p.r.title} — ${relativeLabel(
            new Date(at.getFullYear(), at.getMonth(), at.getDate()),
            now,
          )}`;
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
            <circle
              key={p.r.id}
              cx={p.x}
              cy={p.y}
              r={p.radius}
              fill={fill}
              opacity="0.8"
            >
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

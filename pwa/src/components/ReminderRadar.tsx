// ReminderRadar: supplementary ambient overlay showing upcoming reminders as
// planets on an endless 2D sheet.
//
// The journal is a 2D grid: X = weekdays (swipe left/right), Y = weeks
// (scroll up/down). Each reminder has a 2D vector from the current position.
// The planet appears at the closest screen edge in that direction, with the
// arrow rotated to point along the vector. If the date is visible on screen,
// the planet is removed entirely.
//
// Visual encoding:
// - Size (12-24px): soonness — larger = sooner
// - Color: urgency — stone (#8a8478) for calm, coral (#F16E56) for urgent
// - Opacity + z-index: time distance — far = translucent and behind
//
// The radar is supplementary: pointer-events none by default, never blocks
// journal content, disappears when there are no upcoming reminders.

import * as stylex from '@stylexjs/stylex';
import { useEffect, useMemo, useState } from 'react';
import type { Reminder } from '../lib/supabase';
import { toISODate, isoWeekday } from '../lib/dates';

const CORAL = '#F16E56';
const CORAL_LIGHT = '#ff9a82';
const STONE = '#8a8478';
const STONE_LIGHT = '#b8b0a2';

const MAX_SIZE = 24;
const MIN_SIZE = 12;
const WINDOW_DAYS = 21; // current week + next two weeks
const EDGE_MARGIN = 8;

interface ReminderRadarProps {
  reminders: Reminder[];
  // Ref to the scroll viewport containing the sheets
  viewportRef: React.RefObject<HTMLDivElement | null>;
  // Current weekday (1-7, 1=Monday)
  currentWeekday: number;
  // Anchor date for the current week (the current weekday's date)
  anchorDate: Date;
  // Callback to scroll to a date when a planet is tapped
  onPlanetTap?: (date: string) => void;
}

interface PlanetData {
  reminder: Reminder;
  daysUntil: number;
  size: number;
  opacity: number;
  zIndex: number;
  color: string;
  colorLight: string;
  glow: boolean;
  // 2D vector from current position to reminder (in "grid units")
  dx: number;
  dy: number;
  // Angle in degrees (0 = right, 90 = down)
  angle: number;
  // Whether the date is currently visible (planet should be removed)
  inView: boolean;
}

function urgencyToColor(urgency: Reminder['urgency']): {
  color: string;
  light: string;
  glow: boolean;
} {
  switch (urgency) {
    case 'high':
      return { color: CORAL, light: CORAL_LIGHT, glow: true };
    case 'normal':
      return { color: '#c47a5e', light: '#e88a70', glow: false };
    case 'low':
    default:
      return { color: STONE, light: STONE_LIGHT, glow: false };
  }
}

const styles = stylex.create({
  container: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 5,
    overflow: 'hidden',
  },
  arrow: (color: string) => ({
    fontSize: 11,
    lineHeight: 1,
    color,
    marginBottom: 4,
  }),
  planet: (size: number, color: string, colorLight: string, glow: boolean) => ({
    width: size,
    height: size,
    borderRadius: '50%',
    background: `radial-gradient(circle at 35% 35%, ${colorLight}, ${color})`,
    boxShadow: glow ? `0 0 12px ${color}a6` : 'none',
  }),
  // Detail popup when a planet is tapped
  popup: {
    position: 'fixed',
    zIndex: 20,
    pointerEvents: 'auto',
    backgroundColor: 'var(--sl-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--sl-line)',
    borderRadius: 12,
    padding: '12px 14px',
    maxWidth: 260,
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  },
  popupTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 4,
    color: 'var(--sl-ink)',
  },
  popupDate: {
    fontSize: 12,
    color: 'var(--sl-ink-soft)',
    marginBottom: 6,
  },
  popupDetail: {
    fontSize: 13,
    color: 'var(--sl-ink)',
    lineHeight: 1.4,
  },
  popupClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: 16,
    color: 'var(--sl-ink-soft)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
  },
});

export default function ReminderRadar({
  reminders,
  viewportRef,
  currentWeekday,
  anchorDate,
  onPlanetTap,
}: ReminderRadarProps) {
  const [scrollTick, setScrollTick] = useState(0);
  const [selected, setSelected] = useState<Reminder | null>(null);
  // Visible date ISOs, computed after DOM commit (not during render)
  const [visibleIsos, setVisibleIsos] = useState<Set<string>>(new Set());

  // Update visible ISOs after DOM commit (on scroll, reminders change, etc.)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const viewportRect = viewport.getBoundingClientRect();
    const visible = new Set<string>();

    // Check all sheet elements
    const sheets = document.querySelectorAll('[id^="sheet-"]');
    sheets.forEach((el) => {
      const iso = el.id.replace('sheet-', '');
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.bottom > viewportRect.top && rect.top < viewportRect.bottom) {
        visible.add(iso);
      }
    });

    setVisibleIsos(visible);
  }, [viewportRef, scrollTick, reminders, currentWeekday, anchorDate]);

  // Re-calculate on scroll
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrollTick((t) => t + 1));
    };

    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [viewportRef]);

  const planets = useMemo(() => {
    const viewport = viewportRef.current;
    if (!viewport) return [];

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return reminders
      .filter((r) => r.status === 'open')
      .map((r) => {
        const remindDate = new Date(r.remind_at);
        remindDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.round(
          (remindDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );

        // Only show upcoming within the window
        if (daysUntil < 0 || daysUntil > WINDOW_DAYS) return null;

        const dateIso = toISODate(remindDate);

        // If the date is visible, remove the planet entirely
        // (visibleIsos is computed after DOM commit, not during render)
        if (visibleIsos.has(dateIso)) return null;

        // 2D vector on the endless sheet:
        // X = weekday axis (fixed columns: Mon=1..Sun=7, repeating endlessly)
        // Y = week axis (continuous)
        //
        // The X position is ABSOLUTE, not shortest-path. Thursday is always
        // at the Thursday column. From Sunday (X=7), Thursday (X=4) is at
        // X=-3 if we go left, but on the endless sheet we use the actual
        // column offset based on the date difference.
        //
        // Simpler: dx = (reminder weekday - current weekday), normalized to
        // [-3, 3] range for the closest column, BUT the Y must correspond to
        // the ACTUAL date, not the closest weekday occurrence.
        //
        // Correct approach: calculate the target's (x, y) from the date diff.
        // x = weekday offset, y = week offset. The date diff in days gives us
        // both: we decompose it into weekday and week components.
        const dayDiff =
          (remindDate.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24);

        // On the endless sheet, moving dx weekdays accounts for dx days.
        // The remaining days determine the week displacement.
        // Example: Sun Sep 27 → Thu Oct 8 (11 days).
        // dx=-3 (via Sat): remaining = 11-(-3) = 14 days → dy=2.0 weeks.
        // dx=+4 (via Mon): remaining = 11-4 = 7 days → dy=1.0 weeks.
        const remindWeekday = isoWeekday(remindDate);
        let dx = remindWeekday - currentWeekday;
        // Normalize to [-3, 3] for the closest column on the endless sheet
        if (dx > 3) dx -= 7;
        if (dx < -3) dx += 7;

        // Y is the week displacement after accounting for weekday movement
        const dy = (dayDiff - dx) / 7;

        // Angle in screen coordinates (0 = right, 90 = down)
        // dx: + = right (swipe left goes to next weekday which is... hmm)
        //
        // Actually: swipe left → nextWeekday. On screen, swiping left means
        // content moves left, revealing the right side. So nextWeekday is
        // to the RIGHT in the 2D sheet. Therefore +dx = right.
        //
        // dy: + = future = below in the scroll. So +dy = down.
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

        // Size: 12px (far) -> 24px (soon)
        // Use 2D distance for soonness
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = Math.sqrt(3 * 3 + 3 * 3); // ~3 weeks in any direction
        const soonness = Math.max(0, 1 - dist / maxDist);
        const size = Math.round(MIN_SIZE + soonness * (MAX_SIZE - MIN_SIZE));

        // Opacity: 0.35 (far) -> 1.0 (near)
        const opacity = 0.35 + soonness * 0.65;

        // z-index: 1 (far) -> 3 (near)
        const zIndex = 1 + Math.round(soonness * 2);

        const { color, light, glow } = urgencyToColor(r.urgency);

        return {
          reminder: r,
          daysUntil,
          size,
          opacity,
          zIndex,
          color,
          colorLight: light,
          glow,
          dx,
          dy,
          angle,
          inView: false,
        } as PlanetData;
      })
      .filter((p): p is PlanetData => p !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders, viewportRef, currentWeekday, anchorDate, visibleIsos]);

  if (planets.length === 0) return null;

  return (
    <div {...stylex.props(styles.container)} aria-hidden="true">
      {planets.map((planet) => {
        const {
          reminder,
          size,
          opacity,
          zIndex,
          color,
          colorLight,
          glow,
          angle,
        } = planet;

        // Position at the screen edge in the direction of the angle.
        // Use ray casting from center to find the edge intersection.
        //
        // For simplicity, determine the dominant axis and place at that edge,
        // with the perpendicular position interpolated for diagonals.
        const rad = (angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Rotation: arrow points up at 0°, so rotate by (angle + 90°)
        // to point along the vector. 0° (right) → 90°, 90° (down) → 180°.
        const rotation = angle + 90;

        let left: string;
        let top: string;

        // Determine which edge the ray hits first
        const absCos = Math.abs(cos);
        const absSin = Math.abs(sin);

        if (absCos > absSin) {
          // Hits left or right edge
          const isRight = cos > 0;
          left = isRight
            ? `calc(100% - ${EDGE_MARGIN + size}px)`
            : `${EDGE_MARGIN}px`;
          // Interpolate vertical position: center + tan(angle) * halfWidth
          // Clamped to stay within edges
          const t = absSin / absCos; // 0 (horizontal) to 1 (diagonal)
          const verticalOffset = t * 35; // max 35% from center
          const baseTop = 50 + (sin > 0 ? verticalOffset : -verticalOffset);
          const clampedTop = Math.max(10, Math.min(90, baseTop));
          top = `${clampedTop}%`;
        } else {
          // Hits top or bottom edge
          const isBottom = sin > 0;
          top = isBottom
            ? `calc(100% - ${EDGE_MARGIN + size + 16}px)` // +16 for arrow
            : `${EDGE_MARGIN}px`;
          // Interpolate horizontal position
          const t = absCos / absSin;
          const horizontalOffset = t * 35;
          const baseLeft = 50 + (cos > 0 ? horizontalOffset : -horizontalOffset);
          const clampedLeft = Math.max(10, Math.min(90, baseLeft));
          left = `${clampedLeft}%`;
        }

        return (
          <div
            key={reminder.id}
            style={{
              position: 'absolute',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              transform: `rotate(${rotation}deg)`,
              opacity,
              zIndex,
              pointerEvents: 'auto',
              cursor: 'pointer',
              transition:
                'left 0.4s ease-out, top 0.4s ease-out, transform 0.4s ease-out, opacity 0.4s ease-out',
              left,
              top,
            }}
            onClick={() => {
              setSelected(reminder);
              onPlanetTap?.(toISODate(new Date(reminder.remind_at)));
            }}
            title={reminder.title}
          >
            <div {...stylex.props(styles.arrow(color))}>▲</div>
            <div
              style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: `radial-gradient(circle at 35% 35%, ${colorLight}, ${color})`,
                boxShadow: glow ? `0 0 12px ${color}a6` : 'none',
              }}
            />
          </div>
        );
      })}
      {selected && (
        <div
          {...stylex.props(styles.popup)}
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            {...stylex.props(styles.popupClose)}
            onClick={() => setSelected(null)}
            aria-label="Close"
          >
            ×
          </button>
          <div {...stylex.props(styles.popupTitle)}>{selected.title}</div>
          <div {...stylex.props(styles.popupDate)}>
            {new Date(selected.remind_at).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          {selected.detail && (
            <div {...stylex.props(styles.popupDetail)}>{selected.detail}</div>
          )}
        </div>
      )}
    </div>
  );
}

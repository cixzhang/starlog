// ReminderRadar: supplementary ambient overlay showing upcoming reminders as
// planets on the edges of the journal's 7-sheet carousel.
//
// The journal mounts one WeekdaySheet per weekday; each reminder's planet
// positions itself at the screen edge nearest to its date sheet's position
// (via getBoundingClientRect), with the arrow pointing toward the sheet. If
// the exact date is visible in the current sheet, the planet is removed
// entirely. Planets reposition on scroll of the current sheet.
//
// Direction model: 2D over the week grid.
//   dx = weekday displacement (reminder weekday − current weekday),
//   dy = week displacement (how many 7-day rows below the current week).
// The planet sits at the screen edge in the (dx, dy) direction and the arrow
// points along it. When dx is 0 (same weekday as the sheet in view), the
// planet uses the actual date element's DOM position when available.
//
// Visual encoding:
// - Size (12-24px): soonness — larger = sooner
// - Color: urgency — stone (#8a8478) for calm, coral (#F16E56) for urgent
// - Opacity + z-index: time distance — far = translucent and behind
//
// The radar is supplementary: pointer-events none by default, never blocks
// journal content, disappears when there are no upcoming reminders.

import * as stylex from '@stylexjs/stylex';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Reminder } from '../lib/supabase';
import { toISODate, isoWeekday } from '../lib/dates';

const CORAL = 'var(--color-accent)';
const CORAL_LIGHT = 'color-mix(in srgb, var(--color-accent), white 35%)';
const STONE = 'var(--color-text-disabled)';
const STONE_LIGHT = 'color-mix(in srgb, var(--color-text-disabled), white 25%)';

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
  glow: boolean;
  // Screen position of the planet (nearest edge to the target sheet)
  left: string;
  top: string;
  // Angle in degrees for the arrow (0 = right, 90 = down, -90 = up)
  angle: number;
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
      return { color: 'var(--color-accent)', light: 'color-mix(in srgb, var(--color-accent), white 35%)', glow: false };
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
  planet: (size: number, color: string, glow: boolean) => ({
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: color,
    boxShadow: glow ? `0 0 12px ${color}a6` : 'none',
  }),
  // Detail popup when a planet is tapped
  popup: {
    position: 'fixed',
    zIndex: 20,
    pointerEvents: 'auto',
    backgroundColor: 'var(--color-background-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 12,
    padding: '12px 14px',
    maxWidth: 260,
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  },
  popupTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 4,
    color: 'var(--color-text-primary)',
  },
  popupDate: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    marginBottom: 6,
  },
  popupDetail: {
    fontSize: 13,
    color: 'var(--color-text-primary)',
    lineHeight: 1.4,
  },
  popupClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: 16,
    color: 'var(--color-text-secondary)',
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
  const [selected, setSelected] = useState<Reminder | null>(null);
  // Reminder dates currently visible in the viewport.
  // Uses IntersectionObserver on the specific reminder date sheets.
  const [visibleReminderDates, setVisibleReminderDates] = useState<Set<string>>(new Set());
  const reminderObserverRef = useRef<IntersectionObserver | null>(null);
  // Scroll position tracker: forces planet repositioning when sheets move.
  const [scrollTick, setScrollTick] = useState(0);

  // Observe reminder date sheets. Re-observe when reminders or weekday change
  // (sheets re-render). The observer hides a planet when its date is visible.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Clean up previous observer
    reminderObserverRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleReminderDates((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const entry of entries) {
            const iso = (entry.target as HTMLElement).dataset.reminderDate;
            if (!iso) continue;
            if (entry.isIntersecting) {
              if (!next.has(iso)) {
                next.add(iso);
                changed = true;
              }
            } else {
              if (next.has(iso)) {
                next.delete(iso);
                changed = true;
              }
            }
          }
          return changed ? next : prev;
        });
      },
      {
        root: viewport,
        threshold: 0.1, // At least 10% visible counts as "on screen"
      },
    );

    reminderObserverRef.current = observer;

    // Observe the date elements containing each reminder date. All seven
    // weekday sheets stay mounted, so an exact ISO match finds the date in
    // its own sheet (e.g. Oct 8 lives in the Thursday sheet).
    const raf = requestAnimationFrame(() => {
      const seen = new Set<string>();
      for (const r of reminders) {
        const remindDate = new Date(r.remind_at);
        remindDate.setHours(0, 0, 0, 0);
        const dateIso = toISODate(remindDate);
        if (seen.has(dateIso)) continue;
        seen.add(dateIso);

        const el = document.querySelector(`[data-sheet-iso="${dateIso}"]`);
        if (el) {
          // Tag it so the observer can identify it
          (el as HTMLElement).dataset.reminderDate = dateIso;
          observer.observe(el);
        }
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      reminderObserverRef.current = null;
    };
  }, [viewportRef, reminders, currentWeekday]);

  // Reposition planets on scroll: the current sheet's own scroll container
  // drives updates. The math-based directions only depend on the weekday
  // grid; the same-weekday planet uses live DOM geometry, so it needs
  // scroll ticks.
  useEffect(() => {
    const scroller = document.querySelector(
      `[data-sheet-scroll="${currentWeekday}"]`,
    );
    if (!scroller) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrollTick((t) => t + 1));
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [currentWeekday]);

  const planets = useMemo(() => {
    const viewport = viewportRef.current;
    if (!viewport) return [];

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const viewportRect = viewport.getBoundingClientRect();

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
        if (visibleReminderDates.has(dateIso)) return null;

        // 2D grid position: X = weekday axis, Y = week axis.
        // The reminder may be on a different weekday sheet, so we calculate
        // the direction mathematically, relative to what's currently visible.
        //
        // Example: Fri Oct 2 (viewing) → Thu Oct 8.
        // dx = 4 - 5 = -1 (Thursday is 1 swipe left from Friday)
        // dy = weeks from the currently viewed date to the reminder
        const remindWeekday = isoWeekday(remindDate);
        let dx = remindWeekday - currentWeekday;
        // Normalize to [-3, 3] for the shortest swipe direction
        if (dx > 3) dx -= 7;
        if (dx < -3) dx += 7;

        // Find the date currently at the viewport center of the active sheet.
        // dy is measured from THERE, not from the anchor, so the planet
        // reflects the current scroll position.
        let viewedDate: Date | null = null;
        const scroller = viewport.querySelector(
          `[data-sheet-scroll="${currentWeekday}"]`,
        );
        if (scroller) {
          const scrollerRect = scroller.getBoundingClientRect();
          const centerY = scrollerRect.top + scrollerRect.height / 2;
          const dateEls = scroller.querySelectorAll('[data-sheet-iso]');
          for (const el of dateEls) {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.top <= centerY && rect.bottom >= centerY) {
              const iso = (el as HTMLElement).dataset.sheetIso;
              if (iso) {
                viewedDate = new Date(iso + 'T00:00:00');
                break;
              }
            }
          }
        }
        // Fallback to anchor if we can't determine the viewed date
        const refDate = viewedDate ?? anchorDate;
        const dayDiff =
          (remindDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24);
        // dy in weeks: positive = future (down), negative = past (up).
        // Subtract dx because the weekday difference is already accounted for
        // in the horizontal axis.
        const dy = (dayDiff - dx) / 7;

        // If the user is on the reminder's weekday, try DOM position for
        // precise nearest-edge placement. Otherwise use the math vector.
        let sheetCenterX: number | null = null;
        let sheetCenterY: number | null = null;
        if (dx === 0) {
          const el = document.querySelector(`[data-sheet-iso="${dateIso}"]`);
          if (el) {
            const rect = (el as HTMLElement).getBoundingClientRect();
            sheetCenterX = rect.left + rect.width / 2;
            sheetCenterY = rect.top + rect.height / 2;
          }
        }

        // Angle in screen coordinates (0 = right, 90 = down).
        // +dx = right (next weekday), +dy = down (future week).
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

        const rad = (angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const absCos = Math.abs(cos);
        const absSin = Math.abs(sin);

        let left: string;
        let top: string;

        if (sheetCenterX !== null && sheetCenterY !== null) {
          // Use actual sheet position for nearest-edge placement.
          if (absSin > absCos) {
            const isBelow = sin > 0;
            top = isBelow
              ? `calc(100% - ${EDGE_MARGIN + 24 + 16}px)`
              : `${EDGE_MARGIN}px`;
            const clampedX = Math.max(
              viewportRect.left + EDGE_MARGIN + 12,
              Math.min(viewportRect.right - EDGE_MARGIN - 12, sheetCenterX),
            );
            const pct =
              ((clampedX - viewportRect.left) / viewportRect.width) * 100;
            left = `${Math.max(5, Math.min(95, pct))}%`;
          } else {
            const isRight = cos > 0;
            left = isRight
              ? `calc(100% - ${EDGE_MARGIN + 24}px)`
              : `${EDGE_MARGIN}px`;
            const clampedY = Math.max(
              viewportRect.top + EDGE_MARGIN + 20,
              Math.min(viewportRect.bottom - EDGE_MARGIN - 20, sheetCenterY),
            );
            const pct =
              ((clampedY - viewportRect.top) / viewportRect.height) * 100;
            top = `${Math.max(5, Math.min(95, pct))}%`;
          }
        } else {
          // Estimate from the 2D vector.
          // If dx != 0 (different weekday), the user must swipe horizontally
          // first — place the planet on the left/right edge. The vertical
          // position hints at the week offset within the target sheet.
          // If dx == 0 (same weekday), place on top/bottom for vertical scroll.
          if (dx !== 0) {
            const isRight = dx > 0;
            left = isRight
              ? `calc(100% - ${EDGE_MARGIN + 24}px)`
              : `${EDGE_MARGIN}px`;
            // Vertical offset based on dy: positive dy (future) shifts down,
            // negative dy (past) shifts up. Clamp to avoid edges.
            const verticalShift = Math.max(-30, Math.min(30, dy * 15));
            const basePct = 50 + verticalShift;
            top = `${Math.max(10, Math.min(90, basePct))}%`;
          } else {
            const isBelow = dy > 0;
            top = isBelow
              ? `calc(100% - ${EDGE_MARGIN + 24 + 16}px)`
              : `${EDGE_MARGIN}px`;
            left = '50%';
          }
        }

        // Size: 12px (far) -> 24px (soon), based on days until
        const soonness = Math.max(0, 1 - daysUntil / WINDOW_DAYS);
        const size = Math.round(MIN_SIZE + soonness * (MAX_SIZE - MIN_SIZE));

        // Opacity: 0.35 (far) -> 1.0 (near)
        const opacity = 0.35 + soonness * 0.65;

        // z-index: 1 (far) -> 3 (near)
        const zIndex = 1 + Math.round(soonness * 2);

        const { color, glow } = urgencyToColor(r.urgency);

        return {
          reminder: r,
          daysUntil,
          size,
          opacity,
          zIndex,
          color,
          glow,
          left,
          top,
          angle,
        } as PlanetData;
      })
      .filter((p): p is PlanetData => p !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders, viewportRef, currentWeekday, anchorDate, visibleReminderDates, scrollTick]);

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
          glow,
          left,
          top,
          angle,
        } = planet;

        // Rotation: arrow points up at 0°, so rotate by (angle + 90°)
        // to point along the vector. 0° (right) → 90°, 90° (down) → 180°.
        const rotation = angle + 90;

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
                backgroundColor: color,
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

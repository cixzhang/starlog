// ReminderRadar: supplementary ambient overlay showing upcoming reminders as
// planets on an endless 2D sheet.
//
// Each reminder's planet positions itself at the screen edge nearest to the
// actual date sheet's position (via getBoundingClientRect), with the arrow
// pointing toward the sheet. If the date is visible on screen, the planet is
// removed entirely. Planets reposition on scroll as sheets move.
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
import { toISODate } from '../lib/dates';

const CORAL = 'var(--sl-coral)';
const CORAL_LIGHT = 'color-mix(in srgb, var(--sl-coral), white 35%)';
const STONE = 'var(--sl-ink-faint)';
const STONE_LIGHT = 'color-mix(in srgb, var(--sl-ink-faint), white 25%)';

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
      return { color: 'var(--sl-gold)', light: 'color-mix(in srgb, var(--sl-gold), white 35%)', glow: false };
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
    backgroundColor: 'var(--sl-paper-deep)',
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

    // Observe the sheet elements containing each reminder date.
    // Sheets are week-based, so find the sheet whose 7-day range
    // contains the reminder date.
    const raf = requestAnimationFrame(() => {
      const seen = new Set<string>();
      for (const r of reminders) {
        const remindDate = new Date(r.remind_at);
        remindDate.setHours(0, 0, 0, 0);
        const dateIso = toISODate(remindDate);
        if (seen.has(dateIso)) continue;
        seen.add(dateIso);

        const sheetElements = document.querySelectorAll('[data-sheet-iso]');
        for (const el of sheetElements) {
          const sheetIso = (el as HTMLElement).dataset.sheetIso;
          if (!sheetIso) continue;
          const sheetDate = new Date(sheetIso + 'T00:00:00');
          const diffDays = Math.round(
            (remindDate.getTime() - sheetDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          if (diffDays >= 0 && diffDays < 7) {
            // Tag it so the observer can identify it
            (el as HTMLElement).dataset.reminderDate = dateIso;
            observer.observe(el);
            break;
          }
        }
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      reminderObserverRef.current = null;
    };
  }, [viewportRef, reminders, currentWeekday, anchorDate]);

  // Reposition planets on scroll: sheet positions change as the user scrolls.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrollTick((t) => t + 1));
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      viewport.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, [viewportRef]);

  const planets = useMemo(() => {
    const viewport = viewportRef.current;
    if (!viewport) return [];

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const viewportRect = viewport.getBoundingClientRect();
    const viewportCenterX = viewportRect.left + viewportRect.width / 2;
    const viewportCenterY = viewportRect.top + viewportRect.height / 2;

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

        // Find the sheet containing this reminder date.
        // Sheets are week-based (7 days each), so the reminder date falls
        // within a sheet's week range, not necessarily matching its ID.
        let sheetEl: HTMLElement | null = null;
        const sheetElements = document.querySelectorAll('[data-sheet-iso]');
        for (const el of sheetElements) {
          const sheetIso = (el as HTMLElement).dataset.sheetIso;
          if (!sheetIso) continue;
          const sheetDate = new Date(sheetIso + 'T00:00:00');
          const diffDays = Math.round(
            (remindDate.getTime() - sheetDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          // The sheet covers its date ± 3 days (a week centered on the weekday)
          // Actually: sheets are 7 days apart, so check if within 0-6 days
          if (diffDays >= 0 && diffDays < 7) {
            sheetEl = el as HTMLElement;
            break;
          }
        }

        let sheetCenterX: number;
        let sheetCenterY: number;

        if (sheetEl) {
          const sheetRect = sheetEl.getBoundingClientRect();
          sheetCenterX = sheetRect.left + sheetRect.width / 2;
          sheetCenterY = sheetRect.top + sheetRect.height / 2;
        } else {
          // Sheet not rendered (outside the current window): estimate position.
          // Future dates are below, past dates are above. Center horizontally.
          const isFuture = daysUntil >= 0;
          sheetCenterX = viewportCenterX;
          sheetCenterY = isFuture
            ? viewportRect.bottom + 1000  // Below the viewport
            : viewportRect.top - 1000;     // Above the viewport
        }

        // Vector from viewport center to sheet center
        const dx = sheetCenterX - viewportCenterX;
        const dy = sheetCenterY - viewportCenterY;

        // Angle in screen coordinates (0 = right, 90 = down)
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

        // Determine the nearest edge: project the direction onto the viewport.
        // If the sheet is mostly above/below, use top/bottom edge.
        // If mostly left/right, use left/right edge.
        const rad = (angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const absCos = Math.abs(cos);
        const absSin = Math.abs(sin);

        let left: string;
        let top: string;

        if (absSin > absCos) {
          // Sheet is above or below: place at top/bottom edge.
          // Align horizontally nearest to the sheet's x position.
          const isBelow = sin > 0;
          top = isBelow
            ? `calc(100% - ${EDGE_MARGIN + 24 + 16}px)`
            : `${EDGE_MARGIN}px`;
          // Clamp the sheet's x to the viewport, as a percentage
          const clampedX = Math.max(
            viewportRect.left + EDGE_MARGIN + 12,
            Math.min(
              viewportRect.right - EDGE_MARGIN - 12,
              sheetCenterX,
            ),
          );
          const pct =
            ((clampedX - viewportRect.left) / viewportRect.width) * 100;
          left = `${Math.max(5, Math.min(95, pct))}%`;
        } else {
          // Sheet is to the left or right: place at left/right edge.
          // Align vertically nearest to the sheet's y position.
          const isRight = cos > 0;
          left = isRight
            ? `calc(100% - ${EDGE_MARGIN + 24}px)`
            : `${EDGE_MARGIN}px`;
          const clampedY = Math.max(
            viewportRect.top + EDGE_MARGIN + 20,
            Math.min(
              viewportRect.bottom - EDGE_MARGIN - 20,
              sheetCenterY,
            ),
          );
          const pct =
            ((clampedY - viewportRect.top) / viewportRect.height) * 100;
          top = `${Math.max(5, Math.min(95, pct))}%`;
        }

        // Size: 12px (far) -> 24px (soon), based on days until
        const soonness = Math.max(0, 1 - daysUntil / WINDOW_DAYS);
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
          colorLight,
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

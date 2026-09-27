// ReminderRadar: supplementary ambient overlay showing upcoming reminders as
// planets on an "endless sheet" model.
//
// The journal is treated as one big endless vertical sheet. Each reminder's
// date has an estimated Y position on that sheet (measured from loaded sheets,
// estimated for unloaded ones). The planet appears at the closest screen edge
// to that position. If the date is actually visible on screen, the planet is
// removed entirely.
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
import { toISODate } from '../lib/dates';

const CORAL = '#F16E56';
const CORAL_LIGHT = '#ff9a82';
const STONE = '#8a8478';
const STONE_LIGHT = '#b8b0a2';

const MAX_SIZE = 24;
const MIN_SIZE = 12;
const WINDOW_DAYS = 21; // current week + next two weeks

interface ReminderRadarProps {
  reminders: Reminder[];
  // Ref to the scroll viewport containing the sheets
  viewportRef: React.RefObject<HTMLDivElement | null>;
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
  // Estimated Y position of the date on the endless sheet,
  // relative to the viewport top (negative = above, > height = below)
  estimatedY: number;
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
});

/**
 * Estimate the Y position of a date on the endless sheet, relative to the
 * viewport top. Uses actual DOM measurements for loaded sheets, estimates
 * for unloaded ones based on week difference and average sheet height.
 */
function estimateDateY(
  dateIso: string,
  viewport: HTMLElement,
): { y: number; inView: boolean } | null {
  const viewportRect = viewport.getBoundingClientRect();

  // Try to find the actual sheet element
  const el = document.getElementById(`sheet-${dateIso}`);
  if (el) {
    const rect = el.getBoundingClientRect();
    const y = rect.top - viewportRect.top + rect.height / 2;
    const inView =
      rect.bottom > viewportRect.top && rect.top < viewportRect.bottom;
    return { y, inView };
  }

  // Not loaded: estimate from nearest loaded sheet
  const sheets = Array.from(
    document.querySelectorAll('[id^="sheet-"]'),
  ) as HTMLElement[];
  if (sheets.length === 0) return null;

  // Parse dates and find nearest
  const target = new Date(dateIso + 'T12:00:00');
  let nearest: HTMLElement | null = null;
  let nearestDiff = Infinity;

  for (const sheet of sheets) {
    const iso = sheet.id.replace('sheet-', '');
    const d = new Date(iso + 'T12:00:00');
    const diff = Math.abs(d.getTime() - target.getTime());
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearest = sheet;
    }
  }

  if (!nearest) return null;

  const nearestIso = nearest.id.replace('sheet-', '');
  const nearestDate = new Date(nearestIso + 'T12:00:00');
  const weekDiff = Math.round(
    (target.getTime() - nearestDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );

  // Average sheet height from loaded sheets
  const heights = sheets.map((s) => s.getBoundingClientRect().height);
  const avgHeight =
    heights.reduce((a, b) => a + b, 0) / heights.length;

  const nearestRect = nearest.getBoundingClientRect();
  const nearestY =
    nearestRect.top - viewportRect.top + nearestRect.height / 2;
  const y = nearestY + weekDiff * avgHeight;

  // Estimate inView: if the weekDiff is 0, it should be near the nearest
  // sheet; otherwise it's definitely off-screen
  const inView = weekDiff === 0 &&
    nearestRect.bottom > viewportRect.top &&
    nearestRect.top < viewportRect.bottom;

  return { y, inView };
}

export default function ReminderRadar({
  reminders,
  viewportRef,
  onPlanetTap,
}: ReminderRadarProps) {
  const [scrollTick, setScrollTick] = useState(0);

  // Re-estimate positions on scroll
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
        const pos = estimateDateY(dateIso, viewport);
        if (!pos) return null;

        // If the date is visible on screen, remove the planet entirely
        if (pos.inView) return null;

        // Size: 12px (far) -> 24px (soon)
        const soonness = 1 - daysUntil / WINDOW_DAYS;
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
          estimatedY: pos.y,
          inView: false,
        } as PlanetData;
      })
      .filter((p): p is PlanetData => p !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders, viewportRef, scrollTick]);

  if (planets.length === 0) return null;

  return (
    <div {...stylex.props(styles.container)} aria-hidden="true">
      {planets.map((planet, index) => {
        const {
          reminder,
          size,
          opacity,
          zIndex,
          color,
          colorLight,
          glow,
          estimatedY,
        } = planet;

        // Closest edge: if estimatedY is above viewport, pin to top;
        // if below, pin to bottom. The arrow points toward the date.
        const isAbove = estimatedY < 0;
        const rotation = isAbove ? 0 : 180; // 0=up, 180=down

        // Horizontal: stagger slightly to avoid overlap, centered
        const stagger = (index % 3) * 36 - 36;

        const positionStyle = isAbove
          ? {
              left: `calc(50% - 12px + ${stagger}px)`,
              top: '8px',
            }
          : {
              left: `calc(50% - 12px + ${stagger}px)`,
              top: 'calc(100% - 32px)',
            };

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
              ...positionStyle,
            }}
            onClick={() =>
              onPlanetTap?.(toISODate(new Date(reminder.remind_at)))
            }
            title={reminder.title}
          >
            <div {...stylex.props(styles.arrow(color))}>▲</div>
            <div
              {...stylex.props(styles.planet(size, color, colorLight, glow))}
            />
          </div>
        );
      })}
    </div>
  );
}

// ReminderRadar: supplementary ambient overlay showing upcoming reminders as
// planets. Each planet is an arrow+planet composition (arrow on top, planet
// centered below), rotated to point toward the reminder's date.
//
// Visual encoding:
// - Size (12-24px): soonness — larger = sooner
// - Color: urgency — stone (#8a8478) for calm, coral (#F16E56) for urgent
// - Opacity + z-index: time distance — far = translucent and behind
// - Position: pinned near screen edges when the date is off-screen;
//   slides to true position when scrolled into view (arrow hides)
//
// The radar is supplementary: pointer-events none by default, never blocks
// journal content, disappears when there are no upcoming reminders.

import * as stylex from '@stylexjs/stylex';
import { useMemo } from 'react';
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
  // ISO dates currently visible in the viewport
  visibleDates: Set<string>;
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
  rotation: number;
  edge: 'top' | 'bottom' | 'left' | 'right';
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
  // The composition wrapper: rotates as a unit, positioned at edge
  composition: (
    rotation: number,
    opacity: number,
    zIndex: number,
  ) => ({
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    transform: `rotate(${rotation}deg)`,
    opacity,
    zIndex,
    pointerEvents: 'auto',
    cursor: 'pointer',
  }),
  arrow: (color: string, visible: boolean) => ({
    fontSize: 11,
    lineHeight: 1,
    color,
    marginBottom: 4,
    visibility: visible ? 'visible' : 'hidden',
  }),
  planet: (size: number, color: string, colorLight: string, glow: boolean) => ({
    width: size,
    height: size,
    borderRadius: '50%',
    background: `radial-gradient(circle at 35% 35%, ${colorLight}, ${color})`,
    boxShadow: glow ? `0 0 12px ${color}a6` : 'none',
  }),
});

export default function ReminderRadar({
  reminders,
  visibleDates,
  onPlanetTap,
}: ReminderRadarProps) {
  const planets = useMemo(() => {
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

        const dateStr = toISODate(remindDate);
        const inView = visibleDates.has(dateStr);

        // Size: 12px (far) -> 24px (soon)
        const soonness = 1 - daysUntil / WINDOW_DAYS;
        const size = Math.round(MIN_SIZE + soonness * (MAX_SIZE - MIN_SIZE));

        // Opacity: 0.35 (far) -> 1.0 (near)
        const opacity = 0.35 + soonness * 0.65;

        // z-index: 1 (far) -> 3 (near)
        const zIndex = 1 + Math.round(soonness * 2);

        const { color, light, glow } = urgencyToColor(r.urgency);

        // Edge and rotation: soon = bottom (future is below in scroll),
        // further = distributed to sides
        let edge: PlanetData['edge'];
        let rotation: number;

        if (daysUntil <= 7) {
          edge = 'bottom';
          rotation = 180;
        } else {
          // Alternate left/right for visual distribution
          const hash = r.id.charCodeAt(0) % 2;
          edge = hash === 0 ? 'left' : 'right';
          rotation = hash === 0 ? -90 : 90;
        }

        return {
          reminder: r,
          daysUntil,
          size,
          opacity,
          zIndex,
          color,
          colorLight: light,
          glow,
          rotation,
          edge,
          inView,
        } as PlanetData;
      })
      .filter((p): p is PlanetData => p !== null);
  }, [reminders, visibleDates]);

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
          rotation,
          edge,
          inView,
        } = planet;

        // Position near edge with 6-8px margin, staggered to avoid overlap
        let positionStyle: Record<string, string | number> = {};
        const stagger = (index % 3) * 36;

        switch (edge) {
          case 'bottom':
            positionStyle = {
              bottom: 8,
              left: `calc(50% - 12px + ${stagger - 36}px)`,
            };
            break;
          case 'top':
            positionStyle = {
              top: 8,
              left: `calc(50% - 12px + ${stagger - 36}px)`,
            };
            break;
          case 'left':
            positionStyle = {
              left: 6,
              top: `${35 + (index % 4) * 12}%`,
            };
            break;
          case 'right':
            positionStyle = {
              right: 6,
              top: `${35 + (index % 4) * 12}%`,
            };
            break;
        }

        return (
          <div
            key={reminder.id}
            {...stylex.props(styles.composition(rotation, opacity, zIndex))}
            style={positionStyle}
            onClick={() =>
              onPlanetTap?.(toISODate(new Date(reminder.remind_at)))
            }
            title={reminder.title}
          >
            <div {...stylex.props(styles.arrow(color, !inView))}>▲</div>
            <div
              {...stylex.props(styles.planet(size, color, colorLight, glow))}
            />
          </div>
        );
      })}
    </div>
  );
}

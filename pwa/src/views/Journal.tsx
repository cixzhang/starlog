// Journal: seven persistent weekday sheets in a horizontal carousel.
//
// Each weekday (Mon..Sun) owns a mounted WeekdaySheet with its own scroll
// container, scroll position, and past/future window. The carousel keeps the
// current weekday at strip index 3 with three buffered columns on each side:
//
//   index:  0          1          2          3        4          5          6
//           cur-3      cur-2      cur-1      CURRENT  cur+1      cur+2      cur+3
//
// The strip is 700% wide; each column is 1/7 (one viewport width). The base
// transform is -300/7% (showing index 3). A swipe left animates the strip
// from -3 to -4 viewport widths (revealing index 4); on completion the
// weekday advances — which reorders the columns under the strip — and the
// transform snaps back to -3 widths with no visual jump, since the new
// current column moved into index 3. Swiping right mirrors this. Because the
// columns are keyed by weekday number, React preserves each sheet's component
// identity (and scroll state) across reorders, and cycling is infinite in
// both directions.
//
// Data fetching covers the union of dates requested by all seven sheets.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as stylex from '@stylexjs/stylex';
import {
  fetchDecorations,
  fetchEntriesByDates,
  fetchPromptsByDates,
  fetchReminders,
  type Decoration,
  type Entry,
  type Prompt,
  type Reminder,
  type SbConfig,
} from '../lib/supabase';
import { addDays, isoWeekday, parseISODate, startOfWeek, toISODate } from '../lib/dates';
import WeekdaySheet from '../components/WeekdaySheet';
import ReminderRadar from '../components/ReminderRadar';

export interface WeekdayControls {
  weekday: number;
  move: (delta: number) => void;
  goToday: () => void;
}

interface JournalProps {
  cfg: SbConfig;
  tenantId: string;
  jump: { weekday: number; date: string } | null;
  onJumpConsumed: () => void;
  onControls: (ctl: WeekdayControls | null) => void;
  weekStart: 1 | 7;
}

const SWIPE_THRESHOLD = 80;

/** Carousel column order: the given weekday is always at index 3. */
function orderFor(w: number): number[] {
  return Array.from({ length: 7 }, (_, i) => ((((w - 3 - 1 + i) % 7) + 7) % 7) + 1);
}

export default function Journal({
  cfg,
  tenantId,
  jump,
  onJumpConsumed,
  onControls,
  weekStart,
}: JournalProps) {
  const [weekday, setWeekday] = useState<number>(() => isoWeekday(new Date()));
  const [dragX, setDragX] = useState<number | null>(null);
  // Desktop (min-width 768px) shows prev/current/next sheets side by side.
  // The strip is 700/3% wide there, so the base offset is -200/7% (index 2
  // at the left) instead of -300/7% (index 3 at the left).
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Shared vertical scroll window: all seven sheets render the same
  // past/future weeks. The single scroll container is stripViewport.
  const stripViewportRef = useRef<HTMLDivElement>(null);
  const [past, setPast] = useState(8);
  const [future, setFuture] = useState(8);
  const initializedRef = useRef(false);

  // Scroll the BODY so the given weekday's k=0 is at the top.
  // The body is the single scroll container (not stripViewport).
  // scrollIntoView({block: 'start'}) top-aligns; scroll-margin-top on the
  // date leaves room for the sticky header. No manual math needed.
  const scrollToK0 = useCallback((wd: number) => {
    const k0El = document.querySelector(
      `[data-sheet-column="${wd}"] [data-sheet-k="0"]`,
    ) as HTMLElement | null;
    if (!k0El) {
      return;
    }
    k0El.scrollIntoView({ block: 'start' });
  }, []);

  // Initial scroll: land on this week's date.
  useEffect(() => {
    if (initializedRef.current) return;
    const tryInit = () => {
      const k0El = document.querySelector(
        `[data-sheet-column="${weekday}"] [data-sheet-k="0"]`,
      ) as HTMLElement | null;
      if (!k0El) {
        requestAnimationFrame(tryInit);
        return;
      }
      // Check if the element has been positioned (absolute positioning applied).
      // offsetTop will be MIDDLE (15000) once laid out, 0 before.
      if (k0El.offsetTop === 0) {
        requestAnimationFrame(tryInit);
        return;
      }
      scrollToK0(weekday);
      initializedRef.current = true;
    };
    requestAnimationFrame(tryInit);
  }, [weekday, scrollToK0]);

  // Infinite scroll on the BODY. Triggers off the rendered content edges
  // (not the 30,000px canvas edges). The canvas is fixed, so prepending
  // dates does not change document height — no scroll adjustment needed.
  useEffect(() => {
    let cooldown = false;
    const onScroll = () => {
      if (cooldown) return;
      const EDGE_PX = 800;
      // Find the active sheet's first/last rendered dates.
      const firstEl = document.querySelector(
        `[data-sheet-column="${weekday}"] [data-sheet-k="${-past}"]`,
      ) as HTMLElement | null;
      const lastEl = document.querySelector(
        `[data-sheet-column="${weekday}"] [data-sheet-k="${future}"]`,
      ) as HTMLElement | null;
      if (!firstEl || !lastEl) return;
      const firstTop = firstEl.getBoundingClientRect().top;
      const lastBottom = lastEl.getBoundingClientRect().bottom;
      const vh = window.innerHeight;
      if (firstTop > -EDGE_PX && firstTop < vh + EDGE_PX) {
        // Near the top edge — extend past.
        // (Only if we're actually near the top of the rendered content,
        // not just because the element is in view.)
        if (firstTop < EDGE_PX) {
          cooldown = true;
          setPast((p) => p + 8);
          setTimeout(() => { cooldown = false; }, 400);
        }
      }
      if (lastBottom > -EDGE_PX && lastBottom < vh + EDGE_PX) {
        if (lastBottom > vh - EDGE_PX) {
          cooldown = true;
          setFuture((f) => f + 8);
          setTimeout(() => { cooldown = false; }, 400);
        }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [weekday, past, future]);

  const [entriesByDate, setEntriesByDate] = useState<Record<string, Entry>>({});
  const [promptsByDate, setPromptsByDate] = useState<Record<string, Prompt>>({});
  const [decosByDate, setDecosByDate] = useState<Record<string, Decoration[]>>({});
  const [allReminders, setAllReminders] = useState<Reminder[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  // Local jump for radar taps (separate from the Calendar jump prop).
  const [radarJump, setRadarJump] = useState<{ weekday: number; date: string } | null>(null);
  const [fetchVersion, setFetchVersion] = useState(0);

  // "Now" refreshes if the day rolls over while the app is open/suspended.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => {
      setNow((prev) => {
        const next = new Date();
        return toISODate(next) !== toISODate(prev) ? next : prev;
      });
    }, 60000);
    return () => clearInterval(t);
  }, []);
  const todayIso = toISODate(now);
  const fetchedDates = useRef<Set<string>>(new Set());
  const reminderBounds = useRef<{ from: Date; to: Date } | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const order = useMemo(() => orderFor(weekday), [weekday]);

  const anchors = useMemo(() => {
    const arr: Date[] = [];
    for (let w = 1; w <= 7; w++) {
      arr[w] = addDays(startOfWeek(now, weekStart), (w - weekStart + 7) % 7);
    }
    return arr;
  }, [now, weekStart]);

  // Fetch data for any dates the sheets request (the union across all seven).
  const onNeedDates = useCallback(
    (dates: string[]) => {
      const fresh = dates.filter((d) => !fetchedDates.current.has(d));
      if (fresh.length === 0) return;
      fresh.forEach((d) => fetchedDates.current.add(d));
      setFetchVersion((v) => v + 1);
      (async () => {
        try {
          const [es, ps, ds] = await Promise.all([
            fetchEntriesByDates(cfg, tenantId, fresh),
            fetchPromptsByDates(cfg, tenantId, fresh),
            fetchDecorations(cfg, tenantId, fresh),
          ]);
          if (!mountedRef.current) return;
          setEntriesByDate((prev) => {
            const next = { ...prev };
            for (const e of es) if (!next[e.entry_date]) next[e.entry_date] = e;
            return next;
          });
          setPromptsByDate((prev) => {
            const next = { ...prev };
            for (const p of ps) next[p.prompt_date] = p;
            return next;
          });
          setDecosByDate((prev) => {
            const next = { ...prev };
            for (const d of ds) {
              const key = d.entry_date ?? '';
              if (!key || fetchedDates.current.has(`deco:${d.id}`)) continue;
              fetchedDates.current.add(`deco:${d.id}`);
              (next[key] ??= []).push(d);
            }
            return next;
          });
          setFetchError(null);
        } catch (e) {
          if (!mountedRef.current) return;
          // Let a later extension retry these dates.
          fresh.forEach((d) => fetchedDates.current.delete(d));
          setFetchError(e instanceof Error ? e.message : 'Couldn\u2019t load.');
        }
      })();
    },
    [cfg, tenantId],
  );

  // Realtime updates for entries, prompts, and reminders.
  useEffect(() => {
    const sb = createClient(cfg.url, cfg.anonKey);
    const channel = sb
      .channel('starlog-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Entry | null;
          if (!row) return;
          const date = (row as Entry).entry_date;
          if (payload.eventType === 'DELETE') {
            setEntriesByDate((prev) => {
              const next = { ...prev };
              delete next[date];
              return next;
            });
          } else {
            setEntriesByDate((prev) => ({ ...prev, [date]: row as Entry }));
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prompts' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Prompt | null;
          if (!row) return;
          const date = (row as Prompt).prompt_date;
          if (payload.eventType === 'DELETE') {
            setPromptsByDate((prev) => {
              const next = { ...prev };
              delete next[date];
              return next;
            });
          } else {
            setPromptsByDate((prev) => ({ ...prev, [date]: row as Prompt }));
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reminders' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Reminder | null;
          if (!row?.id) return;
          if (payload.eventType === 'DELETE') {
            setAllReminders((prev) => prev.filter((r) => r.id !== row.id));
          } else if (payload.eventType === 'INSERT') {
            setAllReminders((prev) =>
              prev.some((r) => r.id === row.id) ? prev : [...prev, row],
            );
          } else {
            setAllReminders((prev) =>
              prev.map((r) => (r.id === row.id ? row : r)),
            );
          }
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [cfg]);

  // Reminders: keep a fetched window covering the loaded dates ±30 days.
  useEffect(() => {
    let alive = true;
    let min: string | null = null;
    let max: string | null = null;
    for (const key of fetchedDates.current) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      if (min === null || key < min) min = key;
      if (max === null || key > max) max = key;
    }
    if (min === null || max === null) return;
    const minD = addDays(parseISODate(min), -30);
    const maxD = addDays(parseISODate(max), 30);
    const b = reminderBounds.current;
    if (b && minD >= b.from && maxD <= b.to) return;
    (async () => {
      try {
        const rs = await fetchReminders(
          cfg,
          tenantId,
          minD.toISOString(),
          maxD.toISOString(),
        );
        if (!alive) return;
        reminderBounds.current = {
          from: b ? new Date(Math.min(b.from.getTime(), minD.getTime())) : minD,
          to: b ? new Date(Math.max(b.to.getTime(), maxD.getTime())) : maxD,
        };
        setAllReminders((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          const next = [...prev];
          for (const r of rs)
            if (!seen.has(r.id)) {
              seen.add(r.id);
              next.push(r);
            }
          return next;
        });
      } catch {
        /* quiet: the radar just stays empty */
      }
    })();
    return () => {
      alive = false;
    };
  }, [cfg, tenantId, fetchVersion]);

  const remindersByDate = useMemo(() => {
    const map: Record<string, Reminder[]> = {};
    for (const r of allReminders) {
      const d = new Date(r.remind_at);
      d.setHours(0, 0, 0, 0);
      const key = toISODate(d);
      (map[key] ??= []).push(r);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => +new Date(a.remind_at) - +new Date(b.remind_at));
    }
    return map;
  }, [allReminders]);

  // Calendar jump: switch to the target weekday and let its sheet scroll to
  // the exact date. The sheet consumes the jump when it has scrolled.
  useEffect(() => {
    if (!jump) return;
    setWeekday(jump.weekday);
    setHighlighted(jump.date);
    // Clear after the flash animation so re-jumping re-triggers it.
    const t = setTimeout(() => setHighlighted(null), 1700);
    return () => clearTimeout(t);
  }, [jump]);

  // Radar tap jump: same as Calendar jump, but from a local state.
  useEffect(() => {
    if (!radarJump) return;
    setWeekday(radarJump.weekday);
    setHighlighted(radarJump.date);
    const t = setTimeout(() => setHighlighted(null), 1700);
    return () => clearTimeout(t);
  }, [radarJump]);

  const handleJumpHandled = useCallback(() => {
    onJumpConsumed();
    setRadarJump(null);
  }, [onJumpConsumed]);

  // --- Horizontal carousel gesture ---
  const animRef = useRef<number | null>(null);
  const dragState = useRef<{ startX: number; startY: number; claimed: boolean } | null>(null);

  const animateTo = useCallback(
    (from: number, to: number, duration: number, onDone: () => void) => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const start = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setDragX(from + (to - from) * eased);
        if (p < 1) {
          animRef.current = requestAnimationFrame(step);
        } else {
          animRef.current = null;
          onDone();
        }
      };
      animRef.current = requestAnimationFrame(step);
    },
    [],
  );

  useEffect(
    () => () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    },
    [],
  );

  /** Commit a swipe: the columns reorder under the strip, so advancing the
   *  weekday keeps the new current column at index 3 with no visual jump. */
  const commitSwipe = useCallback((dir: 1 | -1) => {
    setWeekday((prev) => ((((prev - 1 + dir) % 7) + 7) % 7) + 1);
    setDragX(null);
  }, []);

  const move = useCallback(
    (delta: number) => {
      const dir = (delta > 0 ? 1 : -1) as 1 | -1;
      const vw = stripViewportRef.current?.clientWidth ?? 0;
      if (vw === 0) {
        commitSwipe(dir);
        return;
      }
      // On desktop a sheet is 1/3 viewport; on mobile it's full viewport.
      const sheetW = isDesktop ? vw / 3 : vw;
      animateTo(0, -dir * sheetW, 200, () => commitSwipe(dir));
    },
    [animateTo, commitSwipe, isDesktop],
  );

  const goToday = useCallback(() => {
    setWeekday(isoWeekday(now));
  }, [now]);

  useEffect(() => {
    onControls({ weekday, move, goToday });
    return () => onControls(null);
  }, [weekday, move, goToday, onControls]);

  useEffect(() => {
    const viewport = stripViewportRef.current;
    if (!viewport) return;
    const onTouchStart = (e: TouchEvent) => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      const t = e.touches[0];
      dragState.current = { startX: t.clientX, startY: t.clientY, claimed: false };
      setDragX(null);
    };
    const onTouchMove = (e: TouchEvent) => {
      const s = dragState.current;
      if (!s) return;
      const t = e.touches[0];
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;
      if (!s.claimed) {
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          s.claimed = true;
          e.preventDefault();
        } else {
          return;
        }
      } else {
        e.preventDefault();
      }
      setDragX(dx);
    };
    const onTouchEnd = (e: TouchEvent) => {
      const s = dragState.current;
      dragState.current = null;
      if (!s || !s.claimed) {
        setDragX(null);
        return;
      }
      const dx = e.changedTouches[0].clientX - s.startX;
      const w = viewport.clientWidth;
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        const dir = (dx < 0 ? 1 : -1) as 1 | -1;
        // Slide fully onto the neighboring column, then commit: the columns
        // reorder underneath and the transform snaps back with no jump.
        // On desktop a sheet is 1/3 viewport.
        const sheetW = isDesktop ? w / 3 : w;
        animateTo(dx, -dir * sheetW, 180, () => commitSwipe(dir));
      } else {
        animateTo(dx, 0, 200, () => setDragX(null));
      }
    };
    const onTouchCancel = () => {
      dragState.current = null;
      setDragX(null);
    };
    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', onTouchEnd, { passive: true });
    viewport.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('touchend', onTouchEnd);
      viewport.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [animateTo, commitSwipe, isDesktop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  return (
    <div {...stylex.props(styles.journalRoot)}>
      <div {...stylex.props(styles.stripViewport)} ref={stripViewportRef}>
        <div
          {...stylex.props(styles.strip)}
          style={{
            transform: `translateX(calc(${(isDesktop ? -200 : -300) / 7}% + ${dragX ?? 0}px))`,
          }}
        >
          {order.map((w) => (
            <WeekdaySheet
              key={w}
              weekday={w}
              anchor={anchors[w]}
              now={now}
              todayIso={todayIso}
              highlighted={highlighted}
              fetchError={fetchError}
              past={past}
              future={future}
              entriesByDate={entriesByDate}
              promptsByDate={promptsByDate}
              decosByDate={decosByDate}
              remindersByDate={remindersByDate}
              onNeedDates={onNeedDates}
              jumpDate={
                (jump && jump.weekday === w ? jump.date : null) ||
                (radarJump && radarJump.weekday === w ? radarJump.date : null)
              }
              onJumpHandled={handleJumpHandled}
              onNeedWindow={(p, f) => {
                setPast((prev) => Math.max(prev, p));
                setFuture((prev) => Math.max(prev, f));
              }}
            />
          ))}
        </div>
        <ReminderRadar
          reminders={allReminders}
          currentWeekday={weekday}
          anchorDate={anchors[weekday]}
          onPlanetTap={(date) => {
            // Jump to the reminder's date: switch to its weekday column
            // and smooth-scroll to the date.
            const d = new Date(date + 'T00:00:00');
            const wd = isoWeekday(d);
            setRadarJump({ weekday: wd, date });
          }}
        />
      </div>
    </div>
  );
}

const styles = stylex.create({
  journalRoot: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  // Clips the strip horizontally for the carousel; vertically the content
  // expands the page and the BODY is the single scroll container.
  stripViewport: {
    overflowX: 'hidden',
    position: 'relative',
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  // 700% wide flex row of 7 columns; transform positions index 3 at -300/7%.
  // On desktop (min-width 768px), the strip shrinks to 700/3% so each column
  // is 1/3 viewport — the prev/current/next sheets are visible together.
  strip: {
    display: 'flex',
    width: '700%',
    flex: 1,
    minHeight: 0,
    willChange: 'transform',
    '@media (min-width: 768px)': {
      width: 'calc(700% / 3)',
    },
  },
});

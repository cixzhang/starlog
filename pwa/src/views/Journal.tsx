// Journal: the weekday canvas. Date-driven, not data-driven: the page always
// renders the same-weekday sheets computed from the calendar — this week's
// sheet plus past and future weeks — each with its short date heading and a
// relative label (THIS WEEK, LAST WEEK, NEXT WEEK…). Entries, prompts,
// reminders, and decorations fill in where the database has them; empty
// sheets stay quiet. Never fake data.
//
// The list scrolls infinitely in both directions. Today loads vertically
// centered, with a peek of last week above and next week below.

import {
  Activity,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
} from 'react';
import { createClient } from '@supabase/supabase-js';
import * as stylex from '@stylexjs/stylex';
import { Divider } from '@astryxdesign/core';
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
import {
  addDays,
  daysBetween,
  formatShort,
  isoWeekday,
  parseISODate,
  startOfWeek,
  toISODate,
} from '../lib/dates';
import { Markdown } from '../lib/markdown';
import { sanitizeSvg } from '../lib/svg';
import { ErrorNote } from '../components/ui';
import ReminderRadar from '../components/ReminderRadar';

const INIT_PAST = 3;
const INIT_FUTURE = 3;
const EXTEND_PAST = 8;
const EXTEND_FUTURE = 4;
const EDGE_PX = 240;
const SCROLL_COOLDOWN_MS = 400;

/** Relative week label for a sheet k weeks from this week. */
function relativeLabel(k: number): string | null {
  switch (k) {
    case 0:
      return 'THIS WEEK';
    case -1:
      return 'LAST WEEK';
    case -2:
      return 'TWO WEEKS AGO';
    case -3:
      return 'THREE WEEKS AGO';
    case 1:
      return 'NEXT WEEK';
    case 2:
      return 'IN TWO WEEKS';
    case 3:
      return 'IN THREE WEEKS';
    default:
      return null;
  }
}

const styles = stylex.create({
  // Swipe viewport: clips the off-screen weekday previews.
  swipeViewport: {
    overflow: 'hidden',
    position: 'relative',
  },
  sheets: {
    maxWidth: 680,
    margin: '0 auto',
    padding: '4px 0 72px',
    // Let horizontal swipes reach JS reliably: the browser only takes
    // vertical pans, so iOS can't hijack a diagonal swipe for scrolling
    // (which would cancel our touchend and "lose" the gesture).
    touchAction: 'pan-y',
    willChange: 'transform',
  },
  // Off-screen weekday preview, slides in under the finger during a swipe.
  preview: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    willChange: 'transform',
    display: 'flex',
    justifyContent: 'center',
  },
  previewInner: {
    width: '100%',
    maxWidth: 680,
  },
  sheet: {
    padding: '20px 20px 28px',
    color: 'var(--sl-ink)',
    // Each day holds its ground even when empty — the min-height is the
    // breathing room between date headings.
    minHeight: '20vh',
    // Skip rendering off-screen sheets to reduce scroll jank from
    // variable-height content. The intrinsic size estimate prevents
    // layout shifts.
    contentVisibility: 'auto',
    containIntrinsicSize: 'auto 20vh',
  },
  // Weeks other than this one recede: muted band, muted text.
  sheetMuted: {
    backgroundColor: 'var(--sl-paper-deep)',
    color: 'var(--sl-ink-soft)',
  },
  // Sheets use natural variable heights. Activity recycling handles
  // performance by only keeping ~7 sheets active.
  sheetHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  sheetDate: {
    fontFamily: 'var(--font-heading)',
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    margin: 0,
    color: 'var(--sl-ink)',
  },
  relLabel: {
    fontFamily: 'var(--font-code)',
    fontSize: 11,
    letterSpacing: '0.1em',
    color: 'var(--sl-ink-faint)',
    whiteSpace: 'nowrap',
  },
  todayPill: {
    fontFamily: 'var(--font-code)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: '#fff',
    backgroundColor: 'var(--sl-coral)',
    borderRadius: 999,
    padding: '4px 12px',
    whiteSpace: 'nowrap',
  },
  emptyState: {
    marginTop: 8,
    padding: '28px 0',
    textAlign: 'center',
    color: 'var(--sl-ink-faint)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.7,
  },
  anno: {
    marginTop: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  annoLine: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    fontSize: 14,
    color: 'var(--sl-ink-soft)',
  },
  annoLabel: {
    fontFamily: 'var(--font-code)',
    fontSize: 11,
    letterSpacing: '0.08em',
    color: 'var(--sl-ink-faint)',
    whiteSpace: 'nowrap',
  },
  annoDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: 'var(--sl-coral)',
    flexShrink: 0,
    alignSelf: 'center',
  },
  deco: {
    marginTop: 14,
  },
  fetchError: {
    padding: '12px 0 0',
  },
  highlight: {
    animationName: 'sl-flash',
    animationDuration: '2.4s',
    animationTimingFunction: 'ease-out',
  },
});

interface Sheet {
  k: number;
  date: Date;
  iso: string;
}

/** Weekday navigation controls, rendered by the app shell's top bar. */
export interface WeekdayControls {
  weekday: number;
  move: (delta: number) => void;
  goToday: () => void;
}

export default function Journal({
  cfg,
  tenantId,
  jump,
  onJumpConsumed,
  onControls,
  weekStart,
}: {
  cfg: SbConfig;
  tenantId: string;
  jump: { weekday: number; date: string } | null;
  onJumpConsumed: () => void;
  onControls: (ctl: WeekdayControls | null) => void;
  weekStart: 1 | 7;
}) {
  const [weekday, setWeekday] = useState<number>(() => isoWeekday(new Date()));
  // Track which sheets are near the viewport for Activity recycling.
  // Only ~7 sheets are visible/active at once; the rest are hidden
  // (state preserved) via React Activity.
  const [activeSheets, setActiveSheets] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [past, setPast] = useState(INIT_PAST);
  const [future, setFuture] = useState(INIT_FUTURE);
  const [entriesByDate, setEntriesByDate] = useState<Record<string, Entry>>({});
  const [promptsByDate, setPromptsByDate] = useState<Record<string, Prompt>>(
    {},
  );
  const [decosByDate, setDecosByDate] = useState<Record<string, Decoration[]>>(
    {},
  );
  const [allReminders, setAllReminders] = useState<Reminder[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [centerNonce, setCenterNonce] = useState(0);

  const now = useMemo(() => new Date(), []);
  const fetchedDates = useRef<Set<string>>(new Set());
  const reminderBounds = useRef<{ from: Date; to: Date } | null>(null);
  const centerDate = useRef<string | null>(toISODate(now));
  const jumpPending = useRef(false);
  const pendingPrepend = useRef<number | null>(null);
  const scrollCooldown = useRef(0);

  // The k=0 sheet: the selected weekday's date in the current week.
  // Offset of an ISO weekday from the configured week start.
  const weekOffset = (w: number) => (w - weekStart + 7) % 7;
  const anchor = useMemo(
    () => addDays(startOfWeek(now, weekStart), weekOffset(weekday)),
    [now, weekday, weekStart],
  );
  const sheets: Sheet[] = useMemo(() => {
    const out: Sheet[] = [];
    for (let k = -past; k <= future; k++) {
      const date = addDays(anchor, k * 7);
      out.push({ k, date, iso: toISODate(date) });
    }
    return out;
  }, [anchor, past, future]);

  // Adjacent weekdays for the swipe previews (1-7, wrapping).
  const prevWeekday = ((weekday - 2 + 7) % 7) + 1;
  const nextWeekday = (weekday % 7) + 1;

  // Anchor date for a given weekday: its date in the current week.
  const anchorFor = (w: number) =>
    addDays(startOfWeek(now, weekStart), weekOffset(w));

  // Dates for the swipe previews (3 sheets around each adjacent anchor).
  // Fetched alongside the main sheets so previews show full content.
  const previewDates = useMemo(() => {
    const out: string[] = [];
    for (const w of [prevWeekday, nextWeekday]) {
      const a = anchorFor(w);
      for (let k = -past; k <= future; k++) {
        out.push(toISODate(addDays(a, k * 7)));
      }
    }
    return out;
  }, [prevWeekday, nextWeekday, now, weekStart, weekday, past, future]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // Entries, prompts, decorations for sheets we haven't fetched yet.
  // Sheets render from the calendar regardless — data fills in.
  // Includes swipe-preview dates so adjacent weekdays show full content.
  useEffect(() => {
    let alive = true;
    const dates = [...sheets.map((s) => s.iso), ...previewDates].filter(
      (d) => !fetchedDates.current.has(d),
    );
    if (dates.length === 0) return;
    dates.forEach((d) => fetchedDates.current.add(d));
    (async () => {
      try {
        const [es, ps, ds] = await Promise.all([
          fetchEntriesByDates(cfg, tenantId, dates),
          fetchPromptsByDates(cfg, tenantId, dates),
          fetchDecorations(cfg, tenantId, dates),
        ]);
        if (!alive) return;
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
        if (alive) {
          // Let a later extension retry these dates.
          dates.forEach((d) => fetchedDates.current.delete(d));
          setFetchError(e instanceof Error ? e.message : 'Couldn’t load.');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [cfg, tenantId, sheets, previewDates]);

  // Realtime: listen for DB changes (entries, prompts, reminders) via
  // Supabase Realtime websocket. When the agent writes (e.g. from the
  // journaling chat), the UI updates live without a refresh.
  useEffect(() => {
    if (!cfg) return;
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

  // Reminders across the visible window (plus margin for the compass).
  // The window only grows, so merge by id and expand the tracked bounds.
  useEffect(() => {
    let alive = true;
    const minD = addDays(sheets[0].date, -30);
    const maxD = addDays(sheets[sheets.length - 1].date, 30);
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
        /* quiet: the compass just stays empty */
      }
    })();
    return () => {
      alive = false;
    };
  }, [cfg, tenantId, sheets]);

  const remindersByDate = useMemo(() => {
    const rb: Record<string, Reminder[]> = {};
    for (const r of allReminders) {
      const at = new Date(r.remind_at);
      const key = toISODate(
        new Date(at.getFullYear(), at.getMonth(), at.getDate()),
      );
      (rb[key] ??= []).push(r);
    }
    return rb;
  }, [allReminders]);

  // Center a sheet vertically in the visible area (below the app header).
  const recenter = useCallback(() => {
    const target = centerDate.current;
    centerDate.current = null;
    if (!target) return;
    const el = document.getElementById(`sheet-${target}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    const header = document.getElementById('sl-app-header');
    if (header) window.scrollBy(0, -header.offsetHeight / 2);
  }, []);

  useLayoutEffect(() => {
    recenter();
    if (jumpPending.current) {
      jumpPending.current = false;
      onJumpConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets, centerNonce]);

  // Keep the visual position stable when sheets are prepended above.
  useLayoutEffect(() => {
    if (pendingPrepend.current != null) {
      const delta =
        document.documentElement.scrollHeight - pendingPrepend.current;
      pendingPrepend.current = null;
      if (delta > 0) window.scrollBy(0, delta);
    }
  });

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

  const goWeekday = useCallback(
    (w: number, recenter = true) => {
      const a = addDays(startOfWeek(now, weekStart), weekOffset(w));
      setWeekday(w);
      setPast(INIT_PAST);
      setFuture(INIT_FUTURE);
      if (recenter) {
        centerDate.current = toISODate(a);
        setCenterNonce((n) => n + 1);
      }
    },
    [now, weekStart],
  );

  const move = useCallback(
    (delta: number, recenter = true) => {
      goWeekday(((weekday - 1 + delta + 7) % 7) + 1, recenter);
    },
    [weekday, goWeekday],
  );

  const goToday = useCallback(() => {
    goWeekday(isoWeekday(now));
  }, [goWeekday, now]);

  // Hand the weekday controls to the app shell's top bar.
  useEffect(() => {
    onControls({ weekday, move, goToday });
    return () => onControls(null);
  }, [weekday, move, goToday, onControls]);

  // Calendar jump: make sure the date is in the window, then center it.
  useEffect(() => {
    if (!jump) return;
    const a = addDays(startOfWeek(now, weekStart), weekOffset(jump.weekday));
    const k = Math.round(daysBetween(a, parseISODate(jump.date)) / 7);
    setWeekday(jump.weekday);
    setPast((p) => Math.max(p, k < 0 ? -k + 2 : INIT_PAST));
    setFuture((f) => Math.max(f, k > 0 ? k + 2 : INIT_FUTURE));
    centerDate.current = jump.date;
    jumpPending.current = true;
    setHighlighted(jump.date);
    setCenterNonce((n) => n + 1);
  }, [jump, now]);

  // Finger-tracking weekday swipe: the sheets follow the finger, with the
  // adjacent weekday's preview sliding in from off-screen. Native non-passive
  // listeners so iOS can't cancel the gesture mid-drag.
  const sheetsRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState<number | null>(null);
  // Vertical offset to align the preview's k=0 sheet with the main's k=0.
  const [previewTop, setPreviewTop] = useState(0);
  // Track which drag we've measured for, to avoid re-measuring mid-gesture.
  const measuredDragRef = useRef<number | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    claimed: boolean;
  } | null>(null);
  const animRef = useRef<number | null>(null);

  const SWIPE_THRESHOLD = 80;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const getViewportWidth = () => viewport.clientWidth;

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
        // Claim once the drag is clearly horizontal.
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

    const animateTo = (
      from: number,
      to: number,
      duration: number,
      onDone: () => void,
    ) => {
      const start = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        // Ease-out cubic.
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
    };

    const onTouchEnd = (e: TouchEvent) => {
      const s = dragState.current;
      dragState.current = null;
      if (!s || !s.claimed) {
        setDragX(null);
        return;
      }
      const dx = e.changedTouches[0].clientX - s.startX;
      const w = getViewportWidth();
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        const dir = dx < 0 ? 1 : -1;
        // Slide the preview fully into place (x=0 means dragX=-dir*w),
        // then commit the weekday without recentering.
        animateTo(dx, -dir * w, 180, () => {
          move(dir, false);
          setDragX(null);
        });
      } else {
        // Spring back.
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
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [move]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  const todayIso = toISODate(now);

  // Preview sheets for the adjacent weekday, shown off-screen during a swipe.
  // Full sheet content (entries, prompts, etc.) so the days visibly fall
  // into place under the finger. Data is pre-fetched via previewDates.
  const renderPreview = (targetWeekday: number, dir: 1 | -1) => {
    if (dragX == null) return null;
    const vw = viewportRef.current?.clientWidth ?? 0;
    if (vw === 0) return null;
    // Position: off-screen in the swipe direction, sliding in with the finger.
    // dir=1 (swipe left): preview comes from the right.
    // dir=-1 (swipe right): preview comes from the left.
    const x = dir === 1 ? vw + dragX : -vw + dragX;
    const targetAnchor = anchorFor(targetWeekday);
    return (
      <div
        {...stylex.props(styles.preview)}
        ref={previewRef}
        style={{ transform: `translateX(${x}px)`, top: previewTop }}
        aria-hidden="true"
      >
        <div {...stylex.props(styles.previewInner)}>
          {sheets.map(({ k }) => {
            const date = addDays(targetAnchor, k * 7);
            const iso = toISODate(date);
            const entry = entriesByDate[iso];
            const prompt = promptsByDate[iso];
            const dayReminders = remindersByDate[iso] ?? [];
            const decos = decosByDate[iso] ?? [];
            const label = relativeLabel(k);
            const hasAnno = prompt != null || dayReminders.length > 0;
            return (
              <Fragment key={iso}>
                {k > -past && <Divider />}
                <article
                  data-preview-iso={iso}
                  {...stylex.props(
                    styles.sheet,
                    k !== 0 && styles.sheetMuted,
                  )}
                >
                  <div {...stylex.props(styles.sheetHead)}>
                    <h2
                      {...stylex.props(styles.sheetDate)}
                      style={
                        k !== 0
                          ? { color: 'var(--color-text-secondary)' }
                          : undefined
                      }
                    >
                      {formatShort(date)}
                    </h2>
                    {iso === todayIso ? (
                      <span {...stylex.props(styles.todayPill)}>TODAY</span>
                    ) : (
                      label != null && (
                        <span {...stylex.props(styles.relLabel)}>{label}</span>
                      )
                    )}
                  </div>
                  {iso === todayIso && entry == null && (
                    <div {...stylex.props(styles.emptyState)}>
                      Nothing here yet.
                      <br />
                      Ask your agent to add an entry for today.
                    </div>
                  )}
                  {entry != null && <Markdown source={entry.body_text} />}
                  {hasAnno && (
                    <div {...stylex.props(styles.anno)}>
                      {prompt != null && (
                        <div {...stylex.props(styles.annoLine)}>
                          <span {...stylex.props(styles.annoLabel)}>
                            PROMPT ·
                          </span>
                          <span>{prompt.body}</span>
                        </div>
                      )}
                      {dayReminders.map((r) => (
                        <div key={r.id} {...stylex.props(styles.annoLine)}>
                          {r.importance === 'high' ? (
                            <span {...stylex.props(styles.annoDot)} />
                          ) : (
                            <span {...stylex.props(styles.annoLabel)}>
                              {r.urgency === 'high' ? 'IMPORTANT ·' : 'REMINDER ·'}
                            </span>
                          )}
                          <span>{r.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {decos.map((d) => {
                    const svg = sanitizeSvg(d.svg);
                    if (!svg) return null;
                    return (
                      <div
                        key={d.id}
                        {...stylex.props(styles.deco)}
                        dangerouslySetInnerHTML={{ __html: svg }}
                      />
                    );
                  })}
                </article>
              </Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  const dragDir = dragX != null ? (dragX < 0 ? 1 : -1) as 1 | -1 : null;

  // Measure vertical alignment once per drag gesture. The preview mirrors
  // the main's sheet structure, but content heights differ, so we align
  // the k=0 sheets by measuring their actual DOM positions.
  useLayoutEffect(() => {
    if (dragX == null || dragDir == null) {
      measuredDragRef.current = null;
      return;
    }
    // Only measure once per drag (dragX is a new value each move, but we
    // use a ref to track the gesture).
    if (measuredDragRef.current === dragX) return;
    // Mark as measured for this drag gesture (use the sign as the key,
    // since dragX changes continuously).
    const gestureKey = dragDir;
    if (measuredDragRef.current === gestureKey) return;
    measuredDragRef.current = gestureKey;

    const viewport = viewportRef.current;
    const previewEl = previewRef.current;
    if (!viewport || !previewEl) return;

    const targetWeekday = dragDir === 1 ? nextWeekday : prevWeekday;
    const targetAnchor = anchorFor(targetWeekday);
    const mainIso = toISODate(addDays(anchor, 0));
    const previewIso = toISODate(addDays(targetAnchor, 0));
    const mainEl = document.getElementById(`sheet-${mainIso}`);
    const previewK0 = previewEl.querySelector(
      `[data-preview-iso="${previewIso}"]`,
    );
    if (!mainEl || !previewK0) return;

    const vpRect = viewport.getBoundingClientRect();
    const mainRect = mainEl.getBoundingClientRect();
    const prevRect = (previewK0 as HTMLElement).getBoundingClientRect();
    const elRect = previewEl.getBoundingClientRect();
    const offset = mainRect.top - vpRect.top - (prevRect.top - elRect.top);
    setPreviewTop(offset);
  }, [dragX, dragDir, anchor, nextWeekday, prevWeekday]);

  // IntersectionObserver: track which sheets are near the viewport.
  // Only ~7 sheets stay "visible" in Activity; the rest are hidden
  // (state preserved) for performance.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setActiveSheets((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const iso = (entry.target as HTMLElement).dataset.sheetIso;
            if (!iso) continue;
            if (entry.isIntersecting) {
              next.add(iso);
            } else {
              // Keep a buffer: only remove if far from viewport
              // (IntersectionObserver with rootMargin handles this)
              next.delete(iso);
            }
          }
          return next;
        });
      },
      {
        root: viewport,
        // 200% vertical margin: preload ~3 sheets above/below
        rootMargin: '200% 0px 200% 0px',
        threshold: 0,
      },
    );

    observerRef.current = observer;

    // Observe all current sheets
    const sheets = viewport.querySelectorAll('[data-sheet-iso]');
    sheets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [sheets.length]); // Re-run when sheets change

  return (
    <div {...stylex.props(styles.swipeViewport)} ref={viewportRef}>
      {/* Off-screen previews, visible only during a swipe. */}
      {dragDir === 1 && renderPreview(nextWeekday, 1)}
      {dragDir === -1 && renderPreview(prevWeekday, -1)}

      <div
        {...stylex.props(styles.sheets)}
        ref={sheetsRef}
        style={
          dragX != null ? { transform: `translateX(${dragX}px)` } : undefined
        }
      >

        {fetchError && (
          <div {...stylex.props(styles.fetchError)}>
            <ErrorNote title="Couldn’t load entries." detail={fetchError} />
          </div>
        )}

        {sheets.map(({ k, date, iso }, i) => {
          const entry = entriesByDate[iso];
          const prompt = promptsByDate[iso];
          const dayReminders = remindersByDate[iso] ?? [];
          const decos = decosByDate[iso] ?? [];
          const label = relativeLabel(k);
          const hasAnno = prompt != null || dayReminders.length > 0;
          return (
            <Fragment key={iso}>
              {i > 0 && <Divider />}
              <article
              id={`sheet-${iso}`}
              data-sheet-iso={iso}
              {...stylex.props(
                styles.sheet,
                k !== 0 && styles.sheetMuted,
                highlighted === iso && styles.highlight,
              )}
            >
              <Activity mode={activeSheets.has(iso) ? 'visible' : 'hidden'}>
              <div {...stylex.props(styles.sheetHead)}>
                <h2
                  {...stylex.props(styles.sheetDate)}
                  style={
                    k !== 0
                      ? { color: 'var(--color-text-secondary)' }
                      : undefined
                  }
                >
                  {formatShort(date)}
                </h2>
                {iso === todayIso ? (
                  <span {...stylex.props(styles.todayPill)}>TODAY</span>
                ) : (
                  label != null && (
                    <span {...stylex.props(styles.relLabel)}>{label}</span>
                  )
                )}
              </div>
              {iso === todayIso && entry == null && (
                <div {...stylex.props(styles.emptyState)}>
                  Nothing here yet.
                  <br />
                  Ask your agent to add an entry for today.
                </div>
              )}
              {entry != null && <Markdown source={entry.body_text} />}
              {hasAnno && (
                <div {...stylex.props(styles.anno)}>
                  {prompt != null && (
                    <div {...stylex.props(styles.annoLine)}>
                      <span {...stylex.props(styles.annoLabel)}>
                        PROMPT ·
                      </span>
                      <span>{prompt.body}</span>
                    </div>
                  )}
                  {dayReminders.map((r) => (
                    <div key={r.id} {...stylex.props(styles.annoLine)}>
                      {r.importance === 'high' ? (
                        <span {...stylex.props(styles.annoDot)} />
                      ) : (
                        <span {...stylex.props(styles.annoLabel)}>
                          {r.urgency === 'high' ? 'IMPORTANT ·' : 'REMINDER ·'}
                        </span>
                      )}
                      <span>{r.title}</span>
                    </div>
                  ))}
                </div>
              )}
              {decos.map((d) => {
                const svg = sanitizeSvg(d.svg);
                if (!svg) return null;
                return (
                  <div
                    key={d.id}
                    {...stylex.props(styles.deco)}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                );
              })}
              </Activity>
            </article>
            </Fragment>
          );
        })}
      </div>
      <ReminderRadar
        reminders={allReminders}
        viewportRef={viewportRef}
        currentWeekday={weekday}
        anchorDate={anchor}
        onPlanetTap={(date) => {
          // TODO: scroll to the date's sheet
          console.log('Radar tap:', date);
        }}
      />
    </div>
  );
}

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
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import { Divider } from '@astryxdesign/core';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';
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

const INIT_PAST = 4;
const INIT_FUTURE = 2;
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
  sheets: {
    maxWidth: 680,
    margin: '0 auto',
    padding: '4px 0 72px',
    // Let horizontal swipes reach JS reliably: the browser only takes
    // vertical pans, so iOS can't hijack a diagonal swipe for scrolling
    // (which would cancel our touchend and "lose" the gesture).
    touchAction: 'pan-y',
  },
  sheet: {
    padding: '20px 20px 28px',
    color: 'var(--sl-ink)',
    // Each day holds its ground even when empty — the min-height is the
    // breathing room between date headings.
    minHeight: '20vh',
  },
  // Weeks other than this one recede: muted band, muted text.
  sheetMuted: {
    backgroundColor: 'var(--sl-paper-deep)',
    color: 'var(--sl-ink-soft)',
  },
  sheetHead: {
    display: 'flex',
    alignItems: 'baseline',
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

  // Entries, prompts, decorations for sheets we haven't fetched yet.
  // Sheets render from the calendar regardless — data fills in.
  useEffect(() => {
    let alive = true;
    const dates = sheets
      .map((s) => s.iso)
      .filter((d) => !fetchedDates.current.has(d));
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
  }, [cfg, tenantId, sheets]);

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
    (w: number) => {
      const a = addDays(startOfWeek(now, weekStart), weekOffset(w));
      setWeekday(w);
      setPast(INIT_PAST);
      setFuture(INIT_FUTURE);
      centerDate.current = toISODate(a);
      setCenterNonce((n) => n + 1);
    },
    [now, weekStart],
  );

  const move = useCallback(
    (delta: number) => {
      goWeekday(((weekday - 1 + delta + 7) % 7) + 1);
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

  // Horizontal swipe changes the weekday; vertical scroll is untouched.
  // Native non-passive listeners (see hook) so iOS can't cancel the gesture.
  const sheetsRef = useRef<HTMLDivElement>(null);
  useHorizontalSwipe(sheetsRef, (dir) => move(dir));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  const todayIso = toISODate(now);

  return (
    <div>
      <div
        {...stylex.props(styles.sheets)}
        ref={sheetsRef}
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
              {...stylex.props(
                styles.sheet,
                k !== 0 && styles.sheetMuted,
                highlighted === iso && styles.highlight,
              )}
            >
              <div {...stylex.props(styles.sheetHead)}>
                <h2 {...stylex.props(styles.sheetDate)}>{formatShort(date)}</h2>
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
                        AI PROMPT ·
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
}

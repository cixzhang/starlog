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
} from 'react';
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
import {
  WEEKDAY_NAMES,
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
  canvasHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '10px 16px',
    borderBottom: '1px solid var(--sl-line)',
  },
  pill: {
    appearance: 'none',
    background: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--sl-ink)',
    color: 'var(--sl-ink)',
    borderRadius: 999,
    padding: '7px 16px',
    fontFamily: 'var(--font-code)',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.08em',
    cursor: 'pointer',
  },
  spacer: {
    flex: 1,
  },
  toolBtn: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: 'var(--sl-ink)',
    width: 34,
    height: 34,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    borderRadius: 8,
  },
  arrow: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: 'var(--sl-ink-soft)',
    fontSize: 20,
    lineHeight: 1,
    padding: '8px 12px',
    borderRadius: 8,
    cursor: 'pointer',
  },
  sheets: {
    maxWidth: 680,
    margin: '0 auto',
    padding: '4px 20px 120px',
  },
  sheet: {
    padding: '26px 0 34px',
  },
  sheetDivided: {
    borderTop: '1px dashed var(--sl-line-strong)',
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
    fontSize: 28,
    fontWeight: 600,
    letterSpacing: '0.01em',
    color: 'var(--sl-ink)',
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

export default function Journal({
  cfg,
  tenantId,
  jump,
  onJumpConsumed,
  onOpenCalendar,
}: {
  cfg: SbConfig;
  tenantId: string;
  jump: { weekday: number; date: string } | null;
  onJumpConsumed: () => void;
  onOpenCalendar: () => void;
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
  const anchor = useMemo(
    () => addDays(startOfWeek(now), weekday - 1),
    [now, weekday],
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
      const a = addDays(startOfWeek(now), w - 1);
      setWeekday(w);
      setPast(INIT_PAST);
      setFuture(INIT_FUTURE);
      centerDate.current = toISODate(a);
      setCenterNonce((n) => n + 1);
    },
    [now],
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

  // Calendar jump: make sure the date is in the window, then center it.
  useEffect(() => {
    if (!jump) return;
    const a = addDays(startOfWeek(now), jump.weekday - 1);
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
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 60) move(dx < 0 ? 1 : -1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  const weekdayName = WEEKDAY_NAMES[weekday - 1].toUpperCase();
  const todayIso = toISODate(now);

  return (
    <div>
      <div {...stylex.props(styles.canvasHead)}>
        <button
          {...stylex.props(styles.arrow)}
          onClick={() => move(-1)}
          aria-label="Previous weekday"
        >
          ‹
        </button>
        <button
          {...stylex.props(styles.pill)}
          onClick={goToday}
          aria-label={`${WEEKDAY_NAMES[weekday - 1]} — back to today`}
          title="Back to today"
        >
          {weekdayName}
        </button>
        <button
          {...stylex.props(styles.arrow)}
          onClick={() => move(1)}
          aria-label="Next weekday"
        >
          ›
        </button>
        <div {...stylex.props(styles.spacer)} />
        <button
          {...stylex.props(styles.toolBtn)}
          onClick={onOpenCalendar}
          aria-label="Open calendar"
          title="Calendar"
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <rect x="2.5" y="4" width="15" height="13" rx="2.5" />
            <line x1="2.5" y1="8" x2="17.5" y2="8" />
            <line x1="6.5" y1="2" x2="6.5" y2="5.5" />
            <line x1="13.5" y1="2" x2="13.5" y2="5.5" />
          </svg>
        </button>
      </div>

      <div
        {...stylex.props(styles.sheets)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
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
            <article
              key={iso}
              id={`sheet-${iso}`}
              {...stylex.props(
                styles.sheet,
                i > 0 && styles.sheetDivided,
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
          );
        })}
      </div>
    </div>
  );
}

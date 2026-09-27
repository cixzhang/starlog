// Journal: one weekday at a time. Shows up to the 4 most recent
// same-weekday entries, vertically stacked, newest first, with dashed
// dividers and date headings between entries. Swipe (touch), arrow buttons,
// or keyboard arrows move between weekdays.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  fetchDecorations,
  fetchEntriesByWeekday,
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
  WEEKDAY_SHORT,
  addDays,
  formatLong,
  isoWeekday,
  parseISODate,
  toISODate,
} from '../lib/dates';
import { Markdown } from '../lib/markdown';
import { sanitizeSvg } from '../lib/svg';
import { EmptyNote, ErrorNote, Loading } from '../components/ui';
import Compass from '../components/compass';

const styles = stylex.create({
  strip: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '12px 16px',
    borderBottom: '1px solid var(--sl-line)',
    position: 'sticky',
    top: 0,
    backgroundColor: 'var(--sl-paper)',
    zIndex: 5,
  },
  arrow: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: 'var(--sl-ink-soft)',
    fontSize: 20,
    lineHeight: 1,
    padding: '8px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    ':hover': { backgroundColor: 'var(--sl-paper-deep)' },
  },
  days: {
    display: 'flex',
    flex: 1,
    justifyContent: 'space-between',
    gap: 2,
  },
  day: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    flex: 1,
    padding: '8px 0 6px',
    borderRadius: 10,
    cursor: 'pointer',
    color: 'var(--sl-ink-faint)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-body)',
    ':hover': { backgroundColor: 'var(--sl-paper-deep)' },
  },
  dayActive: {
    color: 'var(--sl-paper)',
    backgroundColor: 'var(--sl-ink)',
    ':hover': { backgroundColor: 'var(--sl-ink)' },
  },
  dayDot: {
    display: 'block',
    width: 4,
    height: 4,
    borderRadius: '50%',
    backgroundColor: 'var(--sl-gold)',
    margin: '4px auto 0',
  },
  entries: {
    maxWidth: 680,
    margin: '0 auto',
    padding: '8px 20px 80px',
  },
  entry: {
    padding: '28px 0 8px',
  },
  entryHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  entryDate: {
    fontFamily: 'var(--font-heading)',
    fontSize: 17,
    fontWeight: 600,
    color: 'var(--sl-ink)',
    margin: 0,
  },
  entryWeekday: {
    fontSize: 12.5,
    color: 'var(--sl-ink-faint)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  divider: {
    border: 'none',
    borderTop: '1px dashed var(--sl-line-strong)',
    margin: '20px 0 0',
  },
  deco: {
    // A date-owned SVG may visually overflow its section while staying
    // owned by that date.
    margin: '18px -8px 0',
    overflow: 'visible',
    opacity: 0.95,
  },
  anno: {
    marginTop: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
  },
  annoLine: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 9,
    margin: 0,
    fontSize: 13.5,
    lineHeight: 1.6,
  },
  annoDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: 'var(--sl-coral)',
    flexShrink: 0,
    alignSelf: 'center',
  },
  annoLabel: {
    fontFamily: 'var(--font-code)',
    fontSize: 11.5,
    letterSpacing: '0.09em',
    color: 'var(--sl-ink-faint)',
    whiteSpace: 'nowrap',
  },
  annoText: {
    color: 'var(--sl-ink-soft)',
  },
  highlight: {
    animationName: 'sl-flash',
    animationDuration: '2.4s',
    animationTimingFunction: 'ease-out',
  },
});

interface Props {
  cfg: SbConfig;
  tenantId: string;
  jump: { weekday: number; date: string } | null;
  onJumpConsumed: () => void;
}

export default function Journal({ cfg, tenantId, jump, onJumpConsumed }: Props) {
  const [weekday, setWeekday] = useState<number>(() => isoWeekday(new Date()));
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [decos, setDecos] = useState<Record<string, Decoration[]>>({});
  const [promptsByDate, setPromptsByDate] = useState<Record<string, Prompt>>({});
  const [remindersByDate, setRemindersByDate] = useState<
    Record<string, Reminder[]>
  >({});
  const [allReminders, setAllReminders] = useState<Reminder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);
  const now = useMemo(() => new Date(), []);

  const move = useCallback((delta: number) => {
    setWeekday((w) => ((w - 1 + delta + 7) % 7) + 1);
  }, []);

  // calendar jump: select the day's weekday, then highlight the date
  useEffect(() => {
    if (jump) setWeekday(jump.weekday);
  }, [jump]);

  useEffect(() => {
    let alive = true;
    setEntries(null);
    setError(null);
    (async () => {
      try {
        const es = await fetchEntriesByWeekday(cfg, tenantId, weekday, 4);
        if (!alive) return;
        setEntries(es);
        const dates = es.map((e) => e.entry_date);
        // Prompts and reminders live inline under their entry's date.
        // Reminders are also fetched a little into the future for the compass.
        const fromD = addDays(now, -40);
        fromD.setHours(0, 0, 0, 0);
        const toD = addDays(now, 14);
        toD.setHours(23, 59, 59, 999);
        const [ps, rs, ds] = await Promise.all([
          fetchPromptsByDates(cfg, tenantId, dates),
          fetchReminders(cfg, tenantId, fromD.toISOString(), toD.toISOString()),
          dates.length > 0 ? fetchDecorations(cfg, tenantId, dates) : [],
        ]);
        if (!alive) return;
        const pb: Record<string, Prompt> = {};
        for (const p of ps) pb[p.prompt_date] = p;
        setPromptsByDate(pb);
        const rb: Record<string, Reminder[]> = {};
        for (const r of rs) {
          const at = new Date(r.remind_at);
          const key = toISODate(
            new Date(at.getFullYear(), at.getMonth(), at.getDate()),
          );
          (rb[key] ??= []).push(r);
        }
        setRemindersByDate(rb);
        setAllReminders(rs);
        const byDate: Record<string, Decoration[]> = {};
        for (const d of ds) {
          if (!d.entry_date) continue;
          (byDate[d.entry_date] ??= []).push(d);
        }
        setDecos(byDate);
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : 'Couldn’t load entries.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [cfg, tenantId, weekday, now]);

  // keyboard: arrows move between weekdays
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  // jump-to-date highlight from the calendar
  useEffect(() => {
    if (jump?.date && entries) {
      const el = document.getElementById(`entry-${jump.date}`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        onJumpConsumed();
      }
    }
  }, [jump, entries, onJumpConsumed]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 60) move(dx < 0 ? 1 : -1);
  };

  return (
    <div>
      <div {...stylex.props(styles.strip)} role="tablist" aria-label="Weekday">
        <button
          {...stylex.props(styles.arrow)}
          onClick={() => move(-1)}
          aria-label="Previous weekday"
        >
          ‹
        </button>
        <div {...stylex.props(styles.days)}>
          {WEEKDAY_SHORT.map((name, i) => {
            const wd = i + 1;
            const active = wd === weekday;
            return (
              <button
                key={name}
                role="tab"
                aria-selected={active}
                {...stylex.props(styles.day, active && styles.dayActive)}
                onClick={() => setWeekday(wd)}
              >
                {name}
                {active && <span {...stylex.props(styles.dayDot)} />}
              </button>
            );
          })}
        </div>
        <button
          {...stylex.props(styles.arrow)}
          onClick={() => move(1)}
          aria-label="Next weekday"
        >
          ›
        </button>
      </div>

      <div
        {...stylex.props(styles.entries)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {error && <ErrorNote title="The journal didn’t load." detail={error} />}
        {!error && entries === null && <Loading />}
        {!error && allReminders !== null && allReminders.length > 0 && (
          <Compass reminders={allReminders} now={now} size={168} />
        )}
        {!error && entries !== null && entries.length === 0 && (
          <EmptyNote>
            Nothing written on {WEEKDAY_NAMES[weekday - 1].toLowerCase()}s yet.
            <br />
            The page is quiet — that’s fine.
          </EmptyNote>
        )}
        {!error &&
          entries !== null &&
          entries.map((e, i) => {
            const d = parseISODate(e.entry_date);
            const highlighted = jump?.date === e.entry_date;
            const prompt = promptsByDate[e.entry_date];
            const dayReminders = remindersByDate[e.entry_date] ?? [];
            return (
              <article
                key={e.id}
                id={`entry-${e.entry_date}`}
                {...stylex.props(styles.entry, highlighted && styles.highlight)}
              >
                <div {...stylex.props(styles.entryHead)}>
                  <h2 {...stylex.props(styles.entryDate)}>{formatLong(d)}</h2>
                  <span {...stylex.props(styles.entryWeekday)}>
                    {WEEKDAY_NAMES[isoWeekday(d) - 1]}
                  </span>
                </div>
                <Markdown source={e.body_text} />
                {(prompt || dayReminders.length > 0) && (
                  <div {...stylex.props(styles.anno)}>
                    {prompt && (
                      <p {...stylex.props(styles.annoLine)}>
                        <span {...stylex.props(styles.annoLabel)}>
                          AI PROMPT ·
                        </span>
                        <span {...stylex.props(styles.annoText)}>
                          {prompt.body}
                        </span>
                      </p>
                    )}
                    {dayReminders.map((r) => (
                      <p key={r.id} {...stylex.props(styles.annoLine)}>
                        {r.importance === 'high' && (
                          <span {...stylex.props(styles.annoDot)} />
                        )}
                        <span {...stylex.props(styles.annoLabel)}>
                          {r.importance === 'high' ? 'IMPORTANT ·' : 'REMINDER ·'}
                        </span>
                        <span {...stylex.props(styles.annoText)}>{r.title}</span>
                      </p>
                    ))}
                  </div>
                )}
                {(decos[e.entry_date] ?? []).map((dec) => {
                  const svg = sanitizeSvg(dec.svg);
                  if (!svg) return null;
                  return (
                    <div
                      key={dec.id}
                      {...stylex.props(styles.deco)}
                      // sanitized above: scripts, handlers, foreignObject out
                      dangerouslySetInnerHTML={{ __html: svg }}
                      role="img"
                      aria-label={`${dec.kind} for ${formatLong(d)}`}
                    />
                  );
                })}
                {i < entries.length - 1 && <hr {...stylex.props(styles.divider)} />}
              </article>
            );
          })}
      </div>
    </div>
  );
}

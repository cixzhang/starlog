// Starlog app shell: setup gate, tenant resolution, header, tab navigation.
// Read-only by design — the anon key this app holds has SELECT grants only.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  BookOpen,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Moon,
  Sun,
} from 'lucide-react';
import { Theme } from '@astryxdesign/core/theme';
import { starlogTheme } from './studio/starlog.js';
import {
  clearConfig,
  consumeLinkConfig,
  getTenantId,
  loadConfig,
  saveConfig,
  type SbConfig,
} from './lib/supabase';
import { isoWeekday, parseISODate, WEEKDAY_NAMES } from './lib/dates';
import { StarlogMark } from './components/mark';
import { ErrorNote, Loading } from './components/ui';
import Setup from './views/Setup';
import Journal, { type WeekdayControls } from './views/Journal';
import Calendar from './views/Calendar';

type Tab = 'journal' | 'calendar';

const MODE_KEY = 'starlog:mode';
type Mode = 'light' | 'dark';

const styles = stylex.create({
  root: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--sl-paper)',
    color: 'var(--sl-ink)',
  },
  header: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderBottom: '1px solid var(--sl-line)',
    position: 'sticky',
    top: 0,
    backgroundColor: 'var(--sl-paper)',
    zIndex: 10,
  },
  brandCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    justifySelf: 'start',
    minWidth: 0,
  },
  wordmark: {
    fontFamily: 'var(--font-heading)',
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '0.02em',
    margin: 0,
    whiteSpace: 'nowrap',
    '@media (max-width: 600px)': {
      display: 'none',
    },
  },
  weekdayCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    justifySelf: 'center',
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
    whiteSpace: 'nowrap',
  },
  arrow: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: 'var(--sl-ink-soft)',
    padding: '8px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    justifySelf: 'end',
  },
  iconBtn: {
    appearance: 'none',
    border: '1px solid var(--sl-line)',
    background: 'transparent',
    color: 'var(--sl-ink-soft)',
    width: 34,
    height: 34,
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: 15,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ':hover': { borderColor: 'var(--sl-gold)' },
  },
  menuWrap: {
    position: 'relative',
  },
  menuPanel: {
    position: 'absolute',
    right: 0,
    top: 'calc(100% + 8px)',
    minWidth: 210,
    backgroundColor: 'var(--sl-paper)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--sl-line)',
    borderRadius: 12,
    boxShadow: '0 8px 24px #17231f24',
    padding: 6,
    zIndex: 30,
  },
  menuItem: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    width: '100%',
    textAlign: 'left',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--sl-ink-soft)',
    padding: '10px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    ':hover': { backgroundColor: 'var(--sl-paper-deep)' },
  },
  menuItemDanger: {
    color: 'var(--sl-coral-deep)',
  },
  main: {
    flex: 1,
    minHeight: 0,
  },
});

function initialMode(): Mode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export default function App() {
  // First launch: a saved config wins; otherwise a ?supabase_url=&anon_key=
  // setup link configures the app in one tap (and is stripped from the URL).
  const [initial] = useState(() => {
    const link = consumeLinkConfig();
    const saved = loadConfig();
    if (saved) return { cfg: saved as SbConfig | null, linkUrl: '' };
    if (link.url && link.anonKey) {
      const full: SbConfig = { url: link.url, anonKey: link.anonKey };
      saveConfig(full);
      return { cfg: full as SbConfig | null, linkUrl: '' };
    }
    return { cfg: null as SbConfig | null, linkUrl: link.url };
  });
  const [cfg, setCfg] = useState<SbConfig | null>(initial.cfg);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('journal');
  const [mode, setMode] = useState<Mode>(initialMode);
  const [jump, setJump] = useState<{ weekday: number; date: string } | null>(
    null,
  );
  // Weekday navigation lives in the top bar; Journal hands its controls up.
  const [weekdayCtl, setWeekdayCtl] = useState<WeekdayControls | null>(null);
  const handleControls = useCallback((ctl: WeekdayControls | null) => {
    setWeekdayCtl(ctl);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* private mode */
    }
  }, [mode]);

  useEffect(() => {
    if (!cfg) {
      setTenantId(null);
      return;
    }
    let alive = true;
    setTenantError(null);
    (async () => {
      try {
        const id = await getTenantId(cfg);
        if (alive) setTenantId(id);
      } catch (e) {
        if (alive)
          setTenantError(
            e instanceof Error ? e.message : 'Couldn’t reach the journal.',
          );
      }
    })();
    return () => {
      alive = false;
    };
  }, [cfg]);

  const disconnect = useCallback(() => {
    clearConfig();
    setCfg(null);
    setTenantId(null);
    setTab('journal');
  }, []);

  // Destructive actions live behind the ⋯ menu so they can't be hit by
  // accident. Disconnect is two-tap: arm, then confirm.
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => {
      setMenuOpen(false);
      setConfirmingDisconnect(false);
    };
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const pickDay = useCallback((isoDate: string) => {
    const d = parseISODate(isoDate);
    setJump({ weekday: isoWeekday(d), date: isoDate });
    setTab('journal');
  }, []);

  return (
    <Theme theme={starlogTheme} mode={mode}>
      <div {...stylex.props(styles.root)}>
        {!cfg && <Setup onDone={setCfg} initialUrl={initial.linkUrl} />}
        {cfg && (
          <>
            <header id="sl-app-header" {...stylex.props(styles.header)}>
              <div {...stylex.props(styles.brandCell)}>
                <StarlogMark size={30} />
                <h1 {...stylex.props(styles.wordmark)}>Starlog</h1>
              </div>
              <div {...stylex.props(styles.weekdayCell)}>
                {tab === 'journal' && weekdayCtl && (
                  <>
                    <button
                      {...stylex.props(styles.arrow)}
                      onClick={() => weekdayCtl.move(-1)}
                      aria-label="Previous weekday"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      {...stylex.props(styles.pill)}
                      onClick={weekdayCtl.goToday}
                      aria-label={`${WEEKDAY_NAMES[weekdayCtl.weekday - 1]} — back to today`}
                      title="Back to today"
                    >
                      {WEEKDAY_NAMES[weekdayCtl.weekday - 1].toUpperCase()}
                    </button>
                    <button
                      {...stylex.props(styles.arrow)}
                      onClick={() => weekdayCtl.move(1)}
                      aria-label="Next weekday"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </>
                )}
              </div>
              <div {...stylex.props(styles.rightCell)}>
                <button
                  {...stylex.props(styles.iconBtn)}
                  onClick={() =>
                    setTab((t) => (t === 'journal' ? 'calendar' : 'journal'))
                  }
                  aria-label={
                    tab === 'journal' ? 'Open calendar' : 'Back to journal'
                  }
                  title={tab === 'journal' ? 'Calendar' : 'Journal'}
                >
                  {tab === 'journal' ? (
                    <CalendarIcon size={19} />
                  ) : (
                    <BookOpen size={19} />
                  )}
                </button>
                <button
                  {...stylex.props(styles.iconBtn)}
                  onClick={() =>
                    setMode((m) => (m === 'light' ? 'dark' : 'light'))
                  }
                  aria-label={
                    mode === 'light' ? 'Switch to night' : 'Switch to day'
                  }
                  title={mode === 'light' ? 'Night' : 'Day'}
                >
                  {mode === 'light' ? <Moon size={19} /> : <Sun size={19} />}
                </button>
              <div {...stylex.props(styles.menuWrap)} ref={menuRef}>
                <button
                  {...stylex.props(styles.iconBtn)}
                  onClick={() => {
                    setMenuOpen((o) => !o);
                    setConfirmingDisconnect(false);
                  }}
                  aria-label="Menu"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  title="Menu"
                >
                  <Ellipsis size={19} />
                </button>
                {menuOpen && (
                  <div {...stylex.props(styles.menuPanel)} role="menu">
                    <button
                      {...stylex.props(
                        styles.menuItem,
                        confirmingDisconnect && styles.menuItemDanger,
                      )}
                      role="menuitem"
                      onClick={() => {
                        if (confirmingDisconnect) {
                          setMenuOpen(false);
                          setConfirmingDisconnect(false);
                          disconnect();
                        } else {
                          setConfirmingDisconnect(true);
                        }
                      }}
                    >
                      {confirmingDisconnect
                        ? 'Tap again to disconnect'
                        : 'Disconnect project…'}
                    </button>
                  </div>
                )}
              </div>
            </div>
            </header>

            <main {...stylex.props(styles.main)}>
              {tenantError && (
                <ErrorNote
                  title="Couldn’t reach your journal."
                  detail={tenantError}
                />
              )}
              {!tenantError && !tenantId && <Loading />}
              {!tenantError && tenantId && tab === 'journal' && (
                <Journal
                  cfg={cfg}
                  tenantId={tenantId}
                  jump={jump}
                  onJumpConsumed={() => setJump(null)}
                  onControls={handleControls}
                />
              )}
              {!tenantError && tenantId && tab === 'calendar' && (
                <Calendar cfg={cfg} tenantId={tenantId} onPickDay={pickDay} />
              )}
            </main>
          </>
        )}
      </div>
    </Theme>
  );
}

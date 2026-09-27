// Starlog app shell: setup gate, tenant resolution, header, tab navigation.
// Read-only by design — the anon key this app holds has SELECT grants only.

import { useCallback, useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
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
import { isoWeekday, parseISODate } from './lib/dates';
import { StarlogMark } from './components/mark';
import { ErrorNote, Loading } from './components/ui';
import Setup from './views/Setup';
import Journal from './views/Journal';
import Prompts from './views/Prompts';
import Reminders from './views/Reminders';
import Calendar from './views/Calendar';

type Tab = 'journal' | 'prompts' | 'reminders' | 'calendar';

const TABS: { id: Tab; label: string }[] = [
  { id: 'journal', label: 'Journal' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'calendar', label: 'Calendar' },
];

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
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    borderBottom: '1px solid var(--sl-line)',
    position: 'sticky',
    top: 0,
    backgroundColor: 'var(--sl-paper)',
    zIndex: 10,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginRight: 'auto',
  },
  wordmark: {
    fontFamily: 'var(--font-heading)',
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '0.02em',
    margin: 0,
  },
  desktopNav: {
    display: 'none',
    '@media (min-width: 761px)': {
      display: 'flex',
      gap: 2,
    },
  },
  tab: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    fontFamily: 'var(--font-body)',
    fontSize: 14.5,
    fontWeight: 600,
    color: 'var(--sl-ink-faint)',
    padding: '8px 14px',
    borderRadius: 999,
    cursor: 'pointer',
    ':hover': { color: 'var(--sl-ink)' },
  },
  tabActive: {
    color: 'var(--sl-ink)',
    backgroundColor: 'var(--sl-paper-deep)',
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
  main: {
    flex: 1,
    minHeight: 0,
  },
  mobileNav: {
    display: 'flex',
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'var(--sl-paper)',
    borderTop: '1px solid var(--sl-line)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    '@media (min-width: 761px)': {
      display: 'none',
    },
  },
  mobileTab: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    flex: 1,
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.03em',
    color: 'var(--sl-ink-faint)',
    padding: '12px 0 10px',
    cursor: 'pointer',
  },
  mobileTabActive: {
    color: 'var(--sl-ink)',
  },
  mobileDot: {
    display: 'block',
    width: 4,
    height: 4,
    borderRadius: '50%',
    backgroundColor: 'var(--sl-gold)',
    margin: '5px auto 0',
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
  const [jump, setJump] = useState<{ weekday: number; date: string } | null>(null);

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
            e instanceof Error ? e.message : 'Couldn\u2019t reach the journal.',
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
            <header {...stylex.props(styles.header)}>
              <div {...stylex.props(styles.brand)}>
                <StarlogMark size={30} />
                <h1 {...stylex.props(styles.wordmark)}>Starlog</h1>
              </div>
              <nav
                {...stylex.props(styles.desktopNav)}
                aria-label="Sections"
              >
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    {...stylex.props(
                      styles.tab,
                      tab === t.id && styles.tabActive,
                    )}
                    onClick={() => setTab(t.id)}
                    aria-current={tab === t.id ? 'page' : undefined}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
              <button
                {...stylex.props(styles.iconBtn)}
                onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
                aria-label={
                  mode === 'light' ? 'Switch to night' : 'Switch to day'
                }
                title={mode === 'light' ? 'Night' : 'Day'}
              >
                {mode === 'light' ? '☾' : '☀'}
              </button>
              <button
                {...stylex.props(styles.iconBtn)}
                onClick={disconnect}
                aria-label="Disconnect Supabase project"
                title="Disconnect"
              >
                ⎋
              </button>
            </header>

            <main {...stylex.props(styles.main)}>
              {tenantError && (
                <ErrorNote
                  title="Couldn\u2019t reach your journal."
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
                />
              )}
              {!tenantError && tenantId && tab === 'prompts' && (
                <Prompts cfg={cfg} tenantId={tenantId} />
              )}
              {!tenantError && tenantId && tab === 'reminders' && (
                <Reminders cfg={cfg} tenantId={tenantId} />
              )}
              {!tenantError && tenantId && tab === 'calendar' && (
                <Calendar cfg={cfg} tenantId={tenantId} onPickDay={pickDay} />
              )}
            </main>

            <nav {...stylex.props(styles.mobileNav)} aria-label="Sections">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  {...stylex.props(
                    styles.mobileTab,
                    tab === t.id && styles.mobileTabActive,
                  )}
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? 'page' : undefined}
                >
                  {t.label}
                  {tab === t.id && <span {...stylex.props(styles.mobileDot)} />}
                </button>
              ))}
            </nav>
          </>
        )}
      </div>
    </Theme>
  );
}

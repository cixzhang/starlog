// Starlog app shell: setup gate, tenant resolution, header, tab navigation.
// Read-only by design — the anon key this app holds has SELECT grants only.

import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Token } from '@astryxdesign/core/Token';
// Code-split: Calendar and Settings load on demand, not in the initial bundle.
const Calendar = lazy(() => import('./views/Calendar'));
const SettingsPanel = lazy(() => import('./components/SettingsPanel'));
import {
  BookOpen,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
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
import { getWeekStart, setWeekStart, type WeekStart } from './lib/settings';
import { useCustomTheme } from './lib/customTheme';
import { StarlogMark } from './components/mark';
import { ErrorNote, Loading } from './components/ui';
import Setup from './views/Setup';
import InstallApp, { isStandalone } from './views/InstallApp';
import Journal, { type WeekdayControls } from './views/Journal';

type Tab = 'journal' | 'calendar';

const MODE_KEY = 'starlog:mode';
type Mode = 'light' | 'dark' | 'auto' | 'custom';

const styles = stylex.create({
  root: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--color-background-body)',
    color: 'var(--color-text-primary)',
  },
  // Weekday token: Manrope semibold, neutral gray
  weekdayToken: {
    fontFamily: 'Manrope, sans-serif',
    fontWeight: 600,
  },
  header: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderBottom: '1px solid var(--color-border)',
    position: 'sticky',
    top: 0,
    backgroundColor: 'var(--color-background-body)',
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
  arrow: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
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
  main: {
    flex: 1,
    minHeight: 0,
  },
});

function initialMode(): Mode {
  try {
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto' || saved === 'custom') return saved;
  } catch {
    /* ignore */
  }
  return 'auto';
}

function systemMode(): 'light' | 'dark' {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

export default function App() {
  // First launch: a saved config wins; otherwise a ?supabase_url=&anon_key=
  // setup link configures the app in one tap (and is stripped from the URL).
  // If the link lands in the browser (not the installed PWA), we show an
  // install guide instead — the PWA keeps separate storage, so configuring
  // the browser wouldn't carry over.
  const [initial] = useState(() => {
    const link = consumeLinkConfig();
    const saved = loadConfig();
    if (saved) return { cfg: saved as SbConfig | null, linkUrl: '', needsInstall: false };
    const hasLink = !!(link.url && link.anonKey);
    if (hasLink && isStandalone()) {
      const full: SbConfig = { url: link.url, anonKey: link.anonKey };
      saveConfig(full);
      return { cfg: full as SbConfig | null, linkUrl: '', needsInstall: false };
    }
    if (hasLink) {
      // Rebuild the setup link for the copy button (params were stripped).
      const params = new URLSearchParams({
        supabase_url: link.url,
        anon_key: link.anonKey,
      });
      const setupLink = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
      return {
        cfg: null as SbConfig | null,
        linkUrl: link.url,
        needsInstall: true,
        setupLink,
        pendingCfg: { url: link.url, anonKey: link.anonKey } as SbConfig,
      };
    }
    return { cfg: null as SbConfig | null, linkUrl: link.url, needsInstall: false };
  });
  const [cfg, setCfg] = useState<SbConfig | null>(initial.cfg);
  const [showInstall, setShowInstall] = useState(initial.needsInstall);
  // ... (rest unchanged)
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('journal');
  const [mode, setMode] = useState<Mode>(initialMode);
  const { customTheme, builtTheme, removeCustomTheme, installCustomTheme } = useCustomTheme();
  // In custom mode with a theme installed, use the progressively-extended theme.
  const appliedTheme = mode === 'custom' && builtTheme ? builtTheme : starlogTheme;
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

  // Resolved mode: 'auto' follows the OS. Re-resolves when the OS flips.
  const [osDark, setOsDark] = useState(() => systemMode() === 'dark');
  useEffect(() => {
    if (mode !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setOsDark(e.matches);
    setOsDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);
  const resolvedMode: 'light' | 'dark' =
    mode === 'light' ? 'light'
    : mode === 'dark' ? 'dark'
    : osDark ? 'dark' : 'light';

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

  // Settings lives behind the ⋯ trigger as a custom bottom-sheet panel.
  // (Astryx DropdownMenu section headings are misaligned; see filed issue.)
  // Disconnect is destructive and two-tap: arm, then confirm.
  const [menuOpen, setMenuOpen] = useState(false);
  const [weekStart, setWeekStartState] = useState<WeekStart>(() => getWeekStart());
  const chooseWeekStart = (w: WeekStart) => {
    setWeekStart(w);
    setWeekStartState(w);
  };

  const pickDay = useCallback((isoDate: string) => {
    const d = parseISODate(isoDate);
    setJump({ weekday: isoWeekday(d), date: isoDate });
    setTab('journal');
  }, []);

  function continueInBrowser() {
    if (initial.pendingCfg) {
      saveConfig(initial.pendingCfg);
      setCfg(initial.pendingCfg);
    }
    setShowInstall(false);
  }

  return (
    <Theme theme={appliedTheme} mode={resolvedMode}>
      <div {...stylex.props(styles.root)}>
        {showInstall ? (
          <InstallApp
            setupLink={initial.setupLink ?? ''}
            onContinueInBrowser={continueInBrowser}
          />
        ) : (
          !cfg && <Setup onDone={setCfg} initialUrl={initial.linkUrl} />
        )}
        {cfg && (
          <>
            <header id="sl-app-header" {...stylex.props(styles.header)}>
              <div {...stylex.props(styles.brandCell)}>
                <StarlogMark size={32} />
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
                    <Token
                      label={WEEKDAY_NAMES[weekdayCtl.weekday - 1].toUpperCase()}
                      onClick={weekdayCtl.goToday}
                      description={`${WEEKDAY_NAMES[weekdayCtl.weekday - 1]} — back to today`}
                      size="sm"
                      color="gray"
                      xstyle={styles.weekdayToken}
                    />
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
                <IconButton
                  icon={
                    tab === 'journal' ? (
                      <CalendarIcon size={19} />
                    ) : (
                      <BookOpen size={19} />
                    )
                  }
                  label={tab === 'journal' ? 'Open calendar' : 'Back to journal'}
                  variant="ghost"
                  onClick={() =>
                    setTab((t) => (t === 'journal' ? 'calendar' : 'journal'))
                  }
                />
              <IconButton
                icon={<Ellipsis size={19} />}
                label="Settings"
                variant="ghost"
                onClick={() => setMenuOpen(true)}
              />
              <Suspense fallback={null}>
                <SettingsPanel
                  open={menuOpen}
                  onClose={() => {
                    setMenuOpen(false);
                  }}
                weekStart={weekStart}
                onWeekStart={chooseWeekStart}
                mode={mode}
                onMode={setMode}
                onDisconnect={() => {
                  setMenuOpen(false);
                  disconnect();
                }}
                buildHash={__COMMIT_HASH__}
                onCopyHash={() => {
                  try {
                    navigator.clipboard.writeText(__COMMIT_HASH__);
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
                customTheme={customTheme}
                onRemoveCustomTheme={removeCustomTheme}
                onInstallCustomTheme={installCustomTheme}
              />
              </Suspense>
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
                  weekStart={weekStart}
                />
              )}
              {!tenantError && tenantId && tab === 'calendar' && (
                <Suspense fallback={<Loading />}>
                  <Calendar
                    cfg={cfg}
                    tenantId={tenantId}
                    onPickDay={pickDay}
                    weekStart={weekStart}
                  />
                </Suspense>
              )}
            </main>
          </>
        )}
      </div>
    </Theme>
  );
}

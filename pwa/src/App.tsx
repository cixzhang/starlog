// Starlog app shell: setup gate, tenant resolution, header, tab navigation.
// Read-only by design — the anon key this app holds has SELECT grants only.

/** Database spec this build expects. Bump when a migration adds
 *  columns/tables the PWA reads. */
const REQUIRED_SPEC_VERSION = '0.7.0';

/** True if backend spec `have` is older than `need` (semver-ish). */
function specIsBehind(have: string, need: string): boolean {
  const h = have.split('.').map(Number);
  const n = need.split('.').map(Number);
  for (let i = 0; i < Math.max(h.length, n.length); i++) {
    const hd = h[i] ?? 0;
    const nd = n[i] ?? 0;
    if (hd < nd) return true;
    if (hd > nd) return false;
  }
  return false;
}

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
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
  getCapabilities,
  getTenantId,
  loadConfig,
  saveConfig,
  type SbConfig,
} from './lib/supabase';
import { isoWeekday, parseISODate, weekdayNames } from './lib/dates';
import { getWeekStart, setWeekStart, type WeekStart } from './lib/settings';
import {
  fmt,
  getLangPref,
  getStrings,
  setLangPref,
  useStrings,
  type LangPref,
} from './lib/i18n';
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
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: '0.08em',
    borderRadius: 999,
    padding: '3px 10px',
  },
  weekdayTokenToday: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
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
    padding: '6px 8px',
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
  updateBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 16px',
    backgroundColor: 'var(--color-background-surface)',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    fontSize: 13,
  },
  updateBannerText: {
    flex: 1,
    minWidth: 0,
  },
  updateBannerTitle: {
    fontWeight: 600,
  },
  updateBannerButton: {
    flexShrink: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-accent)',
    color: 'var(--color-accent)',
    backgroundColor: 'transparent',
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
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
  /** {have, need} when the backend spec is older than this build expects. */
  const [specBehind, setSpecBehind] = useState<{
    have: string;
    need: string;
  } | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  /** True when /version.json reports a newer deploy than this build. */
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const checkAppVersion = useCallback(async (): Promise<boolean> => {
    try {
      // Query-busted: the service worker cache-firsts same-origin assets.
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return false;
      const { commit } = (await res.json()) as { commit?: string };
      const behind = !!commit && commit !== __COMMIT_HASH__;
      if (behind) setAppUpdateAvailable(true);
      return behind;
    } catch {
      // Offline or pre-version.json deploy: stay quiet.
      return false;
    }
  }, []);
  useEffect(() => {
    checkAppVersion();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkAppVersion();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [checkAppVersion]);
  const [tab, setTab] = useState<Tab>('journal');
  const [mode, setMode] = useState<Mode>(initialMode);
  const { customTheme, builtTheme, removeCustomTheme, installCustomTheme } = useCustomTheme();
  // In custom mode with a theme installed, use the progressively-extended theme.
  const appliedTheme = mode === 'custom' && builtTheme ? builtTheme : starlogTheme;
  const [jump, setJump] = useState<{ weekday: number; date: string } | null>(
    null,
  );
  // Jump-target flash, applied synchronously in the tap callback (not in an
  // effect) so the highlight is always tied to the user's action.
  // Calendar jumps highlight the date; radar jumps highlight only the
  // specific reminder row.
  const [highlight, setHighlight] = useState<{
    date: string | null;
    reminderId: string | null;
  } | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const flashHighlight = useCallback(
    (opts: { date?: string; reminderId?: string }) => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
      setHighlight({
        date: opts.date ?? null,
        reminderId: opts.reminderId ?? null,
      });
      highlightTimer.current = window.setTimeout(() => setHighlight(null), 1700);
    },
    [],
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
    setSpecBehind(null);
    (async () => {
      try {
        const id = await getTenantId(cfg);
        if (alive) setTenantId(id);
        try {
          const caps = await getCapabilities(cfg);
          if (alive && specIsBehind(caps.spec_version, REQUIRED_SPEC_VERSION)) {
            setSpecBehind({ have: caps.spec_version, need: REQUIRED_SPEC_VERSION });
          }
        } catch {
          // Capabilities unreadable (very old backend): don't block the app.
        }
      } catch (e) {
        if (alive)
          setTenantError(
            e instanceof Error ? e.message : getStrings().app.unreachable,
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

  const copyUpdatePrompt = useCallback(async () => {
    if (!specBehind) return;
    const prompt =
      `My Starlog database is at spec ${specBehind.have} but the app needs ${specBehind.need}. ` +
      `Using the starlog skill, apply the pending migrations in order and confirm the new spec version.`;
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2500);
    } catch {
      // Clipboard unavailable; the banner text still explains the fix.
    }
  }, [specBehind]);

  // Settings lives behind the ⋯ trigger as a custom bottom-sheet panel.
  // (Astryx DropdownMenu section headings are misaligned; see filed issue.)
  // Disconnect is destructive and two-tap: arm, then confirm.
  const [menuOpen, setMenuOpen] = useState(false);
  const [weekStart, setWeekStartState] = useState<WeekStart>(() => getWeekStart());
  const chooseWeekStart = (w: WeekStart) => {
    setWeekStart(w);
    setWeekStartState(w);
  };
  const [lang, setLang] = useState<LangPref>(() => getLangPref());
  const chooseLang = (l: LangPref) => {
    setLangPref(l);
    setLang(l);
  };
  const s = useStrings();

  const pickDay = useCallback((isoDate: string) => {
    const d = parseISODate(isoDate);
    setJump({ weekday: isoWeekday(d), date: isoDate });
    flashHighlight({ date: isoDate });
    setTab('journal');
  }, [flashHighlight]);

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
                      aria-label={s.app.prevWeekday}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <Token
                      label={weekdayNames()[weekdayCtl.weekday - 1].toUpperCase()}
                      onClick={weekdayCtl.goToday}
                      description={fmt(s.app.weekdayBack, {
                        day: weekdayNames()[weekdayCtl.weekday - 1],
                      })}
                      size="sm"
                      color="gray"
                      xstyle={[
                        styles.weekdayToken,
                        weekdayCtl.weekday === isoWeekday(new Date()) &&
                          styles.weekdayTokenToday,
                      ]}
                    />
                    <button
                      {...stylex.props(styles.arrow)}
                      onClick={() => weekdayCtl.move(1)}
                      aria-label={s.app.nextWeekday}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}
              </div>
              <div {...stylex.props(styles.rightCell)}>
                <IconButton
                  icon={
                    tab === 'journal' ? (
                      <CalendarIcon size={16} />
                    ) : (
                      <BookOpen size={16} />
                    )
                  }
                  label={tab === 'journal' ? s.app.openCalendar : s.app.backToJournal}
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setTab((t) => (t === 'journal' ? 'calendar' : 'journal'))
                  }
                />
              <IconButton
                icon={<Ellipsis size={16} />}
                label={s.app.settings}
                variant="ghost"
                size="sm"
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
                lang={lang}
                onLang={chooseLang}
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
                onCheckUpdates={checkAppVersion}
                customTheme={customTheme}
                onRemoveCustomTheme={removeCustomTheme}
                onInstallCustomTheme={installCustomTheme}
              />
              </Suspense>
            </div>
            </header>

            {appUpdateAvailable && (
              <div {...stylex.props(styles.updateBanner)}>
                <div {...stylex.props(styles.updateBannerText)}>
                  <div {...stylex.props(styles.updateBannerTitle)}>
                    {s.app.newVersion}
                  </div>
                  <div>{s.app.newVersionDetail}</div>
                </div>
                <button
                  {...stylex.props(styles.updateBannerButton)}
                  onClick={() => window.location.reload()}
                >
                  {s.app.refresh}
                </button>
              </div>
            )}

            {specBehind && (
              <div {...stylex.props(styles.updateBanner)}>
                <div {...stylex.props(styles.updateBannerText)}>
                  <div {...stylex.props(styles.updateBannerTitle)}>
                    {s.app.updateAvailable}
                  </div>
                  <div>
                    {fmt(s.app.updateDetail, {
                      have: specBehind.have,
                      need: specBehind.need,
                    })}
                  </div>
                </div>
                <button
                  {...stylex.props(styles.updateBannerButton)}
                  onClick={copyUpdatePrompt}
                >
                  {promptCopied ? s.app.promptCopied : s.app.copyPrompt}
                </button>
              </div>
            )}

            <main {...stylex.props(styles.main)}>
              {tenantError && (
                <ErrorNote
                  title={s.app.unreachable}
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
                  highlight={highlight}
                  flashHighlight={flashHighlight}
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

import * as stylex from '@stylexjs/stylex';
import { Check, Sun, Moon, MonitorSmartphone, Palette, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export type WeekStart = 1 | 7;
export type ThemeMode = 'light' | 'dark' | 'auto' | 'custom';

import type { CustomTheme } from '../lib/customTheme';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  weekStart: WeekStart;
  onWeekStart: (w: WeekStart) => void;
  mode: ThemeMode;
  onMode: (m: ThemeMode) => void;
  confirmingDisconnect: boolean;
  onDisconnect: () => void;
  buildHash: string;
  onCopyHash: () => void;
  customTheme: CustomTheme | null;
  onRemoveCustomTheme: () => void;
  onInstallCustomTheme: (input: string) => string | null;
}

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 10,
    backgroundColor: 'var(--sl-paper-deep)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 16,
    paddingTop: 'max(16px, env(safe-area-inset-top))',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--sl-line)',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--color-text)',
    margin: 0,
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--color-text)',
    cursor: 'pointer',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--sl-ink-soft)',
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 20,
    paddingBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    color: 'var(--color-text)',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  tiles: {
    display: 'flex',
    gap: 10,
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 4,
    paddingBottom: 4,
  },
  tile: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 14,
    paddingBottom: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: 'var(--sl-line)',
    backgroundColor: 'transparent',
    color: 'var(--color-text)',
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
  },
  tileSelected: {
    borderColor: 'var(--sl-coral)',
    backgroundColor: 'color-mix(in srgb, var(--sl-coral) 10%, transparent)',
  },
  itemDestructive: {
    color: 'var(--color-text-red)',
  },
  check: {
    color: 'var(--sl-ink-soft)',
    flexShrink: 0,
  },
  divider: {
    height: 1,
    backgroundColor: 'var(--sl-line)',
    marginLeft: 20,
    marginRight: 20,
    marginTop: 12,
    marginBottom: 12,
  },
});

function Item({
  label,
  icon,
  selected,
  onClick,
  destructive,
}: {
  label: string;
  icon?: import('react').ReactNode;
  selected?: boolean;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      {...stylex.props(styles.item, destructive && styles.itemDestructive)}
      onClick={onClick}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon}
        {label}
      </span>
      {selected && <Check size={18} {...stylex.props(styles.check)} />}
    </button>
  );
}

function Tile({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string;
  icon?: import('react').ReactNode;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      {...stylex.props(styles.tile, selected && styles.tileSelected)}
      onClick={onClick}
      aria-pressed={selected}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default function SettingsPanel({
  open,
  onClose,
  weekStart,
  onWeekStart,
  mode,
  onMode,
  confirmingDisconnect,
  onDisconnect,
  buildHash,
  onCopyHash,
  customTheme,
  onRemoveCustomTheme,
  onInstallCustomTheme,
}: SettingsPanelProps) {
  const [themeError, setThemeError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div {...stylex.props(styles.overlay)} role="dialog" aria-label="Settings" aria-modal="true">
      <div {...stylex.props(styles.header)}>
        <h2 {...stylex.props(styles.title)}>Settings</h2>
        <button
          {...stylex.props(styles.closeButton)}
          onClick={onClose}
          aria-label="Close settings"
        >
          <X size={22} />
        </button>
      </div>

      <div {...stylex.props(styles.content)}>
        <div {...stylex.props(styles.sectionTitle)}>Week starts on</div>
        <div {...stylex.props(styles.tiles)}>
          <Tile
            label="Monday"
            selected={weekStart === 1}
            onClick={() => onWeekStart(1)}
          />
          <Tile
            label="Sunday"
            selected={weekStart === 7}
            onClick={() => onWeekStart(7)}
          />
        </div>

        <div {...stylex.props(styles.sectionTitle)}>Theme</div>
        <div {...stylex.props(styles.tiles)}>
          <Tile
            label="Light"
            icon={<Sun size={20} />}
            selected={mode === 'light'}
            onClick={() => onMode('light')}
          />
          <Tile
            label="Dark"
            icon={<Moon size={20} />}
            selected={mode === 'dark'}
            onClick={() => onMode('dark')}
          />
          <Tile
            label="Auto"
            icon={<MonitorSmartphone size={20} />}
            selected={mode === 'auto'}
            onClick={() => onMode('auto')}
          />
          <Tile
            label="Custom"
            icon={<Palette size={20} />}
            selected={mode === 'custom'}
            onClick={() => onMode('custom')}
          />
        </div>

        {mode === 'custom' && (
          <div style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 8 }}>
            {customTheme && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: 8,
                }}
              >
                <span style={{ fontSize: 14, color: 'var(--sl-ink-soft)' }}>
                  Custom: {customTheme.name}
                </span>
                <button
                  onClick={onRemoveCustomTheme}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: 'var(--color-text-red)',
                    fontSize: 14,
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  Clear
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/theme-agent-prompt.txt');
                    const prompt = await res.text();
                    await navigator.clipboard.writeText(prompt);
                    setThemeError(null);
                  } catch {
                    setThemeError('Could not copy the prompt.');
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid var(--sl-line)',
                  backgroundColor: 'var(--sl-paper)',
                  color: 'var(--sl-ink)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Copy agent prompt
              </button>
              <button
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    const err = onInstallCustomTheme(text);
                    setThemeError(err);
                  } catch {
                    setThemeError('Could not read the clipboard. Paste access was denied.');
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-on-accent)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Paste theme config
              </button>
            </div>
            {themeError && (
              <div style={{ color: 'var(--color-text-red)', fontSize: 13, paddingTop: 6 }}>
                {themeError}
              </div>
            )}
            <div style={{ fontSize: 13, color: 'var(--sl-ink-faint)', paddingTop: 8, lineHeight: 1.5 }}>
              Copy the prompt, ask your agent to make a theme, then paste the JSON back here.
            </div>
          </div>
        )}

        <div {...stylex.props(styles.divider)} />

        <Item
          label={
            confirmingDisconnect
              ? 'Tap again to disconnect'
              : 'Disconnect project…'
          }
          icon={<Trash2 size={18} />}
          destructive
          onClick={onDisconnect}
        />

        <div {...stylex.props(styles.sectionTitle)}>About</div>
        <Item label={`Build ${buildHash}`} onClick={onCopyHash} />
      </div>
    </div>
  );
}

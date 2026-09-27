import * as stylex from '@stylexjs/stylex';
import { Dialog, DialogHeader, AlertDialog, SelectableCard } from '@astryxdesign/core';
import { Check, Sun, Moon, MonitorSmartphone, Palette, Trash2 } from 'lucide-react';
import { useState } from 'react';

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
  onDisconnect: () => void;
  buildHash: string;
  onCopyHash: () => void;
  customTheme: CustomTheme | null;
  onRemoveCustomTheme: () => void;
  onInstallCustomTheme: (input: string) => string | null;
}

const styles = stylex.create({
  content: {
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'var(--font-heading)',
    color: 'var(--color-text-secondary)',
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
    color: 'var(--color-text-primary)',
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
  tileXstyle: {
    flex: 1,
  },
  tileContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  itemDestructive: {
    color: 'var(--color-text-red)',
  },
  check: {
    color: 'var(--color-text-secondary)',
    flexShrink: 0,
  },
  divider: {
    height: 1,
    backgroundColor: 'var(--color-border)',
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
    <SelectableCard
      label={label}
      isSelected={!!selected}
      onChange={() => onClick()}
      xstyle={styles.tileXstyle}
    >
      <div {...stylex.props(styles.tileContent)}>
        {icon}
        <span>{label}</span>
      </div>
    </SelectableCard>
  );
}

export default function SettingsPanel({
  open,
  onClose,
  weekStart,
  onWeekStart,
  mode,
  onMode,
  onDisconnect,
  buildHash,
  onCopyHash,
  customTheme,
  onRemoveCustomTheme,
  onInstallCustomTheme,
}: SettingsPanelProps) {
  const [themeError, setThemeError] = useState<string | null>(null);
  const [disconnectAlertOpen, setDisconnectAlertOpen] = useState(false);

  return (
    <Dialog
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      variant="fullscreen"
      purpose="info"
    >
      <DialogHeader
        title="Settings"
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      />
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
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
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
                <input
                  readOnly
                  value={JSON.stringify(customTheme).slice(0, 80) + '…'}
                  onClick={(e) => {
                    navigator.clipboard.writeText(JSON.stringify(customTheme)).catch(() => {});
                    (e.target as HTMLInputElement).select();
                  }}
                  title="Tap to copy the full theme JSON"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    borderRadius: 12,
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-background-body)',
                    color: 'var(--color-text-disabled)',
                    fontSize: 13,
                    padding: '10px 12px',
                    fontFamily: 'monospace',
                    marginBottom: 8,
                    cursor: 'pointer',
                    textOverflow: 'ellipsis',
                  }}
                />
              </>
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
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-background-body)',
                  color: 'var(--color-text-primary)',
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
            <div style={{ fontSize: 13, color: 'var(--color-text-disabled)', paddingTop: 8, lineHeight: 1.5 }}>
              Copy the prompt, ask your agent to make a theme, then paste the JSON back here.
            </div>
          </div>
        )}

        <div {...stylex.props(styles.divider)} />

        <Item
          label="Disconnect project…"
          icon={<Trash2 size={18} />}
          destructive
          onClick={() => setDisconnectAlertOpen(true)}
        />

        <AlertDialog
          isOpen={disconnectAlertOpen}
          onOpenChange={setDisconnectAlertOpen}
          title="Disconnect project?"
          description="This removes the Supabase connection from this device. Your journal data stays in Supabase."
          actionLabel="Disconnect"
          actionVariant="destructive"
          onAction={() => {
            setDisconnectAlertOpen(false);
            onDisconnect();
          }}
        />

        <div {...stylex.props(styles.sectionTitle)}>About</div>
        <Item label={`Build ${buildHash}`} onClick={onCopyHash} />
      </div>
    </Dialog>
  );
}

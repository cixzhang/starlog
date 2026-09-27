import * as stylex from '@stylexjs/stylex';
import { Check } from 'lucide-react';
import { useEffect } from 'react';

export type WeekStart = 1 | 7;
export type ThemeMode = 'light' | 'dark' | 'auto';

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
}

const styles = stylex.create({
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 50,
    opacity: 1,
    transition: 'opacity 0.2s ease',
  },
  panel: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 51,
    backgroundColor: 'var(--color-surface)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
    maxHeight: '80vh',
    overflowY: 'auto',
    transform: 'translateY(0)',
    transition: 'transform 0.25s ease',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'var(--color-border)',
    margin: '8px auto 12px',
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 12,
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
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    color: 'var(--color-text)',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    ':active': {
      backgroundColor: 'var(--color-surface-hover)',
    },
  },
  itemDestructive: {
    color: 'var(--color-danger)',
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
    marginTop: 8,
    marginBottom: 8,
  },
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.sectionTitle)}>{title}</div>
      {children}
    </div>
  );
}

function Item({
  label,
  selected,
  onClick,
  destructive,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      {...stylex.props(styles.item, destructive && styles.itemDestructive)}
      onClick={onClick}
    >
      <span>{label}</span>
      {selected && <Check size={18} {...stylex.props(styles.check)} />}
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
}: SettingsPanelProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div {...stylex.props(styles.backdrop)} onClick={onClose} />
      <div
        {...stylex.props(styles.panel)}
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
      >
        <div {...stylex.props(styles.handle)} />

        <Section title="Week starts on">
          <Item
            label="Monday"
            selected={weekStart === 1}
            onClick={() => onWeekStart(1)}
          />
          <Item
            label="Sunday"
            selected={weekStart === 7}
            onClick={() => onWeekStart(7)}
          />
        </Section>

        <Section title="Theme">
          <Item
            label="Light"
            selected={mode === 'light'}
            onClick={() => onMode('light')}
          />
          <Item
            label="Dark"
            selected={mode === 'dark'}
            onClick={() => onMode('dark')}
          />
          <Item
            label="Auto"
            selected={mode === 'auto'}
            onClick={() => onMode('auto')}
          />
        </Section>

        <div {...stylex.props(styles.divider)} />

        <Item
          label={
            confirmingDisconnect
              ? 'Tap again to disconnect'
              : 'Disconnect project…'
          }
          destructive
          onClick={onDisconnect}
        />

        <Section title="About">
          <Item label={`Build ${buildHash}`} onClick={onCopyHash} />
        </Section>
      </div>
    </>
  );
}

// Shared quiet UI primitives: loading shimmer, empty note, error note.

import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  loading: {
    padding: '48px 24px',
    textAlign: 'center',
    color: 'var(--sl-ink-faint)',
    fontSize: 14,
  },
  moon: {
    fontSize: 28,
    display: 'block',
    marginBottom: 12,
    opacity: 0.7,
  },
  empty: {
    padding: '56px 32px',
    textAlign: 'center',
    color: 'var(--sl-ink-faint)',
    fontSize: 15,
    lineHeight: 1.7,
  },
  error: {
    margin: '24px',
    padding: '16px 20px',
    border: '1px solid var(--sl-line)',
    borderLeft: '3px solid var(--sl-coral)',
    borderRadius: 8,
    color: 'var(--sl-ink-soft)',
    fontSize: 14,
    lineHeight: 1.6,
  },
  errorTitle: {
    color: 'var(--sl-ink)',
    fontWeight: 600,
    marginBottom: 4,
  },
});

export function Loading({ label = 'Reading the log…' }: { label?: string }) {
  return (
    <div {...stylex.props(styles.loading)}>
      <span {...stylex.props(styles.moon)} aria-hidden>
        ☾
      </span>
      {label}
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div {...stylex.props(styles.empty)}>
      <span {...stylex.props(styles.moon)} aria-hidden>
        ☾
      </span>
      {children}
    </div>
  );
}

export function ErrorNote({ title, detail }: { title: string; detail?: string }) {
  return (
    <div {...stylex.props(styles.error)} role="alert">
      <div {...stylex.props(styles.errorTitle)}>{title}</div>
      {detail ?? 'Something didn’t come through. Try again in a moment.'}
    </div>
  );
}

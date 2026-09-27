// Shared quiet UI primitives, built on Astryx.

import * as stylex from '@stylexjs/stylex';
import { Banner, EmptyState, Spinner } from '@astryxdesign/core';

const styles = stylex.create({
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '48px 24px',
    textAlign: 'center',
    color: 'var(--sl-ink-faint)',
    fontSize: 14,
  },
});

export function Loading({ label = 'Reading the log…' }: { label?: string }) {
  return (
    <div {...stylex.props(styles.center)}>
      <Spinner size="lg" />
      {label}
    </div>
  );
}

export function EmptyNote({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return <EmptyState title={title} description={description} />;
}

export function ErrorNote({ title, detail }: { title: string; detail?: string }) {
  return (
    <Banner
      status="error"
      title={title}
      description={detail ?? 'Something didn’t come through. Try again in a moment.'}
    />
  );
}

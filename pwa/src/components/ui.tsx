// Shared quiet UI primitives, built on Astryx.

import * as stylex from '@stylexjs/stylex';
import { Banner } from '@astryxdesign/core/Banner';
import { Spinner } from '@astryxdesign/core/Spinner';

import { getStrings } from '../lib/i18n';

const styles = stylex.create({
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '48px 24px',
    textAlign: 'center',
    color: 'var(--color-text-disabled)',
    fontSize: 14,
  },
});

export function Loading({ label }: { label?: string }) {
  const text = label ?? getStrings().ui.loading;
  return (
    <div {...stylex.props(styles.center)}>
      <Spinner size="lg" />
      {text}
    </div>
  );
}

export function ErrorNote({ title, detail }: { title: string; detail?: string }) {
  return (
    <Banner
      status="error"
      title={title}
      description={detail ?? getStrings().ui.errorDefault}
    />
  );
}

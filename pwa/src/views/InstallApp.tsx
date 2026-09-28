// Interstitial shown when a setup link opens in the browser (not the
// installed PWA). iOS gives the home-screen app separate storage from
// Safari, so configuring the browser wouldn't carry over. Instead we guide
// the user to install the PWA and paste the link there.

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { StarlogMark } from '../components/mark';
import { useStrings } from '../lib/i18n';

const styles = stylex.create({
  wrap: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    textAlign: 'center',
  },
  mark: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'var(--font-heading)',
    fontSize: 26,
    fontWeight: 600,
    letterSpacing: '0.01em',
    color: 'var(--color-text-primary)',
    margin: '0 0 8px',
  },
  sub: {
    fontSize: 15,
    lineHeight: 1.7,
    color: 'var(--color-text-secondary)',
    margin: '0 0 24px',
  },
  steps: {
    textAlign: 'left',
    fontSize: 14.5,
    lineHeight: 1.7,
    color: 'var(--color-text-secondary)',
    margin: '0 0 24px',
    padding: '0 0 0 4px',
    listStyle: 'none',
  },
  step: {
    marginBottom: 12,
    display: 'flex',
    gap: 12,
  },
  stepNum: {
    flexShrink: 0,
    width: 24,
    height: 24,
    borderRadius: '50%',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-secondary)',
    fontSize: 13,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    alignItems: 'center',
  },
  copied: {
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    margin: '4px 0 0',
  },
});

/** True when running as an installed PWA (iOS standalone or display-mode). */
export function isStandalone(): boolean {
  try {
    if ((navigator as { standalone?: boolean }).standalone === true) return true;
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export default function InstallApp({
  setupLink,
  onContinueInBrowser,
}: {
  /** The full setup URL (with params) to copy. */
  setupLink: string;
  /** User chose to configure the browser instead of installing. */
  onContinueInBrowser: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const s = useStrings();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(setupLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.card)}>
        <div {...stylex.props(styles.mark)}>
          <StarlogMark size={72} />
        </div>
        <h1 {...stylex.props(styles.title)}>{s.install.title}</h1>
        <p {...stylex.props(styles.sub)}>{s.install.sub}</p>
        <ol {...stylex.props(styles.steps)}>
          <li {...stylex.props(styles.step)}>
            <span {...stylex.props(styles.stepNum)}>1</span>
            <span>{s.install.step1}</span>
          </li>
          <li {...stylex.props(styles.step)}>
            <span {...stylex.props(styles.stepNum)}>2</span>
            <span>{s.install.step2}</span>
          </li>
          <li {...stylex.props(styles.step)}>
            <span {...stylex.props(styles.stepNum)}>3</span>
            <span>{s.install.step3}</span>
          </li>
        </ol>
        <div {...stylex.props(styles.actions)}>
          <Button
            label={copied ? s.setup.copied : s.install.copy}
            onClick={copyLink}
          />
          {copied && (
            <p {...stylex.props(styles.copied)}>{s.install.pasted}</p>
          )}
          <Button
            label={s.install.browser}
            variant="secondary"
            onClick={onContinueInBrowser}
          />
        </div>
      </div>
    </div>
  );
}

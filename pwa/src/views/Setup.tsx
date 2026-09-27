// First-run setup: collect the user's own Supabase project URL + anon key.
// Stored in localStorage only — never hardcoded, never committed.

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { getCapabilities, saveConfig, type SbConfig } from '../lib/supabase';
import { StarlogMark } from '../components/mark';

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
    fontSize: 30,
    fontWeight: 600,
    letterSpacing: '0.01em',
    color: 'var(--sl-ink)',
    margin: '0 0 8px',
  },
  sub: {
    fontSize: 15,
    lineHeight: 1.7,
    color: 'var(--sl-ink-soft)',
    margin: '0 0 28px',
  },
  field: {
    textAlign: 'left',
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 12.5,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--sl-ink-faint)',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-code)',
    fontSize: 13.5,
    padding: '11px 13px',
    borderRadius: 10,
    border: '1px solid var(--sl-line)',
    backgroundColor: 'var(--sl-paper-deep)',
    color: 'var(--sl-ink)',
    outline: 'none',
    ':focus': {
      borderColor: 'var(--sl-gold)',
    },
  },
  hint: {
    fontSize: 13,
    lineHeight: 1.65,
    color: 'var(--sl-ink-faint)',
    margin: '20px 0 0',
  },
  hintCode: {
    fontFamily: 'var(--font-code)',
    fontSize: 12,
  },
  error: {
    fontSize: 14,
    color: 'var(--sl-coral-deep)',
    margin: '0 0 16px',
    lineHeight: 1.6,
  },
  ok: {
    fontSize: 13.5,
    color: 'var(--sl-ink-soft)',
    margin: '16px 0 0',
  },
});

export default function Setup({ onDone }: { onDone: (cfg: SbConfig) => void }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    const cfg: SbConfig = {
      url: url.trim().replace(/\/+$/, ''),
      anonKey: key.trim(),
    };
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url)) {
      setError('That doesn\u2019t look like a Supabase project URL.');
      return;
    }
    if (cfg.anonKey.length < 20) {
      setError('That key looks too short — paste the full anon key.');
      return;
    }
    setBusy(true);
    try {
      const caps = await getCapabilities(cfg);
      saveConfig(cfg);
      onDone(cfg);
      // surface the spec version quietly via title; the app reads it again
      document.title = `Starlog · ${caps.spec_version}`;
    } catch (e) {
      setError(
        e instanceof Error
          ? `Couldn\u2019t reach that project: ${e.message}`
          : 'Couldn\u2019t reach that project.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.card)}>
        <div {...stylex.props(styles.mark)}>
          <StarlogMark size={72} />
        </div>
        <h1 {...stylex.props(styles.title)}>Starlog</h1>
        <p {...stylex.props(styles.sub)}>
          A journal for focus and reflection.
          <br />
          Point it at your own Supabase project to begin.
        </p>
        {error && (
          <p {...stylex.props(styles.error)} role="alert">
            {error}
          </p>
        )}
        <div {...stylex.props(styles.field)}>
          <label {...stylex.props(styles.label)} htmlFor="sl-url">
            Supabase project URL
          </label>
          <input
            id="sl-url"
            {...stylex.props(styles.input)}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://xyz.supabase.co"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
          />
        </div>
        <div {...stylex.props(styles.field)}>
          <label {...stylex.props(styles.label)} htmlFor="sl-key">
            Anon key
          </label>
          <input
            id="sl-key"
            {...stylex.props(styles.input)}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="eyJhbGciOi…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <Button
          label={busy ? 'Connecting…' : 'Connect'}
          onClick={connect}
          isDisabled={busy}
        />
        <p {...stylex.props(styles.hint)}>
          Find both in your Supabase dashboard under{' '}
          <span {...stylex.props(styles.hintCode)}>Project Settings → API</span>.
          They stay on this device only. The app can only read — it never
          writes to your journal.
        </p>
      </div>
    </div>
  );
}

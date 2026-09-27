// First-run setup: collect the user's own Supabase project URL + anon key.
// Stored in localStorage only — never hardcoded, never committed.

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import {
  getCapabilities,
  isValidProjectUrl,
  saveConfig,
  type SbConfig,
} from '../lib/supabase';
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

export default function Setup({
  onDone,
  initialUrl = '',
}: {
  onDone: (cfg: SbConfig) => void;
  initialUrl?: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A one-tap setup link pasted into the URL field fills in both fields.
  // This is the way to configure the installed PWA, whose storage is
  // separate from Safari's — tapping the link only sets up Safari.
  function handleUrlChange(v: string) {
    const qIndex = v.indexOf('?');
    if (qIndex >= 0) {
      try {
        const q = new URLSearchParams(v.slice(qIndex + 1));
        const linkUrl = (q.get('supabase_url') ?? '').trim().replace(/\/+$/, '');
        const linkKey = (q.get('anon_key') ?? '').trim();
        if (linkUrl || linkKey) {
          if (linkUrl) setUrl(linkUrl);
          if (linkKey) setKey(linkKey);
          return;
        }
      } catch {
        /* fall through and keep the raw text */
      }
    }
    setUrl(v);
  }

  async function connect() {
    setError(null);
    const cfg: SbConfig = {
      url: url.trim().replace(/\/+$/, ''),
      anonKey: key.trim(),
    };
    if (!isValidProjectUrl(cfg.url)) {
      setError('That doesn’t look like a Supabase project URL.');
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
          ? `Couldn’t reach that project: ${e.message}`
          : 'Couldn’t reach that project.',
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
          {initialUrl
            ? 'Your project link filled in the URL — just add the anon key.'
            : 'Point it at your own Supabase project to begin. Have a setup link? Paste the whole link into the URL field.'}
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
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://xyz.supabase.co — or paste a setup link"
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
            autoFocus={initialUrl.length > 0}
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

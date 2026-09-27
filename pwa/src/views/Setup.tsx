// First-run setup: collect the user's own Supabase project URL + anon key.
// Stored in localStorage only — never hardcoded, never committed.

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  getCapabilities,
  isValidProjectUrl,
  saveConfig,
  type SbConfig,
} from '../lib/supabase';
import { StarlogMark } from '../components/mark';const styles = stylex.create({
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
    color: 'var(--color-text-primary)',
    margin: '0 0 8px',
  },
  sub: {
    fontSize: 15,
    lineHeight: 1.7,
    color: 'var(--color-text-secondary)',
    margin: '0 0 28px',
  },
  field: {
    marginBottom: 16,
  },
  hint: {
    fontSize: 13,
    lineHeight: 1.65,
    color: 'var(--color-text-disabled)',
    margin: '20px 0 0',
  },
  hintCode: {
    fontFamily: 'var(--font-code)',
    fontSize: 12,
  },
  error: {
    fontSize: 14,
    color: 'var(--color-accent)',
    margin: '0 0 16px',
    lineHeight: 1.6,
  },
  ok: {
    fontSize: 13.5,
    color: 'var(--color-text-secondary)',
    margin: '16px 0 0',
  },
  agentPanel: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    textAlign: 'left',
  },
  agentTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    margin: '0 0 8px',
    textAlign: 'center',
  },
  agentSub: {
    fontSize: 13.5,
    lineHeight: 1.65,
    color: 'var(--color-text-secondary)',
    margin: '0 0 16px',
    textAlign: 'center',
  },
  promptBox: {
    fontFamily: 'var(--font-code)',
    fontSize: 12,
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-background-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 12,
    padding: '16px',
    margin: '0 0 16px',
    maxHeight: 220,
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    textAlign: 'left',
  },
  copyRow: {
    display: 'flex',
    justifyContent: 'center',
  },
  copied: {
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    margin: '12px 0 0',
    textAlign: 'center',
  },
});

// Copy-paste prompt for the user's AI agent to provision the backend.
const AGENT_PROMPT = `Set up a Supabase backend for Starlog, a read-only journaling PWA.

1. Create a new Supabase project (free tier is fine, any region).
2. Open the SQL editor and run the Starlog v0.4.0 schema. Fetch the raw SQL from:
   https://starlog-journal.vercel.app/schema/0001_init.sql
   It's self-contained — run it once, in full.
3. Go to Project Settings → API. Copy the Project URL and the anon / public key.
4. Reply with a one-tap setup link in this exact format:
   https://starlog-journal.vercel.app?supabase_url=<PROJECT_URL>&anon_key=<ANON_KEY>

Rules:
- Do not insert any sample data. An empty journal is correct.
- The app only reads; it never writes to the database.
- Treat the anon key like a password — don't share it beyond the setup link.`;

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
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

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
          <TextInput
            label="Supabase project URL"
            value={url}
            onChange={(v) => handleUrlChange(v)}
            placeholder="https://xyz.supabase.co — or paste a setup link"
            width="100%"
          />
        </div>
        <div {...stylex.props(styles.field)}>
          <TextInput
            label="Anon key"
            type="password"
            value={key}
            onChange={setKey}
            placeholder="eyJhbGciOi…"
            width="100%"
            hasAutoFocus={initialUrl.length > 0}
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

        <div {...stylex.props(styles.agentPanel)}>
          <h2 {...stylex.props(styles.agentTitle)}>No project yet?</h2>
          <p {...stylex.props(styles.agentSub)}>
            Copy this prompt, send it to your AI agent, and paste back the
            setup link it gives you.
          </p>
          <div {...stylex.props(styles.promptBox)}>{AGENT_PROMPT}</div>
          <div {...stylex.props(styles.copyRow)}>
            <Button
              label={copied ? 'Copied' : 'Copy agent prompt'}
              variant="secondary"
              onClick={copyPrompt}
            />
          </div>
          {copied && (
            <p {...stylex.props(styles.copied)}>
              Past it to your agent — it’ll hand you a setup link.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

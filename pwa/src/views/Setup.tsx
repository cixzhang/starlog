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
import { StarlogMark } from '../components/mark';
import { fmt, useStrings } from '../lib/i18n';const styles = stylex.create({
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
const AGENT_PROMPT = `Set up Starlog for me — a read-only journaling PWA.

1. Install the Starlog skill: npx skills add cixzhang/starlog --skill starlog --yes
2. Follow the skill's "First-time setup" section (Supabase project, schema, CLI config).
3. Reply with a one-tap setup link in this exact format:
   https://starlog-journal.vercel.app?supabase_url=<PROJECT_URL>&anon_key=<ANON_KEY>

Rules:
- Do not insert any sample data. An empty journal is correct.
- Treat the anon key like a password — it only goes into the setup link.`;

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
  const s = useStrings();

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
      setError(s.setup.badUrl);
      return;
    }
    if (cfg.anonKey.length < 20) {
      setError(s.setup.shortKey);
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
          ? fmt(s.setup.unreachableWith, { msg: e.message })
          : s.setup.unreachable,
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
          {s.setup.tagline}
          <br />
          {initialUrl ? s.setup.linkHint : s.setup.manualHint}
        </p>
        {error && (
          <p {...stylex.props(styles.error)} role="alert">
            {error}
          </p>
        )}
        <div {...stylex.props(styles.field)}>
          <TextInput
            label={s.setup.urlLabel}
            value={url}
            onChange={(v) => handleUrlChange(v)}
            placeholder={s.setup.urlPlaceholder}
            width="100%"
          />
        </div>
        <div {...stylex.props(styles.field)}>
          <TextInput
            label={s.setup.keyLabel}
            type="password"
            value={key}
            onChange={setKey}
            placeholder="eyJhbGciOi…"
            width="100%"
            hasAutoFocus={initialUrl.length > 0}
          />
        </div>
        <Button
          label={busy ? s.setup.connecting : s.setup.connect}
          onClick={connect}
          isDisabled={busy}
        />
        <p {...stylex.props(styles.hint)}>
          {s.setup.hint1}{' '}
          <span {...stylex.props(styles.hintCode)}>{s.setup.hintApi}</span>
          {s.setup.hint2}
        </p>

        <div {...stylex.props(styles.agentPanel)}>
          <h2 {...stylex.props(styles.agentTitle)}>{s.setup.noProject}</h2>
          <p {...stylex.props(styles.agentSub)}>{s.setup.agentSub}</p>
          <div {...stylex.props(styles.promptBox)}>{AGENT_PROMPT}</div>
          <div {...stylex.props(styles.copyRow)}>
            <Button
              label={copied ? s.setup.copied : s.setup.copyPrompt}
              variant="secondary"
              onClick={copyPrompt}
            />
          </div>
          {copied && (
            <p {...stylex.props(styles.copied)}>{s.setup.pasted}</p>
          )}
        </div>
      </div>
    </div>
  );
}

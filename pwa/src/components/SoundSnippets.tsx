// SoundSnippets: play audio snippets on a journal date.
//
// Read-only playback. The PWA never records or uploads — snippets are added
// by the agent (e.g. from audio Cindy shares in chat). Each snippet renders
// a play/pause button with its duration.

import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Pause, Play } from 'lucide-react';
import {
  audioPublicUrl,
  type Attachment,
  type SbConfig,
} from '../lib/supabase';

interface SoundSnippetsProps {
  cfg: SbConfig;
  attachments: Attachment[];
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function SnippetPlayer({
  cfg,
  attachment,
}: {
  cfg: SbConfig;
  attachment: Attachment;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setPlaying(false);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    }
  };

  return (
    <div {...stylex.props(styles.snippet)}>
      <audio
        ref={audioRef}
        src={audioPublicUrl(cfg, attachment.storage_path)}
        preload="metadata"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause sound snippet' : 'Play sound snippet'}
        {...stylex.props(styles.playButton)}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <span {...stylex.props(styles.snippetMeta)}>
        sound · {formatDuration(attachment.duration_ms)}
      </span>
      {playing && <span {...stylex.props(styles.eq)} aria-hidden="true" />}
    </div>
  );
}

export default function SoundSnippets({ cfg, attachments }: SoundSnippetsProps) {
  if (attachments.length === 0) return null;
  return (
    <div {...stylex.props(styles.root)}>
      {attachments.map((a) => (
        <SnippetPlayer key={a.id} cfg={cfg} attachment={a} />
      ))}
    </div>
  );
}

const styles = stylex.create({
  root: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  snippet: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  playButton: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  snippetMeta: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-code)',
  },
  // Tiny animated equalizer shown while a snippet plays.
  eq: {
    width: 14,
    height: 12,
    backgroundImage:
      'linear-gradient(var(--color-accent), var(--color-accent))',
    backgroundSize: '3px 100%',
    backgroundRepeat: 'repeat-x',
    animationName: 'sl-eq-bounce',
    animationDuration: '0.9s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
});

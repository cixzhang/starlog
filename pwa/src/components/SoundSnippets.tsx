// SoundSnippets: play sound scores on a journal date.
//
// Sounds are data: each score is a note list rendered by the PWA's felt-piano
// Web Audio synth (see lib/feltPiano). The PWA never records or uploads —
// scores are composed by the agent. Each score renders a play/pause button
// with its title and duration. When a score links to a decoration, playback
// drives that decoration's SVG animation.

import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Pause, Play } from 'lucide-react';
import { type SbConfig, type Score } from '../lib/supabase';
import {
  playScoreData,
  scoreDurationMs,
  type ScoreHandle,
} from '../lib/feltPiano';
import { useStrings } from '../lib/i18n';

interface SoundSnippetsProps {
  cfg: SbConfig;
  scores: Score[];
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Drive the linked decoration's SVG animation while the score plays. */
function syncDecoration(decorationId: string | null, playing: boolean) {
  if (!decorationId) return;
  const el = document.querySelector(
    `[data-decoration-id="${decorationId}"] svg`,
  ) as unknown as SVGSVGElement | null;
  if (!el) return;
  try {
    if (playing) {
      el.setCurrentTime(0);
      el.unpauseAnimations();
    } else {
      el.pauseAnimations();
    }
  } catch {
    /* SVG animation API unavailable — leave the decoration as is */
  }
}

function ScorePlayer({ score }: { score: Score }) {
  const handleRef = useRef<ScoreHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const s = useStrings();

  useEffect(() => {
    return () => {
      handleRef.current?.stop();
      syncDecoration(score.decoration_id, false);
    };
  }, [score.decoration_id]);

  const toggle = () => {
    if (playing) {
      handleRef.current?.stop();
      handleRef.current = null;
      syncDecoration(score.decoration_id, false);
      setPlaying(false);
      return;
    }
    const handle = playScoreData(score.score);
    if (!handle) return;
    handleRef.current = handle;
    syncDecoration(score.decoration_id, true);
    setPlaying(true);
    void handle.done.then(() => {
      handleRef.current = null;
      syncDecoration(score.decoration_id, false);
      setPlaying(false);
    });
  };

  return (
    <div {...stylex.props(styles.snippet)}>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? s.sound.pause : s.sound.play}
        {...stylex.props(styles.playButton)}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <span {...stylex.props(styles.snippetMeta)}>
        {score.title ?? s.sound.untitled} · {formatDuration(scoreDurationMs(score.score))}
      </span>
      {playing && <span {...stylex.props(styles.eq)} aria-hidden="true" />}
    </div>
  );
}

export default function SoundSnippets({ cfg: _cfg, scores }: SoundSnippetsProps) {
  if (scores.length === 0) return null;
  return (
    <div {...stylex.props(styles.root)}>
      {scores.map((s) => (
        <ScorePlayer key={s.id} score={s} />
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
  // Tiny animated equalizer shown while a score plays.
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

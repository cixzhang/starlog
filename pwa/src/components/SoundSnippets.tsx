// SoundSnippets: record and play audio snippets on a journal date.
//
// Recording uses MediaRecorder with MIME-type detection (iOS Safari records
// audio/mp4; Chrome/desktop record audio/webm). On save, the blob uploads
// to the `audio-snippets` storage bucket and an attachments row links it
// to the date's entry (creating the entry first if the day is empty).
//
// Playback is a plain HTMLAudioElement per snippet with play/pause toggle.

import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  Check,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
} from 'lucide-react';
import {
  audioPublicUrl,
  ensureEntry,
  insertAttachment,
  uploadAudio,
  type Attachment,
  type Entry,
  type SbConfig,
} from '../lib/supabase';

interface SoundSnippetsProps {
  cfg: SbConfig;
  tenantId: string;
  dateIso: string;
  entry: Entry | null;
  attachments: Attachment[];
  onEntryCreated: (entry: Entry) => void;
  onAttachmentAdded: (attachment: Attachment) => void;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function mimeExtension(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg')) return 'mp3';
  return 'webm';
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return undefined;
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

type RecState = 'idle' | 'recording' | 'preview' | 'uploading';

export default function SoundSnippets(props: SoundSnippetsProps) {
  const { cfg, tenantId, dateIso, entry, attachments, onEntryCreated, onAttachmentAdded } =
    props;
  const [recState, setRecState] = useState<RecState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const recordingSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        setPreviewBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setRecState('preview');
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start();
      const startedAt = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed(Date.now() - startedAt);
      }, 250);
      setRecState('recording');
    } catch {
      setError('Microphone unavailable — check permission and try again.');
    }
  }

  function stopRecording() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current?.stop();
  }

  function discardRecording() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewPlaying(false);
    setElapsed(0);
    setRecState('idle');
  }

  function togglePreview() {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (previewPlaying) {
      audio.pause();
      setPreviewPlaying(false);
    } else {
      void audio.play().then(
        () => setPreviewPlaying(true),
        () => setPreviewPlaying(false),
      );
    }
  }

  async function saveRecording() {
    if (!previewBlob) return;
    setRecState('uploading');
    setError(null);
    try {
      let e = entry;
      if (!e) {
        e = await ensureEntry(cfg, tenantId, dateIso);
        onEntryCreated(e);
      }
      const path =
        `${tenantId}/${dateIso}/${crypto.randomUUID()}` +
        `.${mimeExtension(previewBlob.type)}`;
      await uploadAudio(cfg, path, previewBlob);
      const attachment = await insertAttachment(
        cfg,
        tenantId,
        e.id,
        path,
        elapsed,
        previewBlob.type,
      );
      onAttachmentAdded(attachment);
      discardRecording();
    } catch {
      setError('Couldn’t save the snippet — try again.');
      setRecState('preview');
    }
  }

  return (
    <div {...stylex.props(styles.root)}>
      {attachments.map((a) => (
        <SnippetPlayer key={a.id} cfg={cfg} attachment={a} />
      ))}

      {recState === 'idle' && recordingSupported && (
        <button
          type="button"
          onClick={startRecording}
          {...stylex.props(styles.recordButton)}
          aria-label="Record a sound snippet"
        >
          <Mic size={14} />
          <span>Record a sound</span>
        </button>
      )}

      {recState === 'recording' && (
        <div {...stylex.props(styles.recBar)}>
          <span {...stylex.props(styles.recDot)} aria-hidden="true" />
          <span {...stylex.props(styles.timer)}>
            {formatDuration(elapsed) || '0:00'}
          </span>
          <button
            type="button"
            onClick={stopRecording}
            {...stylex.props(styles.stopButton)}
            aria-label="Stop recording"
          >
            <Square size={13} />
            <span>Stop</span>
          </button>
        </div>
      )}

      {recState === 'preview' && previewUrl && (
        <div {...stylex.props(styles.previewBar)}>
          <audio
            ref={previewAudioRef}
            src={previewUrl}
            preload="metadata"
            onEnded={() => setPreviewPlaying(false)}
          />
          <button
            type="button"
            onClick={togglePreview}
            {...stylex.props(styles.playButton)}
            aria-label={previewPlaying ? 'Pause preview' : 'Play preview'}
          >
            {previewPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <span {...stylex.props(styles.snippetMeta)}>
            {formatDuration(elapsed) || '0:00'}
          </span>
          <div {...stylex.props(styles.previewActions)}>
            <button
              type="button"
              onClick={discardRecording}
              {...stylex.props(styles.ghostButton)}
              aria-label="Discard and re-record"
            >
              <RotateCcw size={13} />
            </button>
            <button
              type="button"
              onClick={saveRecording}
              {...stylex.props(styles.saveButton)}
              aria-label="Save sound snippet"
            >
              <Check size={14} />
              <span>Save</span>
            </button>
          </div>
        </div>
      )}

      {recState === 'uploading' && (
        <div {...stylex.props(styles.recBar)}>
          <Loader2 size={14} {...stylex.props(styles.spinner)} />
          <span {...stylex.props(styles.snippetMeta)}>Saving…</span>
        </div>
      )}

      {error && <div {...stylex.props(styles.error)}>{error}</div>}
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
  recordButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    borderRadius: 999,
    padding: '6px 12px',
    cursor: 'pointer',
  },
  recBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: '#e5484d',
    animationName: 'sl-pulse',
    animationDuration: '1.2s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    flexShrink: 0,
  },
  timer: {
    fontFamily: 'var(--font-code)',
    fontSize: 13,
    color: 'var(--color-text-primary)',
    minWidth: 40,
  },
  stopButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-background-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 999,
    padding: '6px 14px',
    cursor: 'pointer',
  },
  previewBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  previewActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  ghostButton: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  saveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-on-accent)',
    backgroundColor: 'var(--color-accent)',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: 999,
    padding: '7px 14px',
    cursor: 'pointer',
  },
  spinner: {
    animationName: 'sl-spin',
    animationDuration: '1s',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
    color: 'var(--color-text-secondary)',
  },
  error: {
    fontSize: 12,
    color: '#e5484d',
  },
});

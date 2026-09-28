// feltPiano: Web Audio felt-piano synth for playing sound scores.
// Ported from the starlog-sound-palette. A score is data:
//   { voice: 'felt', room: 0.58, notes: [{n, t, d, v}, ...] }
// n = MIDI note, t = start seconds, d = duration seconds, v = velocity 0..1.

export interface ScoreNote {
  n: number;
  t: number;
  d: number;
  v: number;
}

export interface ScoreData {
  voice?: string;
  room?: number;
  notes: ScoreNote[];
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let dry: GainNode | null = null;
let wet: GainNode | null = null;

function midiFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function createImpulse(duration: number, decay: number): AudioBuffer {
  const rate = ctx!.sampleRate;
  const len = Math.floor(rate * duration);
  const buffer = ctx!.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] =
        (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buffer;
}

function ensureCtx(): AudioContext | null {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  dry = ctx.createGain();
  wet = ctx.createGain();
  const convolver = ctx.createConvolver();
  master.gain.value = 0.52;
  dry.gain.value = 0.84;
  convolver.buffer = createImpulse(2.45, 2.9);
  master.connect(dry);
  master.connect(convolver);
  convolver.connect(wet);
  dry.connect(ctx.destination);
  wet.connect(ctx.destination);
  return ctx;
}

function pianoNote(
  midi: number,
  start: number,
  duration: number,
  velocity: number,
  room: number,
  voice: string,
): AudioScheduledSourceNode[] {
  const ac = ctx!;
  const sources: AudioScheduledSourceNode[] = [];
  const now = ac.currentTime + start;
  const output = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  const felt = voice === 'felt';
  filter.frequency.setValueAtTime(felt ? 1650 : 3000, now);
  filter.frequency.exponentialRampToValueAtTime(
    felt ? 620 : 1100,
    now + duration,
  );
  output.connect(filter);
  filter.connect(master!);
  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(
    Math.max(0.008, velocity),
    now + (felt ? 0.028 : 0.012),
  );
  output.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  const partials: Array<[number, OscillatorType, number]> = felt
    ? [
        [1, 'sine', 1],
        [2, 'sine', 0.18],
        [3, 'triangle', 0.06],
      ]
    : [
        [1, 'triangle', 0.76],
        [2, 'sine', 0.24],
        [3, 'sine', 0.1],
      ];
  partials.forEach((p, idx) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = p[1];
    osc.frequency.value = midiFreq(midi) * p[0];
    osc.detune.value = idx === 0 ? -2 : idx * 1.4;
    g.gain.value = p[2];
    osc.connect(g);
    g.connect(output);
    osc.start(now);
    osc.stop(now + duration + 0.08);
    sources.push(osc);
  });
  if (felt) {
    const noiseLength = Math.floor(ac.sampleRate * 0.045);
    const buffer = ac.createBuffer(1, noiseLength, ac.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < noiseLength; i++)
      d[i] = (Math.random() * 2 - 1) * (1 - i / noiseLength);
    const source = ac.createBufferSource();
    const ng = ac.createGain();
    const nf = ac.createBiquadFilter();
    source.buffer = buffer;
    nf.type = 'lowpass';
    nf.frequency.value = 850;
    ng.gain.value = velocity * 0.11;
    source.connect(nf);
    nf.connect(ng);
    ng.connect(master!);
    source.start(now);
    sources.push(source);
  }
  if (wet && dry) {
    wet.gain.value = 0.08 + room * 0.25;
    dry.gain.value = 0.96 - room * 0.22;
  }
  return sources;
}

export interface ScoreHandle {
  stop: () => void;
  /** Resolve when the score finishes naturally. */
  done: Promise<void>;
}

/** Schedule a score for playback. Returns a handle to stop it early. */
export function playScoreData(score: ScoreData): ScoreHandle | null {
  const ac = ensureCtx();
  if (!ac || !score.notes || score.notes.length === 0) return null;
  const room = score.room ?? 0.58;
  const voice = score.voice ?? 'felt';
  const endTime =
    Math.max(...score.notes.map((n) => n.t + n.d)) + 1.2;
  let stopped = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((res) => {
    resolveDone = res;
  });
  const sources: AudioScheduledSourceNode[] = [];
  for (const n of score.notes) {
    if (n.d <= 0 || n.v <= 0) continue;
    sources.push(
      ...pianoNote(n.n, n.t, n.d, Math.min(1, n.v), room, voice),
    );
  }
  const timer = window.setTimeout(() => {
    if (!stopped) {
      stopped = true;
      resolveDone();
    }
  }, endTime * 1000 + 200);
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(timer);
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      resolveDone();
    },
    done,
  };
}

/** Total sounding time of a score in ms (for display). */
export function scoreDurationMs(score: ScoreData): number {
  if (!score.notes || score.notes.length === 0) return 0;
  return Math.round(
    Math.max(...score.notes.map((n) => n.t + n.d)) * 1000,
  );
}

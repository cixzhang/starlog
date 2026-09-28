---
name: "sound-synth"
description: "Render short felt-piano cues in the Starlog sound-palette voice. Use when the user asks for a sound, or when the agent notes a sound for a journal entry or decoration."
metadata: { "includeInPrompt": true }
---

# Sound Synth

## Purpose
Compose and render short piano cues in the Starlog sound-palette voice:
restrained, Satie-sparse felt piano. The output is a stereo WAV for
preview — and the note list itself, which is what gets stored (sounds
are data: `starlog add-score`).

## Tooling
`scripts/render-cue` — the synthesis recipe lives in code, not prose, so the
v1 mistakes (below) cannot be repeated.

```sh
scripts/render-cue --notes '[{"midi":48,"t":0,"d":2.2,"v":0.42}]' --out cue.wav
scripts/render-cue --notes-file notes.json --out cue.wav --room 0.4
```

Note spec: `midi` (MIDI number), `t` (start, seconds), `d` (duration,
seconds), `v` (velocity 0–1). Room ambience 0–1, default 0.58.

The PWA's synth (`pwa/src/lib/feltPiano.ts`) renders the same voice from
the stored note list, so what you hear in the WAV preview is what the
user hears on tap. (The preview uses `midi` keys; `add-score` takes `n`
— same numbers.)

## The voice (what render-cue implements)
- Soft partials per note: sine 1.0, 2nd harmonic 0.18, 3rd 0.06.
- Lowpass sweep 1650 → 620 Hz across each note's duration (the felt
  darkening — never skip this).
- 28 ms attack, exponential decay to silence over the note duration.
- Felt thump: 45 ms decaying noise at 11% velocity, lowpassed at 850 Hz.
- Room: 2.45 s decaying-noise convolution reverb, darkened tail.

## Composing
- Sparse: 2–4 notes, lots of air. Let each note decay before the next
  lands, or overlap gently for warmth.
- Warm registers: C3–C5 (MIDI 48–72). Low roots for grounding, a fifth or
  third above for color, resolve home.
- Velocities: lead 0.35–0.5, supporting voices 0.15–0.3. Quiet is the
  aesthetic — never push past 0.6.
- Keep cues under ~6 seconds. These are punctuation, not pieces.

## Workflow
1. Compose the note list from what the sound should feel like.
2. Render to `/tmp/<name>.wav` and preview it yourself.
3. Let the user hear it before storing — sounds are their call.
4. Store the **note list** (not the WAV) with
   `starlog add-score --date YYYY-MM-DD --title "<name>" --notes '<...>' [--decoration-id UUID]`.
   Raw recordings the user shares go through `starlog add-attachment`
   instead; composed cues always go through `add-score`.
5. Keep the note list in the day's notes if the cue is a keeper.

## Operating Rules
1. Always render through `scripts/render-cue`. Do not hand-roll synthesis —
   v1's static came from skipping the lowpass sweep and hard-clipping the
   mix; the script normalizes instead.
2. WAV only for renders. MP3/M4A are delivery formats, not working files.
3. Sounds are the user's call: preview first, store only what they approve
   (or what they explicitly asked the agent to note).
4. The PWA is read-only for audio — all sound writes go through the
   `starlog` CLI, never through app UI.

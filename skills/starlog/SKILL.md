---
name: "starlog"
description: "Write journal entries, prompts, reminders, decorations, sounds, and scores to a Starlog database (Supabase). Use whenever journaling activity in chat produces an entry to record (a photo of a paper journal page, a dictated entry, or a prompt response), to record daily journaling prompts, or to manage reminders. Also handles first-time backend setup for a new user."
---

# Starlog writer

## Purpose
Record journal entries in a Starlog backend (plain Supabase/PostgREST,
schema in `spec/migrations/`). The PWA is read-only; the agent is the
write path.

## First-time setup (new user, no backend yet)

When the user has no Starlog backend, set one up:

1. **Create a Supabase project** (free tier is fine, any region).
2. **Apply the schema.** In the SQL editor, run each migration in
   `spec/migrations/` in filename order (`0001_init.sql`,
   `0002_...`, ...). They are self-contained and idempotent markers —
   run each once, in full.
3. **Agent write policies.** The PWA reads as `anon`, but the agent
   writes through this skill — create permissive write policies so the
   agent's key can insert/update/delete. For each of `entries`,
   `prompts`, `reminders`, `decorations`, `scores`, `attachments`:
   ```sql
   create policy "Agent full write"
     on <table> for all to anon using (true) with check (true);
   ```
   (Tighten these later if you want per-user isolation; the single-user
   default is open-by-key.)
4. **Configure the CLI.** Get `scripts/starlog` — it's in this skill's
   directory if you installed via `npx skills add`, otherwise download it:
   `curl -o starlog https://starlog-journal.vercel.app/cli/starlog && chmod +x starlog`.
   Set `STARLOG_SUPABASE_URL` and `STARLOG_SUPABASE_KEY` (the project's
   anon/public key) in the environment, or write
   `~/.config/starlog/config.json`:
   `{"supabase_url": "...", "supabase_key": "..."}`.
   Verify with `starlog list-reminders` — an empty list means auth works.
5. **Hand back the one-tap setup link** in this exact format:
   `https://starlog-journal.vercel.app?supabase_url=<PROJECT_URL>&anon_key=<ANON_KEY>`
   The user taps it on their phone; the app configures itself and strips
   the key from the URL immediately.

Rules:
- Do not insert any sample data. An empty journal is correct.
- Treat the anon key like a password — it only ever goes into the setup
  link, never into chat logs or files.

## Tooling
`skills/starlog/scripts/starlog` (Python, executable, stdlib only):

- `get-entry --date YYYY-MM-DD` — read back one day's entry (verifies auth).
- `upsert-entry --date YYYY-MM-DD [--body TEXT | --body-file PATH | stdin] [--photo-hash HEX] [--merge]`
  - Idempotent PUT with `resolution=merge-duplicates`.
  - `--photo-hash`: sha256 hex of the intake photo bytes; re-sending the
    same photo is a safe no-op (reports `duplicate_photo`).
  - `--merge`: append to the existing entry for the date (one row per day).
  - Without `--merge`, writing a date that already has an entry replaces
    its body under the same id.
- `get-prompt --date YYYY-MM-DD` / `upsert-prompt --date YYYY-MM-DD [--body TEXT | --body-file PATH | stdin] [--flavor short|deep|maker|odd] [--delivered-at ISO]`
  - Idempotent write of one day's journaling prompt (unique per day).
  - Flavor follows the prompt style: quick one-liner → `short`,
    deeper reflection → `deep`, maker/arts-flavored → `maker`,
    odd/playful → `odd`.
- `add-reminder --title TEXT [--detail TEXT] --remind-at YYYY-MM-DD | ISO [--importance low|normal|high] [--urgency low|normal|high]`
  - A bare `YYYY-MM-DD` means 9:00am in the configured timezone that day.
  - `list-reminders [--status open|done|all]` — list reminders, soonest first.
  - `update-reminder --id UUID [--title TEXT] [--detail TEXT] [--remind-at YYYY-MM-DD|ISO] [--importance low|normal|high] [--urgency low|normal|high] [--status open|done]` — patch any subset of fields.
- `add-decoration --date YYYY-MM-DD [--svg TEXT | --svg-file PATH | stdin] [--kind sketch|doodle|sticker] [--z INT] [--meta JSON]`
  - Store an SVG decoration (digitized sketch, doodle, sticker) on a day.
  - The PWA renders decorations from the `decorations` table; the journaling
    agent should create one when the user shares a drawing/sketch photo.
  - SVG must be self-contained (no external references); max 65536 chars.
  - `meta` controls presentation as JSON: `{"width": 240, "align": "center"|"left"|"right", "rotation": 8, "color": "ink"}`.
    - `width`: max-width in px (SVG scales to fit). Omit for natural size.
    - `align`: horizontal placement within the sheet. Default center.
    - `rotation`: tilt in degrees. Slight tilt (5-10°) suits the sticker style.
    - `color`: palette name resolved to a theme-aware CSS variable.
      Palette: `ink`, `muted`, `coral`, `navy`, plus Astryx non-semantic
      icon colors: `red`, `orange`, `yellow`, `green`, `teal`, `cyan`,
      `blue`, `purple`, `pink`, `gray`. All adapt to light/dark mode.
  - SVG should use `stroke="currentColor"` / `fill="currentColor"` for any
    part that should take the `meta.color`. Fixed hex fills are fine for
    accent details (e.g. a coral blush or seal stamp).
  - `delete-decoration --id UUID` — remove a decoration (e.g. when
    re-creating one in a new style).
- `add-attachment --date YYYY-MM-DD --audio-file PATH [--duration-ms INT] [--decoration-id UUID]`
  - Store a raw audio snippet the user shares in chat (voice note, field
    recording). Uploads to the `audio-snippets` bucket and links an
    `attachments` row to the day's entry (creating an empty entry if needed).
  - Accepted: .m4a/.mp4/.webm/.ogg/.wav/.mp3, max 10MB.
  - `--decoration-id` pairs the sound with an animated SVG decoration; the
    PWA will drive that decoration's animation while the sound plays.
  - The PWA is read-only: it plays snippets but never records or uploads.
    All snippet writes go through this command.
- `add-score --date YYYY-MM-DD --title NAME (--notes JSON | --notes-file PATH) [--voice felt] [--room 0.58] [--decoration-id UUID]`
  - **Preferred for agent-composed sounds.** Store a sound as data: a note
    list `[{"n":48,"t":0,"d":2.2,"v":0.42},...]` (n=MIDI, t=start sec,
    d=duration sec, v=velocity 0..1). The PWA renders it with its felt-piano
    Web Audio synth — no audio files, no storage upload.
  - Compose with the `sound-synth` skill (`scripts/render-cue`); let the user hear
    the render before storing. Links to the day's entry like add-attachment.
  - `--decoration-id` pairs the score with an animated SVG decoration; the
    PWA restarts and unpauses that decoration's animation while the score
    plays.

### Decoration style guide: Doodle / Sticker
The Starlog doodle/sticker style. Playful hand-drawn icons with a sticker
feel — like stickers peeled onto the journal page.
- **Outlines:** chunky 3-4px, `currentColor`, round linecaps/joins.
- **Sticker halo:** a white (or cream) offset border around the whole shape.
  Draw the shape twice: first a slightly larger copy filled/stroked white
  (no `currentColor`), then the real shape on top.
- **Fills:** small flat color fills are welcome — warm tans, creams, soft
  pastels. Keep to 1-2 fills plus the outline color.
- **Tilt:** slight rotation (5-10°) via `meta.rotation` gives the
  just-stuck-on feel. Don't overdo it.
- **Accents:** tiny sparkles, motion marks, or blush strokes add charm.
  Use sparingly — one or two per decoration.
- **Characters/text:** hand-lettered feel; a casual sans or the system font
  is fine. Don't aim for calligraphic precision.
- **Size:** keep the viewBox around 200x200; the PWA scales via meta.width.
  Aim for decorations that read well at ~160-200px wide.
- Trace the user's drawings faithfully — adapt their sketch INTO this style
  (chunky outlines, halo, tilt) rather than redrawing from scratch.
  Don't invent details not in their original.
- **Know your subject:** before tracing, identify what the drawing depicts
  and recall its defining visual features. Use that knowledge as a
  checklist against your tracing — if the subject is a mooncake, it typically
  has a fluted mold edge and visible thickness; if it's a cat, it has ears,
  whiskers, a tail. When your stylized version drops a defining feature or
  adds one the subject doesn't have, that's a bug, not a style choice.
  **The user's call overrides the checklist:** if they review and pick a
  version that drops a "defining" feature, that's final — don't re-add it
  later as a fix. When in doubt, re-examine their photo's geometry (shapes,
  proportions, which features are present) against your SVG coordinates
  before uploading — note this is structural comparison, not a visual
  render check.

## Auth
The CLI reads `STARLOG_SUPABASE_URL` and `STARLOG_SUPABASE_KEY` from the
environment (falling back to `~/.config/starlog/config.json` keys
`supabase_url` / `supabase_key`). The key — e.g. the project's anon key —
travels as both the `apikey` header and `Authorization: Bearer`, so the
same credential works for PostgREST and Storage. Never ask the user to
paste a key into chat; point them at the env var or config file instead.

Optional: `STARLOG_TENANT_SLUG` (default `personal`) selects which tenant
row the CLI writes to; `STARLOG_TIMEZONE` (default: system local) sets the
timezone for bare `YYYY-MM-DD` reminder times.

## Operating Rules

1. `entry_date` is the user's local calendar day (per `STARLOG_TIMEZONE`).
2. Intake photos are transient: hash the bytes (sha256), store only the hex
   in `source_photo_hash`. Never persist photo bytes anywhere.
3. `body_text` must be the `starlog-md-1` subset (text-only CommonMark:
   no raw HTML, no external images). The CLI rejects violations.
4. Journal photos: transcribe handwriting faithfully into Markdown;
   note sketches/doodles in brackets rather than inventing content.
   If the photo contains a drawing/sketch, ALSO create an SVG decoration
   via `add-decoration` — trace the essential shapes faithfully, don't
   invent details not in the original. The PWA renders decorations
   alongside the entry text.
5. After writing, the receipt to the user stays short: what was recorded,
   for which date. No analysis of the entry unless they ask.

## Theming
For generating and installing custom color themes, see `theming.md` in
this skill directory. Themes are shared via `?theme=` URL params and
applied as CSS variable overrides — no rebuild needed.

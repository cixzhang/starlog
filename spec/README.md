# Starlog data contract — spec v0.4.0 (Stage 0)

The authoritative backend contract for Starlog. `spec/` is the source of
truth: the PWA, the agent, and any future client implement against this, not
against each other. The backend is plain Supabase (PostgREST auto-generated
REST, no custom server, no Storage bucket); **everything here is provable
with curl, and the backend keeps working if the PWA disappears.**

## File map

| file | what it is |
|------|------------|
| `tables.sql` | Full table definitions, indexes, checks (readability view) |
| `rls.sql` | Row-level-security policies + grants (readability view) |
| `migrations/0001_init.sql` | **Authoritative.** Self-contained v0.4.0 baseline — apply this to provision |
| `errors.md` | Structured error format: transport vs contract errors, idempotency rules |
| `README.md` | This file: conventions, versioning, and the curl proof |

`tables.sql` / `rls.sql` are readability views of `migrations/0001_init.sql`.
Per release, regenerate them from `migrations/` — never edit them independently.

**Pre-release amendments** (all happened before any backend was ever
provisioned, so rewriting unapplied history was safe; once a migration has
been applied anywhere it is frozen and changes go in a new `0002_...` file):

- v0.1.0 → v0.2.0: rich entry content (Markdown body, attachments, Storage).
- v0.2.0 → v0.3.0: the attachments + Storage design was replaced by the
  `sounds` table — curated sounds as compact symbolic **scores**, not audio
  files. No uploads, no Storage bucket.
- v0.3.0 → v0.4.0: **sound cut entirely for v1.** The `sounds` table, the
  `sound:` embed, and the score encoding are removed; the direction is
  parked as "Future: sound" below.

## Entities

| table | purpose |
|-------|---------|
| `tenants` | Tenant registry. v0.4.0 seeds one row: `slug = 'personal'` |
| `entries` | One day's journal content as **Markdown** (`body_text`, format `body_format`). `entry_date` (local day) + derived `weekday` (ISO 1–7) power the weekday-orbit view |
| `prompts` | Daily prompt, one per day. `flavor`: `short`/`deep`/`maker`/`odd` |
| `reminders` | Reminders with **agent-assigned** `importance` and `urgency` (`low`/`normal`/`high`); `status`: `open`/`done`/`dismissed` |
| `decorations` | SVG sketches/doodles/stickers. Belongs to one `entry_date` even when rendered overflowing it; `entry_date IS NULL` = sticker tray. `meta` (jsonb) is UI hints only — no semantics |
| `capabilities` | Singleton row: spec version + supported operations. Clients read this instead of out-of-band docs |
| `schema_migrations` | Bookkeeping: one row per applied migration |

Every table carries `tenant_id`, `created_at`, `updated_at` (`updated_at` is
maintained by trigger). Conventions: snake_case, `timestamptz` (UTC) for
moments, `date` for journal days (the user's local calendar day; conversion
is client-side), text + CHECK instead of Postgres enums, compact SVG capped
at 64KB (`char_length(svg) <= 65536`), entry Markdown capped at 200k chars.

## Entry content: Starlog Markdown (`starlog-md-1`)

`entries.body_text` is Markdown in the Starlog subset, versioned by
`entries.body_format` (v0.4.0 knows only `starlog-md-1`). The subset is
conservative, **text-only** CommonMark and deliberately UI-agnostic: any
compliant renderer produces the same document structure, on any client.
There are no embeds of any kind in v0.4.0 — sound was cut for v1 (see
"Future: sound" below).

**Supported:**

- ATX headings `#`–`###` (h1–h3 only)
- Paragraphs, hard breaks (two trailing spaces)
- Fenced code blocks (` ``` `, optional info string)
- Blockquotes `>` (single level)
- Unordered (`-`, `*`) and ordered (`1.`) lists, nested
- Thematic breaks (`---`)
- Inline: emphasis (`*`/`**`/`_`/`__`), inline code, links
  `[text](https://…)` (absolute `https://` URLs only),
  autolinks `<https://…>`

**Excluded** (dry-run validation MUST reject; see `errors.md`):

- Raw HTML / HTML blocks — clients must never render raw HTML from entries
- External images `![](https://…)` — no external media (no tracking pixels,
  no link rot)
- Binary uploads or embeds of any kind — there is no upload path in v0.4.0
- Setext headings, indented code blocks, tables, strikethrough, task
  lists, footnotes, reference-style link definitions

Subset validation is **client-side dry-run** (`STARLOG_VALIDATION_FAILED`),
consistent with the contract's existing philosophy. The database enforces
only the `body_format` enum and the 200k-char length cap. Growing the
subset later means minting `starlog-md-2` and adding it to the CHECK —
old entries keep rendering under the format they were written in.

## Future: sound (parked for v1)

Sound is cut from v0.4.0. The parked direction, to test later: kept audio
snippets curated into entries, a day's sound playing when navigating to
that day, and an experimental symbolic score encoding — scores as text
synthesized client-side, scores to ears as SVGs are to eyes. None of this
is in the migration; when sound returns it gets a new migration, a new
markdown format value for its embed syntax, and a spec bump.

## Intake: what is stored, what is never stored

**Intake artifacts are never stored.** The agent's intake flow (chat)
accepts two kinds of raw material, and both are transient:

- **Paper-journal photos** (photos of diary pages sent to Muse): the
  agent extracts text, records only `entries.source_photo_hash` (sha256
  hex — the dedupe key), and discards the bytes. Re-sending the same
  photo is a safe no-op via the partial unique index.
- **Audio recordings** (voice memos sent to the agent): in v0.4.0
  recordings are assumed to be speech — the agent transcribes them to
  text, which lands in the entry's markdown body (like photo extraction:
  talking to the journal is another way of writing in it), and discards
  the bytes. The agent does not judge audio keepsakes in v1.

The extraction receipt reports what was done ("transcribed to text"),
and she can correct it — the same receipt/correction loop as photo
extraction. There is no column anywhere for intake-photo or intake-audio
bytes: intake material is transient; only the agent's readings (extracted
text) are kept.

## Access model (v0.4.0)

- **Browser / PWA** holds the Supabase URL + **anon key**: **read-only**
  (`select` on all tables). No anon insert/update/delete policies exist,
  so writes are denied by default. There is no Storage bucket at all.
- **Agent** holds the **service_role key in the secure vault** (never in
  chat, GitHub, URLs, or query params) and performs all writes;
  service_role bypasses RLS.
- Secrets travel vault → tool only. The PWA setup URL carries non-secret
  config only.

## Versioning & migrations

- Setup applies a **specific spec version**; upgrades are **versioned
  migrations** (`migrations/0002_...`, `0003_...`), additive only — never
  rewrite history, **except** the three pre-release amendments of
  `0001_init` (v0.1.0 → v0.2.0 → v0.3.0 → v0.4.0) documented above, which
  happened before any backend was provisioned.
- Each migration inserts into `schema_migrations` and bumps
  `capabilities.spec_version` + `operations`.
- Every migration that adds a table MUST extend the grants in the RLS section.

## Capabilities

`GET /rest/v1/capabilities?select=spec_version,operations` tells any client
what this backend supports. v0.4.0 operations:

```
tenants.read, entries.read, entries.write,
prompts.read, prompts.write, reminders.read, reminders.write,
decorations.read, decorations.write, capabilities.read
```

(`write` = supported by the backend via the agent's service_role key;
the PWA's anon key remains read-only in v0.4.0.)

## Idempotency & dedupe

- Writes SHOULD use client-generated UUID primary keys with
  `PUT /rest/v1/<table>?id=eq.<uuid>` + `Prefer: resolution=merge-duplicates`
  → safe retries, no duplicates.
- Intake photos are **never stored**. `entries.source_photo_hash` (sha256
  hex) has a per-tenant partial unique index: re-sending a photo is a safe
  no-op. On `23505`, read the existing row back
  (`?source_photo_hash=eq.<hash>`).
- Intake recordings are **never stored** either (see "Intake" above) —
  in v0.4.0 they are speech: the agent transcribes them to entry text and
  discards the bytes; the receipt reports the transcription and she
  corrects it like photo extraction.
- Dry-run is client-side validation against this spec (see `errors.md`),
  including the Markdown subset rules.

## The curl proof — provision → write → read

No PWA involved. Replace `$SB_URL`, `$SB_ANON`, `$SB_SERVICE`.

```bash
# 0. Provision: apply migrations/0001_init.sql once
#    (Supabase SQL editor, or: psql "$DATABASE_URL" -f migrations/0001_init.sql)

# 1. Capabilities — what does this backend speak? (anon key is fine)
curl -s "$SB_URL/rest/v1/capabilities?select=spec_version,operations" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $SB_ANON"
# -> {"spec_version":"0.4.0","operations":[...]}   (200)

# 2. Resolve the tenant id (service_role)
TENANT_ID=$(curl -s "$SB_URL/rest/v1/tenants?slug=eq.personal&select=id" \
  -H "apikey: $SB_SERVICE" -H "Authorization: Bearer $SB_SERVICE" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")

# 3. Write a Markdown entry — idempotent PUT upsert
EID=$(python3 -c "import uuid; print(uuid.uuid4())")
PHASH=$(python3 -c "import hashlib; print(hashlib.sha256(b'test-photo-1').hexdigest())")
BODY='# Monday

Market day. Bought persimmons.

*So good.*'
curl -s -X PUT "$SB_URL/rest/v1/entries?id=eq.$EID" \
  -H "apikey: $SB_SERVICE" -H "Authorization: Bearer $SB_SERVICE" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "$(python3 -c "import json,sys; print(json.dumps({
      'id': '$EID', 'tenant_id': '$TENANT_ID', 'entry_date': '2026-09-26',
      'body_text': '''$BODY''', 'body_format': 'starlog-md-1',
      'source_photo_hash': '$PHASH', 'created_by': 'agent'}))")"

# 4. Read back the weekday orbit (anon key): all Mondays (weekday=1), newest first
curl -s "$SB_URL/rest/v1/entries?tenant_id=eq.$TENANT_ID&weekday=eq.1&order=entry_date.desc&select=entry_date,body_text" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $SB_ANON"

# 5. Reminder-compass window: open reminders in prev/current/next week (anon)
curl -s "$SB_URL/rest/v1/reminders?status=eq.open&remind_at=gte.2026-09-20T00:00:00Z&remind_at=lt.2026-10-11T00:00:00Z&order=remind_at&select=title,remind_at,importance,urgency" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $SB_ANON"

# 6. RLS check — anon table write must be denied:
curl -s -X POST "$SB_URL/rest/v1/entries" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $SB_ANON" \
  -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"entry_date\":\"2026-09-26\"}"
# -> 401/42501 (denied). Expected.

# 7. Write a reminder with agent-assigned importance/urgency (service_role)
curl -s -X POST "$SB_URL/rest/v1/reminders" \
  -H "apikey: $SB_SERVICE" -H "Authorization: Bearer $SB_SERVICE" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"title\":\"Water the plants\",\
\"remind_at\":\"2026-09-27T18:00:00Z\",\"importance\":\"low\",\"urgency\":\"high\",\
\"created_by\":\"agent\"}"
# -> 201 with the row
```

If steps 1–7 behave as annotated, the contract is proven: provision →
write (idempotent, incl. Markdown) → read (weekday orbit, compass window)
→ RLS enforced.

## Open decisions (for review)

1. **importance / urgency enums**: proposed `low`/`normal`/`high`, both
   agent-assigned. Alternatives: 5-point scales, or urgency derived from
   `remind_at` distance. React and we'll re-cut.
2. **PWA writability**: v0.4.0 anon is read-only. Whether the PWA may write
   decorations/reminders directly (narrow RLS policies, sketched +
   commented in `rls.sql`) is undecided.
3. **Entry title**: omitted — `body_text` only. Add a short title/summary if
   the calendar needs it.
4. **SVG cap**: 64KB is arbitrary; raise if digitized sketches run larger.
5. **Prompt flavors**: `short`/`deep`/`maker`/`odd`, from the prompt-variety
   preference. Easy to extend.
6. **Dry-run**: client-side validation only in v0.4.0 (Markdown subset
   rules in `errors.md`); a server `dry_run` RPC is parked.
7. **Single-tenant RLS**: table policies are `using (true)` for anon reads.
   `tenant_id` on every table reserves the shared-tenancy path (sketch in
   `rls.sql`).
8. **Markdown subset**: `starlog-md-1` is deliberately conservative
   (text-only CommonMark core; no raw HTML, no external images, no
   binary uploads). Extensions need a `starlog-md-2` format value — say
   which constructs you miss and we'll version up.
9. **Recording dedupe**: intake photos dedupe on `source_photo_hash`.
   Recordings are speech in v0.4.0 — re-sending one re-transcribes it.
   Should recordings get a parallel `source_recording_hash`, or is
   re-transcription acceptably non-idempotent? Undecided.

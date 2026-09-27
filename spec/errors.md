# Starlog — structured errors (spec v0.4.0, Stage 0)

Two layers of errors exist. They are deliberately different shapes; do not
mix them.

## 1. Transport errors (PostgREST / Supabase)

These come straight from the auto-generated REST API and keep their native
shape — the contract does not wrap them. (There is no Storage bucket in
v0.4.0, so no storage transport codes exist.)

```json
{
  "code": "23505",
  "details": "Key (tenant_id, source_photo_hash)=(..., ...) already exists.",
  "hint": null,
  "message": "duplicate key value violates unique constraint \"entries_photo_hash_uidx\""
}
```

Common transport codes and their contract meaning:

| code | meaning in Starlog |
|------|--------------------|
| `23505` | Unique violation. On `entries_photo_hash_uidx` this means the photo was already ingested → treat as an idempotent replay: read the existing row back, do not error. On `prompts(tenant_id, prompt_date)` it means a prompt already exists for that day. |
| `42501` / `401` | RLS denied. The anon key attempted a write (v0.4.0: anon is read-only), or the key is wrong. |
| `22P02` | Malformed UUID in the URL or body. |
| `PGRST116` | Single-object GET (`Accept: application/vnd.pgrst.object+json`) found no rows. |
| `400` | Malformed query (bad operator, bad `select=`). |
| `23514` | CHECK violation — e.g. a bad `body_format` value or a `decorations.svg` over 64KB. Map to the matching contract code below where one exists. |

## 2. Contract errors (agent / setup tooling)

Errors produced by agent-side validation, dry-run checks, and setup scripts
use the `STARLOG_` envelope so they are distinguishable from transport errors:

```json
{
  "error": {
    "code": "STARLOG_VALIDATION_FAILED",
    "message": "reminder.urgency must be one of low, normal, high",
    "details": {
      "table": "reminders",
      "field": "urgency",
      "value": "asap",
      "allowed": ["low", "normal", "high"]
    },
    "hint": "See spec/tables.sql for the check constraints.",
    "spec_version": "0.4.0"
  }
}
```

Catalog (v0.4.0):

| code | when |
|------|------|
| `STARLOG_VALIDATION_FAILED` | Client-side dry-run validation failed before any write. `details` names table, field, value, and the allowed set. Also used for Markdown subset violations — `details` then names the rejected construct and the entry id, e.g. raw HTML or a heading deeper than `###`. |
| `STARLOG_EXTERNAL_IMAGE_REJECTED` | Entry markdown used `![](https://…)` (or `http://`). External media is not in the subset, and there is no binary upload path in v0.4.0. |
| `STARLOG_IDEMPOTENT_REPLAY` | A write was safely skipped because it already exists (same client UUID, or same photo hash). Informational, not a failure. `details` carries the existing row id. |
| `STARLOG_PHOTO_HASH_CONFLICT` | `23505` on `entries_photo_hash_uidx`, surfaced in contract terms: the photo was already ingested. Read it back with `GET /rest/v1/entries?source_photo_hash=eq.<hash>`. The photo bytes were never stored and are not recoverable — this is by design. |
| `STARLOG_UNKNOWN_SPEC_VERSION` | Setup targeted a spec version with no migration path. |
| `STARLOG_MIGRATION_OUT_OF_ORDER` | A migration was applied whose predecessor is missing from `schema_migrations`. |
| `STARLOG_WRITE_DENIED` | Contract-level restatement of an RLS denial: this key may not write this table in this spec version. |

## Idempotency rules (how to avoid errors in the first place)

1. **Client-generated UUIDs.** Generate `id` client-side and write with
   `PUT /rest/v1/<table>?id=eq.<uuid>` + `Prefer: resolution=merge-duplicates`.
   Retries of the same write converge on the same row — no duplicates, ever.
2. **Photo dedupe.** `entries.source_photo_hash` has a partial unique index
   per tenant. Re-sending a photo returns `23505` → treat as
   `STARLOG_IDEMPOTENT_REPLAY` and read the existing row back. The photo
   bytes are never stored; the hash is the dedupe key.
3. **One prompt per day.** `prompts` has a unique `(tenant_id, prompt_date)`;
   the daily job upserts rather than inserts.
4. **Recordings are transcribed, not kept.** Intake recordings are speech
   in v0.4.0: the agent transcribes them to entry text and discards the
   bytes — never speculatively kept, and the receipt reports the
   transcription so the user can correct it.

## Dry-run

v0.4.0 dry-run is **client-side validation against this spec**: check field
presence, CHECK-constraint value sets, UUID formats, the 64-hex photo hash,
and the Markdown subset rules — before issuing the write. There is no
server-side dry-run endpoint yet (a `dry_run` RPC is parked as a possible
future addition). A failed dry-run produces `STARLOG_VALIDATION_FAILED`
and no network write is attempted.

**Markdown subset checklist** (`starlog-md-1`; reject → `STARLOG_VALIDATION_FAILED`):

- [ ] `body_format` is `starlog-md-1`; `char_length(body_text) <= 200000`
- [ ] No raw HTML: no `<tag`, `</tag>`, `<!--`, or HTML blocks
- [ ] No external images: no `![](http…)` — there are no embeds of any
      kind in v0.4.0
- [ ] No binary uploads or embed schemes — `attachment:` and `sound:`
      are not things in v0.4.0
- [ ] Headings are `#`–`###` only (no `####`+)
- [ ] Links use absolute `https://` URLs (no `http://`, no relative, no `javascript:`)
- [ ] No setext headings, indented code blocks, tables, strikethrough,
      task lists, or footnotes

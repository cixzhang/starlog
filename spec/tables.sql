-- ============================================================================
-- Starlog data contract — tables.sql
-- Spec version: 0.4.0 (Stage 0)
--
-- READABILITY VIEW. The authoritative apply order lives in migrations/.
-- migrations/0001_init.sql is the self-contained v0.4.0 baseline (amended
-- pre-release; see its header); this file and rls.sql are the same content
-- split for review. Per release, regenerate these views from migrations/ —
-- do not edit them independently.
--
-- Conventions (see README.md):
--   * snake_case everywhere. Timestamps are timestamptz (UTC).
--   * Primary keys are UUIDs. Writers SHOULD generate the UUID client-side
--     and upsert (PUT ... ?id=eq.<uuid>) so retries are idempotent.
--   * tenant_id on every table. v0.4.0 is single-tenant per Supabase project;
--     tenant_id reserves the future shared-tenancy path.
--   * Text + CHECK constraints instead of Postgres enums (simpler migrations,
--     friendlier over PostgREST).
--   * No custom RPC in v0.4.0. All access is Supabase-generated REST
--     (PostgREST). The backend must keep working if the PWA disappears.
--   * Entry bodies are Markdown (Starlog subset, versioned by body_format).
--     Subset validation is client-side dry-run; the DB enforces only the
--     format enum and a length cap.
--   * No sound/media tables in v0.4.0 (cut for v1; parked as README
--     "Future: sound"). No audio files, no uploads, no Storage bucket.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- tenants: one row per tenant. v0.4.0 seeds exactly one: slug = 'personal'.
-- Resolve its id at runtime: GET /rest/v1/tenants?slug=eq.personal&select=id
-- ----------------------------------------------------------------------------
create table tenants (
  id           uuid        primary key default gen_random_uuid(),
  slug         text        not null unique,
  display_name text        not null default 'My Starlog',
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- entries: one journal entry = one day's content, as Markdown.
-- body_text holds Markdown in the Starlog subset versioned by body_format
-- (see README "Entry content: Starlog Markdown"). entry_date is the user's
-- LOCAL calendar day (conversion is client-side). weekday is derived
-- (ISO: Monday=1 .. Sunday=7) for weekday-orbit queries.
-- source_photo_hash is the sha256 hex of an INTAKE photo (paper-journal
-- pages sent to Muse for extraction). Intake photos are NEVER stored —
-- only the hash (dedupe key) and the extracted text. The partial unique
-- index makes re-sending the same photo a safe no-op. There is no
-- sound/media table in v0.4.0 (cut for v1; parked as a README
-- "Future: sound" note) — and no column anywhere for intake bytes of any
-- kind: intake photos and intake recordings are never stored, only the
-- extracted text and the photo hash.
-- ----------------------------------------------------------------------------
create table entries (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references tenants(id) on delete cascade,
  entry_date        date        not null,
  weekday           smallint    generated always as (extract(isodow from entry_date)::smallint) stored,
  body_text         text        not null default ''
                                check (char_length(body_text) <= 200000),
  body_format       text        not null default 'starlog-md-1'
                                check (body_format in ('starlog-md-1')),
  source_photo_hash text        check (source_photo_hash is null or source_photo_hash ~ '^[0-9a-f]{64}$'),
  created_by        text        not null default 'agent'
                                check (created_by in ('agent', 'human')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index entries_photo_hash_uidx
  on entries (tenant_id, source_photo_hash)
  where source_photo_hash is not null;
create index entries_date_idx    on entries (tenant_id, entry_date desc);
create index entries_weekday_idx on entries (tenant_id, weekday, entry_date desc);

-- ----------------------------------------------------------------------------
-- prompts: the daily journaling prompt, one per day.
-- flavor records the prompt variety: short | deep | maker | odd.
-- ----------------------------------------------------------------------------
create table prompts (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants(id) on delete cascade,
  prompt_date  date        not null,
  body         text        not null check (body <> ''),
  flavor       text        not null default 'short'
                            check (flavor in ('short', 'deep', 'maker', 'odd')),
  delivered_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, prompt_date)
);

-- ----------------------------------------------------------------------------
-- reminders: future (and past) reminders.
-- importance and urgency are AGENT-ASSIGNED (low | normal | high). The UI
-- reflects that judgment visually (weight, shape, scale) — see plan.
-- remind_at is an absolute moment (timestamptz). Week bucketing for the
-- reminder compass is derived client-side from remind_at.
-- ----------------------------------------------------------------------------
create table reminders (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants(id) on delete cascade,
  title       text        not null check (title <> ''),
  detail      text        not null default '',
  remind_at   timestamptz not null,
  importance  text        not null default 'normal'
                           check (importance in ('low', 'normal', 'high')),
  urgency     text        not null default 'normal'
                           check (urgency in ('low', 'normal', 'high')),
  status      text        not null default 'open'
                           check (status in ('open', 'done', 'dismissed')),
  created_by  text        not null default 'agent'
                           check (created_by in ('agent', 'human')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index reminders_when_idx   on reminders (tenant_id, remind_at);
create index reminders_status_idx on reminders (tenant_id, status, remind_at);

-- ----------------------------------------------------------------------------
-- decorations: SVG sketches, doodles, and stickers. SVG is the shared
-- primitive for digitized sketches, in-app doodles, and decorations.
-- A decoration belongs to ONE day in the data model (entry_date) even when
-- the UI renders it overflowing into neighboring days. entry_date IS NULL
-- means unplaced: it lives in the sticker tray, not on any day.
-- meta is a UI-hints escape hatch (position, rotation, scale). It carries
-- no semantics; the contract stays UI-agnostic.
-- ----------------------------------------------------------------------------
create table decorations (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants(id) on delete cascade,
  entry_date  date,
  kind        text        not null default 'doodle'
                           check (kind in ('sketch', 'doodle', 'sticker')),
  svg         text        not null
                           check (svg <> '' and char_length(svg) <= 65536),
  z           int         not null default 0,
  meta        jsonb       not null default '{}',
  created_by  text        not null default 'human'
                           check (created_by in ('agent', 'human')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index decorations_date_idx
  on decorations (tenant_id, entry_date)
  where entry_date is not null;

-- ----------------------------------------------------------------------------
-- capabilities: singleton row describing this backend. The PWA and the agent
-- read it to learn the spec version and supported operations — no out-of-band
-- docs needed. Updated by migrations; never written by the app.
-- ----------------------------------------------------------------------------
create table capabilities (
  id           int         primary key check (id = 1),
  spec_version text        not null,
  operations   jsonb       not null default '[]',
  applied_at   timestamptz not null default now(),
  notes        text        not null default ''
);

-- ----------------------------------------------------------------------------
-- schema_migrations: bookkeeping. Every applied migration inserts one row.
-- Setup applies a specific spec version; upgrades are versioned migrations.
-- ----------------------------------------------------------------------------
create table schema_migrations (
  version      text        primary key,
  spec_version text        not null,
  applied_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function starlog_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger entries_updated_at
  before update on entries for each row execute function starlog_set_updated_at();
create trigger prompts_updated_at
  before update on prompts for each row execute function starlog_set_updated_at();
create trigger reminders_updated_at
  before update on reminders for each row execute function starlog_set_updated_at();
create trigger decorations_updated_at
  before update on decorations for each row execute function starlog_set_updated_at();

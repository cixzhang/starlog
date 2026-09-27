-- ============================================================================
-- Starlog migration 0001_init — v0.4.0 baseline (Stage 0)
--
-- This file is SELF-CONTAINED: apply it once, in order, to provision a fresh
-- backend. Later migrations are additive files (0002_..., 0003_...) that must
-- never rewrite history — only add tables/columns/policies and bump
-- capabilities.spec_version.
--
-- AMENDMENT NOTE (pre-release, v0.1.0 -> v0.2.0): amended to add rich entry
-- content (Markdown body, attachments, Storage bucket) BEFORE any backend
-- was ever provisioned from the v0.1.0 text.
--
-- AMENDMENT NOTE (pre-release, v0.2.0 -> v0.3.0): the attachments +
-- starlog-media Storage bucket design was replaced with a `sounds` table:
-- curated sounds are stored as compact symbolic SCORES (structured note
-- data, synthesized client-side with WebAudio at render time) — scores are
-- to ears what SVGs are to eyes. No audio files, no uploads, no Storage
-- bucket in v1. This amendment also happened BEFORE any backend was
-- provisioned from the v0.2.0 text.
--
-- AMENDMENT NOTE (pre-release, v0.3.0 -> v0.4.0): sound CUT ENTIRELY for
-- v1. The `sounds` table, the `sound:` markdown embed, and the symbolic
-- score encoding are all removed. The whole sound direction (kept audio
-- snippets, day-arrival playback, score encoding as an experiment) is
-- parked as a short README "Future: sound" note — not in this migration.
-- This amendment also happened BEFORE any backend was provisioned from
-- the v0.3.0 text.
--
-- Rewriting unapplied history is safe; once a migration has been applied
-- anywhere it is frozen and changes go in a new 0002_... file instead.
--
-- Apply via: Supabase SQL editor, or
--   psql "$DATABASE_URL" -f migrations/0001_init.sql
--
-- Sections: 1. tables/indexes  2. updated_at trigger  3. RLS + grants
--           4. seeds  5. bookkeeping
-- ============================================================================

-- ============================ 1. tables/indexes =============================
create extension if not exists pgcrypto;

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

create table capabilities (
  id           int         primary key check (id = 1),
  spec_version text        not null,
  operations   jsonb       not null default '[]',
  applied_at   timestamptz not null default now(),
  notes        text        not null default ''
);

create table schema_migrations (
  version      text        primary key,
  spec_version text        not null,
  applied_at   timestamptz not null default now()
);

-- ========================= 2. updated_at trigger =============================
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

-- ============================ 3. RLS + grants ===============================
alter table tenants            enable row level security;
alter table entries            enable row level security;
alter table prompts            enable row level security;
alter table reminders          enable row level security;
alter table decorations        enable row level security;
alter table capabilities       enable row level security;
alter table schema_migrations  enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on tenants, entries, prompts, reminders, decorations,
              capabilities, schema_migrations to anon;
grant select on tenants, entries, prompts, reminders, decorations,
              capabilities, schema_migrations to authenticated;

create policy "anon read tenants"           on tenants           for select to anon using (true);
create policy "anon read entries"           on entries           for select to anon using (true);
create policy "anon read prompts"           on prompts           for select to anon using (true);
create policy "anon read reminders"         on reminders         for select to anon using (true);
create policy "anon read decorations"       on decorations       for select to anon using (true);
create policy "anon read capabilities"      on capabilities      for select to anon using (true);
create policy "anon read schema_migrations" on schema_migrations for select to anon using (true);
-- No anon insert/update/delete policies: writes are denied by default.
-- service_role (agent vault key) bypasses RLS and performs all writes.
-- There is no sound/media table and no Storage bucket in v0.4.0, so no
-- storage.objects policies are needed at all.

-- ================================ 4. seeds ==================================
insert into tenants (slug, display_name)
values ('personal', 'My Starlog')
on conflict (slug) do nothing;

insert into capabilities (id, spec_version, operations, notes)
values (1, '0.4.0',
  ('["tenants.read","entries.read","entries.write",'
  || '"prompts.read","prompts.write","reminders.read","reminders.write",'
  || '"decorations.read","decorations.write","capabilities.read"]')::jsonb,
  'v0.4.0: rich entries (Starlog Markdown starlog-md-1, text-only), '
  || 'agent-assigned reminder importance/urgency, SVG decorations. '
  || 'Sound is cut for v1 (parked in README "Future: sound"). '
  || 'anon key: read-only. All writes via service_role (agent vault).')
on conflict (id) do update set
  spec_version = excluded.spec_version,
  operations   = excluded.operations,
  notes        = excluded.notes,
  applied_at   = now();

-- ============================ 5. bookkeeping ================================
insert into schema_migrations (version, spec_version)
values ('0001_init', '0.4.0')
on conflict (version) do nothing;

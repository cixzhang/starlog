-- ============================================================================
-- Starlog migration 0004_scores — sound as data (Phase 1 revision)
--
-- Adds the `scores` table. A score is a sound described as data (like SVG
-- describes visuals): a small JSON note list rendered client-side by the
-- PWA's felt-piano Web Audio synth. No audio files, no storage bucket.
--
-- Score JSON shape:
--   {"voice": "felt", "room": 0.58,
--    "notes": [{"n": 48, "t": 0, "d": 2.2, "v": 0.42}, ...]}
-- n = MIDI note, t = start seconds, d = duration seconds, v = velocity 0..1.
--
-- Apply after 0003_attachment_decoration.sql. Record in schema_migrations.
-- ============================================================================

create table scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  entry_id uuid not null references entries(id) on delete cascade,
  decoration_id uuid references decorations(id) on delete set null,
  title text,
  score jsonb not null,
  created_by text not null default 'agent',
  created_at timestamptz not null default now()
);

create index scores_entry_id_idx on scores(entry_id);
create index scores_tenant_id_idx on scores(tenant_id);
create index scores_decoration_id_idx on scores(decoration_id);

alter table scores enable row level security;

-- Anon can read (matches entries/prompts/reminders/decorations pattern)
create policy "anon read scores" on scores for select to anon using (true);

-- Agent full write (matches the pattern used for entries/prompts/reminders/decorations)
create policy "agent full write scores" on scores for all to anon using (true) with check (true);

-- Grants: anon/authenticated need table privileges for the RLS policies to
-- take effect (matches live grants on entries/prompts/reminders/decorations).
grant all on scores to anon, authenticated;

-- Capabilities bump: 0.5.0 -> 0.6.0 (scores supersede file-based attachments)
update capabilities
set spec_version = '0.6.0',
    operations = operations || '["scores.read", "scores.write"]'::jsonb,
    notes = notes || ' v0.6.0: scores — sounds as data (note lists rendered by the PWA synth).'
where id = 1;

-- Bookkeeping
insert into schema_migrations (version, spec_version)
values ('0004_scores', '0.6.0')
on conflict (version) do nothing;

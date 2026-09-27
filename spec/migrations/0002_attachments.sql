-- ============================================================================
-- Starlog migration 0002_attachments — sound snippets (Phase 1)
--
-- Adds the `attachments` table for audio snippets attached to journal entries.
-- Each attachment references an entry and points to an audio file in the
-- `audio-snippets` Supabase Storage bucket.
--
-- Apply after 0001_init.sql. Record in schema_migrations.
-- ============================================================================

-- Attachments: audio snippets (and future file types) linked to entries.
create table attachments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null default 'audio' check (type in ('audio')),
  storage_path text not null,
  duration_ms integer,
  mime_type text,
  created_at timestamptz not null default now()
);

create index attachments_entry_id_idx on attachments(entry_id);
create index attachments_tenant_id_idx on attachments(tenant_id);

alter table attachments enable row level security;

-- Anon can read (matches entries/prompts/reminders pattern)
create policy "anon read attachments" on attachments for select to anon using (true);

-- Agent full write (matches the pattern used for entries/prompts/reminders/decorations)
create policy "agent full write attachments" on attachments for all to anon using (true) with check (true);

-- Grants: anon/authenticated need table privileges for the RLS policies to
-- take effect (matches live grants on entries/prompts/reminders/decorations).
grant all on attachments to anon, authenticated;

-- Capabilities bump: 0.4.0 -> 0.5.0 (sound snippets were parked for v1 in 0001)
update capabilities
set spec_version = '0.5.0',
    operations = operations || '["attachments.read", "attachments.write"]'::jsonb,
    notes = notes || ' v0.5.0: audio attachments (sound snippets) on entries.'
where id = 1;

-- Bookkeeping
insert into schema_migrations (version, spec_version)
values ('0002_attachments', '0.5.0')
on conflict (version) do nothing;

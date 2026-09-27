-- ============================================================================
-- Starlog data contract — rls.sql
-- Spec version: 0.4.0 (Stage 0)
--
-- READABILITY VIEW. Apply migrations/0001_init.sql (self-contained); this file
-- is the same RLS content split for review. See tables.sql header.
--
-- v0.4.0 access model (single tenant per Supabase project):
--   * anon key (browser / PWA): READ-ONLY. Select on all tables. No
--     sound/media table and no Storage bucket exist at all, so no
--     storage.objects policies are needed.
--   * service_role key (agent, held in the secure vault, never in chat):
--     bypasses RLS; performs all writes.
-- tenant_id is on every table to preserve the future shared-tenancy path.
-- If PWA-side writes (decorations, reminders) are later approved,
-- add narrow insert/update policies for anon — a sketch is included below,
-- commented out.
-- ============================================================================

alter table tenants            enable row level security;
alter table entries            enable row level security;
alter table prompts            enable row level security;
alter table reminders          enable row level security;
alter table decorations        enable row level security;
alter table capabilities       enable row level security;
alter table schema_migrations  enable row level security;

-- ----------------------------------------------------------------------------
-- Grants. Supabase PostgREST serves the anon / authenticated / service_role
-- roles; every migration that adds a table MUST extend these grants.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select on tenants, entries, prompts, reminders, decorations,
              capabilities, schema_migrations to anon;
grant select on tenants, entries, prompts, reminders, decorations,
              capabilities, schema_migrations to authenticated;

-- ----------------------------------------------------------------------------
-- anon: read-only across the whole contract. No insert/update/delete policy
-- for anon exists, so writes are denied by default (PostgREST: 401/42501).
-- ----------------------------------------------------------------------------
create policy "anon read tenants"
  on tenants for select to anon using (true);

create policy "anon read entries"
  on entries for select to anon using (true);

create policy "anon read prompts"
  on prompts for select to anon using (true);

create policy "anon read reminders"
  on reminders for select to anon using (true);

create policy "anon read decorations"
  on decorations for select to anon using (true);

create policy "anon read capabilities"
  on capabilities for select to anon using (true);

create policy "anon read schema_migrations"
  on schema_migrations for select to anon using (true);

-- service_role bypasses RLS entirely (Supabase default); no policies needed.
-- All agent writes use the service_role key from the secure vault.

-- ----------------------------------------------------------------------------
-- PARKED: narrow anon write policies, for use only if PWA-side writes are
-- approved (open decision: which PWA actions are writable beyond reading).
-- Example — allow the PWA to insert decorations, never to touch entries:
--
--   create policy "anon insert decorations"
--     on decorations for insert to anon with check (true);
--   create policy "anon update own decorations"
--     on decorations for update to anon
--     using (true) with check (true);
--
-- Keep these commented until the writability decision is made. Even then,
-- entries and prompts stay agent-written: the extraction pipeline owns them.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- PARKED: shared-tenancy future. If Starlog ever becomes multi-tenant in one
-- project, replace the `using (true)` clauses with tenant isolation, e.g.:
--
--   create policy "tenant isolation"
--     on entries for all to authenticated
--     using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
--     with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
--
-- tenant_id on every table exists so this migration is possible without
-- reshaping data.
-- ----------------------------------------------------------------------------

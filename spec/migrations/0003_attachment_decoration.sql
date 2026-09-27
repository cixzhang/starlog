-- ============================================================================
-- Starlog migration 0003_attachment_decoration — link sounds to visuals
--
-- Adds an optional `decoration_id` on attachments so an audio snippet can be
-- paired with an animated SVG decoration. When set, playing the snippet
-- drives the linked decoration's animation (the PWA syncs them at playback).
--
-- Additive only: existing rows are untouched (column is nullable).
-- Apply after 0002_attachments.sql. Record in schema_migrations.
-- ============================================================================

alter table attachments
  add column decoration_id uuid references decorations(id) on delete set null;

create index attachments_decoration_id_idx on attachments(decoration_id);

-- Bookkeeping (spec stays 0.5.0: no new operations, additive column only)
insert into schema_migrations (version, spec_version)
values ('0003_attachment_decoration', '0.5.0')
on conflict (version) do nothing;

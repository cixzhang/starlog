-- 0005: multi-day reminders via nullable end_at.
-- Backwards compatible: existing rows get NULL, which the PWA treats as
-- "single instant" (identical to pre-0005 behavior). Old app builds ignore
-- the column; new builds work with or without it (fetch falls back).

alter table reminders add column end_at timestamptz;

-- A span must not end before it starts (null end_at = no span).
alter table reminders
  add constraint reminders_end_at_after_start
  check (end_at is null or end_at >= remind_at);

-- Capabilities bump: 0.6.0 -> 0.7.0 (multi-day reminder spans)
update capabilities
set spec_version = '0.7.0',
    operations = operations || '["reminders.span"]'::jsonb,
    notes = notes || ' v0.7.0: reminders — end_at for multi-day spans (nullable; null = single instant).'
where id = 1;

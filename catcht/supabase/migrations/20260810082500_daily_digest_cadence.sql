-- Run one report per calendar day while leaving enough scheduler-jitter tolerance
-- to avoid accidentally skipping every other day.

alter table catcht.user_profiles
  alter column digest_cadence_hours set default 23;

update catcht.user_profiles
set digest_cadence_hours = 23,
    updated_at = now()
where digest_cadence_hours is distinct from 23;

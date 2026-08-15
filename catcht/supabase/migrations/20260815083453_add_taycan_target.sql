-- Give every owner already tracking the Audi e-tron GT the closely related Porsche Taycan target
-- without embedding profile identities or private search locations in the public migration.
insert into catcht.saved_searches (
  owner_id, name, offer_kind, make, model, trim, zip, radius_miles, region, transmission,
  max_price, max_mileage, max_effective_monthly, max_due_at_signing, min_annual_miles,
  source_ids, active, profile, garage_group, powertrain_category, year_min, year_max,
  target_price, aliases, trim_aliases, desired_features, required_features, rationale, priority
)
select
  owner_id,
  'Porsche Taycan',
  offer_kind,
  'Porsche',
  'Taycan',
  null,
  zip,
  radius_miles,
  region,
  transmission,
  max_price,
  max_mileage,
  max_effective_monthly,
  max_due_at_signing,
  min_annual_miles,
  '{}'::jsonb,
  active,
  profile,
  garage_group,
  powertrain_category,
  year_min,
  year_max,
  target_price,
  '{}',
  '{}',
  array['adaptive_cruise_lane_centering','rear_axle_steering','air_suspension','surround_view'],
  '{}',
  'The e-tron GT platform twin with a sharper chassis; rear-seat fit, battery history, and expensive options need scrutiny.',
  priority
from catcht.saved_searches
where lower(name) = 'audi e-tron gt'
  and offer_kind = 'used'
on conflict do nothing;

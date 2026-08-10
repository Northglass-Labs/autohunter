-- Add explainable family-vehicle search intent and listing intelligence without changing existing
-- Mookmobile identities, decisions, tokens, or digest history.

alter table catcht.saved_searches
  add column profile text not null default 'general'
    check (profile in ('enthusiast', 'family_ev', 'family_gas', 'lease', 'general')),
  add column garage_group text not null default 'other'
    check (garage_group in ('ev', 'gas', 'lease', 'enthusiast', 'other')),
  add column powertrain_category text not null default 'any'
    check (powertrain_category in ('ev', 'gas', 'phev', 'hybrid', 'any')),
  add column year_min integer check (year_min is null or year_min between 1980 and 2100),
  add column year_max integer check (year_max is null or year_max between 1980 and 2100),
  add column target_price integer check (target_price is null or target_price between 1 and 10000000),
  add column aliases text[] not null default '{}',
  add column trim_aliases text[] not null default '{}',
  add column desired_features text[] not null default '{}'
    check (desired_features <@ array[
      'hands_free_highway', 'adaptive_cruise_lane_centering', 'rear_axle_steering',
      'air_suspension', 'third_row', 'surround_view', 'tow_package'
    ]::text[]),
  add column required_features text[] not null default '{}'
    check (required_features <@ array[
      'hands_free_highway', 'adaptive_cruise_lane_centering', 'rear_axle_steering',
      'air_suspension', 'third_row', 'surround_view', 'tow_package'
    ]::text[]),
  add column rationale text check (rationale is null or length(btrim(rationale)) between 1 and 500),
  add column priority integer not null default 50 check (priority between 0 and 100),
  add constraint saved_searches_year_range_check
    check (year_min is null or year_max is null or year_min <= year_max),
  add constraint saved_searches_target_within_cap_check
    check (target_price is null or max_price is null or target_price <= max_price);

alter table catcht.listings
  add column garage_group text not null default 'other'
    check (garage_group in ('ev', 'gas', 'lease', 'enthusiast', 'other')),
  add column powertrain_category text not null default 'any'
    check (powertrain_category in ('ev', 'gas', 'phev', 'hybrid', 'any')),
  add column body_style text,
  add column seating_capacity integer check (seating_capacity is null or seating_capacity between 2 and 15),
  add column package_names text[] not null default '{}',
  add column feature_evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(feature_evidence) = 'array'),
  add column feature_match_score numeric(5,2) not null default 0
    check (feature_match_score between 0 and 100),
  add column family_fit_score numeric(5,2) not null default 0
    check (family_fit_score between 0 and 100),
  add column days_on_market integer check (days_on_market is null or days_on_market between 0 and 10000),
  add column price_change integer check (price_change is null or price_change between -10000000 and 10000000),
  add column one_owner boolean,
  add column clean_title boolean,
  add column exterior_color text,
  add column interior_color text,
  add column enrichment_status text not null default 'not_requested'
    check (enrichment_status in ('not_requested', 'enriched', 'budget_deferred', 'unavailable', 'failed'));

update catcht.saved_searches
set profile = 'enthusiast', garage_group = 'enthusiast', priority = 25,
    aliases = coalesce(models.aliases, '{}')
from catcht.watch_models models
where catcht.saved_searches.legacy_watch_model_id = models.id;

insert into catcht.saved_searches (
  name, offer_kind, make, model, trim, zip, radius_miles, transmission, max_price,
  max_mileage, profile, garage_group, powertrain_category, year_min, year_max,
  target_price, aliases, trim_aliases, desired_features, required_features, rationale, priority
) values
  ('EQS 450+ sedan', 'used', 'Mercedes-Benz', 'EQS', 'EQS 450+', '10001', 250, 'automatic', 70000, 80000, 'family_ev', 'ev', 'ev', 2022, 2025, 48000, array['EQS Sedan'], '{}', array['adaptive_cruise_lane_centering','rear_axle_steering','air_suspension','surround_view'], '{}', 'Huge depreciation, long-range comfort, and unusually useful rear-seat space.', 82),
  ('EQS 580 sedan', 'used', 'Mercedes-Benz', 'EQS', 'EQS 580 4MATIC', '10001', 250, 'automatic', 70000, 80000, 'family_ev', 'ev', 'ev', 2022, 2025, 55000, array['EQS Sedan'], array['EQS 580'], array['adaptive_cruise_lane_centering','rear_axle_steering','air_suspension','surround_view'], '{}', 'Dream-adjacent luxury and performance after severe first-owner depreciation.', 88),
  ('EQS 450+ SUV', 'used', 'Mercedes-Benz', 'EQS SUV', 'EQS 450+', '10001', 250, 'automatic', 70000, 80000, 'family_ev', 'ev', 'ev', 2023, 2025, 58000, array['EQS450+ SUV'], '{}', array['adaptive_cruise_lane_centering','rear_axle_steering','air_suspension','third_row','surround_view'], '{}', 'EQS comfort with the family-friendly cargo opening and optional third row.', 94),
  ('EQS 580 SUV', 'used', 'Mercedes-Benz', 'EQS SUV', 'EQS 580 4MATIC', '10001', 250, 'automatic', 70000, 80000, 'family_ev', 'ev', 'ev', 2023, 2025, 62000, array['EQS580 SUV'], array['EQS 580'], array['adaptive_cruise_lane_centering','rear_axle_steering','air_suspension','third_row','surround_view'], '{}', 'Fast, quiet family EV with strong packaging if depreciation brings it below the cap.', 98),
  ('Rivian R1S', 'used', 'Rivian', 'R1S', null, '10001', 250, 'automatic', 70000, 80000, 'family_ev', 'ev', 'ev', 2022, 2025, 62000, '{}', '{}', array['hands_free_highway','adaptive_cruise_lane_centering','third_row','surround_view','tow_package'], '{}', 'Three rows, excellent cargo utility, performance, and Gen 2 autonomy upside.', 100),
  ('Audi e-tron GT', 'used', 'Audi', 'e-tron GT', null, '10001', 250, 'automatic', 70000, 80000, 'family_ev', 'ev', 'ev', 2022, 2025, 50000, array['e tron GT'], '{}', array['adaptive_cruise_lane_centering','rear_axle_steering','air_suspension','surround_view'], '{}', 'The most sports-car-like target; rear-seat and car-seat fit need extra scrutiny.', 78),
  ('Audi Q8 e-tron', 'used', 'Audi', 'Q8 e-tron', null, '10001', 250, 'automatic', 70000, 80000, 'family_ev', 'ev', 'ev', 2022, 2025, 48000, array['e-tron','e tron SUV'], '{}', array['adaptive_cruise_lane_centering','air_suspension','surround_view','tow_package'], '{}', 'Quiet, conventional-feeling luxury EV with a practical two-row body.', 84),
  ('BMW iX xDrive50', 'used', 'BMW', 'iX', 'xDrive50', '10001', 250, 'automatic', 70000, 80000, 'family_ev', 'ev', 'ev', 2022, 2025, 52000, '{}', '{}', array['hands_free_highway','adaptive_cruise_lane_centering','rear_axle_steering','air_suspension','surround_view'], '{}', 'Excellent range, chassis, rear seat, and available Highway Assistant.', 92),
  ('Cadillac LYRIQ', 'used', 'Cadillac', 'LYRIQ', null, '10001', 250, 'automatic', 70000, 80000, 'family_ev', 'ev', 'ev', 2023, 2025, 48000, '{}', '{}', array['hands_free_highway','adaptive_cruise_lane_centering','surround_view'], '{}', 'Super Cruise can deliver the strongest automated-highway feel if explicitly equipped.', 86),
  ('X5 xDrive40i', 'used', 'BMW', 'X5', 'xDrive40i', '10001', 250, 'automatic', 70000, 80000, 'family_gas', 'gas', 'gas', 2024, 2026, 57000, '{}', '{}', array['hands_free_highway','adaptive_cruise_lane_centering','rear_axle_steering','surround_view','tow_package'], '{}', 'Best all-around powertrain and chassis; prioritize Driving Assistance Professional.', 98),
  ('X5 M60i', 'used', 'BMW', 'X5', 'M60i', '10001', 250, 'automatic', 70000, 80000, 'family_gas', 'gas', 'gas', 2024, 2026, 66000, '{}', '{}', array['hands_free_highway','adaptive_cruise_lane_centering','rear_axle_steering','surround_view','tow_package'], '{}', 'The fun X5 choice; standard rear steering plus the right highway-assistance package is ideal.', 100),
  ('2020 X5 M50i', 'used', 'BMW', 'X5', 'M50i', '10001', 250, 'automatic', 70000, 80000, 'family_gas', 'gas', 'gas', 2020, 2020, 43000, '{}', '{}', array['adaptive_cruise_lane_centering','rear_axle_steering','surround_view','tow_package'], '{}', 'High-depreciation V8 option; target ZDH or 2VH and ZDY explicitly.', 80),
  ('X7 xDrive40i', 'used', 'BMW', 'X7', 'xDrive40i', '10001', 250, 'automatic', 70000, 80000, 'family_gas', 'gas', 'gas', 2023, 2026, 62000, '{}', '{}', array['hands_free_highway','adaptive_cruise_lane_centering','rear_axle_steering','air_suspension','third_row','surround_view'], '{}', 'True third-row practicality with available rear steering and Highway Assistant.', 94),
  ('X7 M60i', 'used', 'BMW', 'X7', 'M60i', '10001', 250, 'automatic', 70000, 80000, 'family_gas', 'gas', 'gas', 2023, 2025, 68000, '{}', '{}', array['hands_free_highway','adaptive_cruise_lane_centering','rear_axle_steering','air_suspension','third_row','surround_view'], '{}', 'A larger, wilder alternative to the X5 M60i if one depreciates under the ceiling.', 96),
  ('Genesis GV80 3.5T', 'used', 'Genesis', 'GV80', '3.5T', '10001', 250, 'automatic', 70000, 80000, 'family_gas', 'gas', 'gas', 2022, 2025, 52000, '{}', '{}', array['adaptive_cruise_lane_centering','third_row','surround_view'], '{}', 'Strong luxury value and HDA II availability with lower old-German-V8 risk.', 82),
  ('Acura MDX Type S', 'used', 'Acura', 'MDX', 'Type S', '10001', 250, 'automatic', 70000, 80000, 'family_gas', 'gas', 'gas', 2022, 2025, 50000, '{}', '{}', array['adaptive_cruise_lane_centering','air_suspension','third_row','surround_view'], '{}', 'Three-row utility, SH-AWD handling, and a more conservative ownership bet.', 88),
  ('Audi SQ7', 'used', 'Audi', 'SQ7', null, '10001', 250, 'automatic', 70000, 80000, 'family_gas', 'gas', 'gas', 2021, 2025, 58000, '{}', '{}', array['adaptive_cruise_lane_centering','rear_axle_steering','air_suspension','third_row','surround_view'], '{}', 'RS6-adjacent V8 energy in a three-row family shape; ownership costs need weighting.', 90),
  ('Porsche Cayenne S', 'used', 'Porsche', 'Cayenne', 'S', '10001', 250, 'automatic', 70000, 80000, 'family_gas', 'gas', 'gas', 2020, 2025, 58000, '{}', '{}', array['adaptive_cruise_lane_centering','rear_axle_steering','air_suspension','surround_view'], '{}', 'Best steering and chassis candidate; options must be decoded individually.', 84),
  ('Volvo XC90 Recharge', 'used', 'Volvo', 'XC90', 'Recharge', '10001', 250, 'automatic', 70000, 80000, 'family_gas', 'gas', 'phev', 2022, 2025, 53000, array['XC90 T8'], '{}', array['adaptive_cruise_lane_centering','air_suspension','third_row','surround_view'], '{}', 'Excellent family packaging and safety with useful electric commuting range.', 88),
  ('Mercedes GLS 450', 'used', 'Mercedes-Benz', 'GLS', 'GLS 450', '10001', 250, 'automatic', 70000, 80000, 'family_gas', 'gas', 'gas', 2021, 2025, 58000, '{}', '{}', array['adaptive_cruise_lane_centering','rear_axle_steering','air_suspension','third_row','surround_view'], '{}', 'Large-family comfort and highway composure; packages and upkeep decide the value.', 86),
  ('Cadillac Escalade Super Cruise', 'used', 'Cadillac', 'Escalade', null, '10001', 250, 'automatic', 70000, 80000, 'family_gas', 'gas', 'gas', 2021, 2025, 65000, '{}', '{}', array['hands_free_highway','adaptive_cruise_lane_centering','air_suspension','third_row','surround_view','tow_package'], '{}', 'Maximum family space and Super Cruise potential if the exact vehicle is equipped.', 85)
on conflict do nothing;

insert into catcht.saved_searches (
  name, offer_kind, make, model, trim, region, transmission,
  max_effective_monthly, max_due_at_signing, min_annual_miles,
  profile, garage_group, powertrain_category, year_min, year_max,
  aliases, desired_features, required_features, rationale, priority
) values
  ('Member Lexus TX lease', 'lease', 'Lexus', 'TX', null, 'Northeast', 'any', 750, 4000, 10000, 'lease', 'lease', 'any', 2025, 2027, array['TX 350','TX 500h'], array['adaptive_cruise_lane_centering','third_row','surround_view'], '{}', 'Three-row replacement candidate for Member with strong family packaging.', 95),
  ('Member Grand Highlander lease', 'lease', 'Toyota', 'Grand Highlander', null, 'Northeast', 'any', 750, 4000, 10000, 'lease', 'lease', 'any', 2025, 2027, array['Grand Highlander Hybrid'], array['adaptive_cruise_lane_centering','third_row','surround_view'], '{}', 'High-value three-row hybrid family target.', 92),
  ('Member XC90 lease', 'lease', 'Volvo', 'XC90', null, 'Northeast', 'any', 750, 4000, 10000, 'lease', 'lease', 'any', 2025, 2027, array['XC90 Recharge'], array['adaptive_cruise_lane_centering','third_row','surround_view'], '{}', 'Safe and polished three-row family lease target.', 88),
  ('Member Aviator lease', 'lease', 'Lincoln', 'Aviator', null, 'Northeast', 'any', 750, 4000, 10000, 'lease', 'lease', 'gas', 2025, 2027, '{}', array['hands_free_highway','adaptive_cruise_lane_centering','third_row','surround_view'], '{}', 'Comfortable three-row option when incentives overcome depreciation.', 82),
  ('Member CX-90 lease', 'lease', 'Mazda', 'CX-90', null, 'Northeast', 'any', 750, 4000, 10000, 'lease', 'lease', 'any', 2025, 2027, array['CX90'], array['adaptive_cruise_lane_centering','third_row','surround_view'], '{}', 'Driver-focused three-row value alternative.', 84),
  ('Member Telluride lease', 'lease', 'Kia', 'Telluride', null, 'Northeast', 'any', 750, 4000, 10000, 'lease', 'lease', 'gas', 2025, 2027, '{}', array['adaptive_cruise_lane_centering','third_row','surround_view'], '{}', 'Well-packaged mainstream three-row benchmark.', 78),
  ('Member Palisade lease', 'lease', 'Hyundai', 'Palisade', null, 'Northeast', 'any', 750, 4000, 10000, 'lease', 'lease', 'gas', 2025, 2027, '{}', array['adaptive_cruise_lane_centering','third_row','surround_view'], '{}', 'Comfortable mainstream three-row benchmark.', 78)
on conflict do nothing;

update catcht.listings listings
set garage_group = searches.garage_group,
    powertrain_category = searches.powertrain_category
from catcht.saved_searches searches
where listings.search_id = searches.id;

create index listings_family_queue_idx
  on catcht.listings (garage_group, disposition, eligibility_reason,
    family_fit_score desc, feature_match_score desc, deal_score desc, last_seen_at desc);
create index saved_searches_collection_group_idx
  on catcht.saved_searches (active, offer_kind, make, zip, transmission, priority desc);

-- The server role needs no destructive access for routine collection or queue operations.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mookmobile_app') then
    revoke delete on catcht.saved_searches, catcht.source_runs from mookmobile_app;
  end if;
  if exists (select 1 from pg_roles where rolname = 'catcht_app') then
    revoke delete on catcht.saved_searches, catcht.source_runs from catcht_app;
  end if;
end
$$;

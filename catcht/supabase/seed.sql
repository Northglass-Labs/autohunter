-- Deterministic local-only fixtures for database integration and browser E2E tests.
update catcht.user_profiles
set email = 'admin@example.test', display_name = 'Admin', updated_at = now()
where role = 'admin';

insert into catcht.user_profiles (
  id, email, display_name, role, active, digest_enabled
) values (
  '22222222-2222-4222-8222-222222222222',
  'member@example.test',
  'Member',
  'member',
  true,
  true
) on conflict (id) do nothing;

insert into catcht.saved_searches (
  id, owner_id, name, offer_kind, make, model, trim, zip, radius_miles, transmission,
  max_price, max_mileage, profile, garage_group, powertrain_category, year_min, year_max,
  target_price, desired_features, rationale, priority
) values (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  'Member X5 family', 'used', 'BMW', 'X5', 'xDrive40i', '10001', 100, 'automatic',
  65000, 65000, 'family_gas', 'gas', 'gas', 2024, 2026, 57000,
  array['hands_free_highway', 'adaptive_cruise_lane_centering', 'surround_view'],
  'A comfortable family SUV with useful highway assistance.', 90
), (
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'Member Lexus TX', 'used', 'Lexus', 'TX', 'TX 350', '10001', 100, 'automatic',
  65000, 65000, 'family_gas', 'gas', 'gas', 2024, 2026, 56000,
  array['adaptive_cruise_lane_centering', 'third_row', 'surround_view'],
  'A practical three-row family benchmark.', 88
) on conflict (id) do nothing;

insert into catcht.listings (
  id, identity_key, source, source_listing_id, search_id, url, vin, year, make, model, trim,
  title, price, mileage, distance_miles, location, image_urls, primary_image_url,
  manual_verified, verification_status, manual_confidence, deal_score, eligibility_reason,
  offer_kind, vehicle_condition, garage_group, powertrain_category, body_style, seating_capacity,
  package_names, feature_evidence, feature_match_score, family_fit_score, enrichment_status
) values (
  '55555555-5555-4555-8555-555555555555',
  'e2e:bmw-x5', 'marketcheck', 'e2e-bmw-x5',
  (select id from catcht.saved_searches where name = 'X5 xDrive40i' limit 1),
  'https://dealer.example/bmw-x5', '5UX23EU05R9000001', 2024, 'BMW', 'X5', 'xDrive40i',
  '2024 BMW X5 xDrive40i', 57900, 18200, 36, 'Princeton, NJ',
  array['https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80'], 'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80',
  false, 'not_applicable', 0, 91, 'eligible', 'used', 'used', 'gas', 'gas', 'SUV', 5,
  array['Driving Assistance Professional Package', 'Parking Assistance Package'],
  '[{"key":"hands_free_highway","label":"Hands-free highway driving","status":"confirmed","source":"provider_listing","evidence":"Driving Assistance Professional Package"},{"key":"surround_view","label":"Surround-view camera","status":"confirmed","source":"provider_listing","evidence":"Parking Assistance Package"}]'::jsonb,
  94, 91, 'enriched'
), (
  '66666666-6666-4666-8666-666666666666',
  'e2e:lexus-tx', 'marketcheck', 'e2e-lexus-tx', '44444444-4444-4444-8444-444444444444',
  'https://dealer.example/lexus-tx', '5TDAAAB60RS000001', 2024, 'Lexus', 'TX', 'TX 350',
  '2024 Lexus TX 350 Premium', 54800, 14100, 42, 'Cherry Hill, NJ',
  array['https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80'], 'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80',
  false, 'not_applicable', 0, 87, 'eligible', 'used', 'used', 'gas', 'gas', 'SUV', 7,
  array['Premium Package'],
  '[{"key":"third_row","label":"Third row","status":"confirmed","source":"provider_listing","evidence":"7-passenger seating"}]'::jsonb,
  86, 95, 'enriched'
) on conflict (id) do nothing;

insert into catcht.listing_matches (
  listing_id, search_id, deal_score, verification_status, eligibility_reason,
  feature_match_score, family_fit_score
)
select '55555555-5555-4555-8555-555555555555', id, 91, 'not_applicable', 'eligible', 94, 91
from catcht.saved_searches where name = 'X5 xDrive40i'
on conflict (listing_id, search_id) do nothing;

insert into catcht.digest_runs (
  id, user_id, scheduled_for, status, provider_message_id, listing_count, finished_at
) values (
  '77777777-7777-4777-8777-777777777777',
  (select id from catcht.user_profiles where role = 'admin' limit 1),
  '2026-08-09', 'sent', 'e2e-admin-report', 1, '2026-08-09T12:00:00Z'
), (
  '88888888-8888-4888-8888-888888888888',
  '22222222-2222-4222-8222-222222222222',
  '2026-08-08', 'sent', 'e2e-member-report', 1, '2026-08-08T12:00:00Z'
) on conflict (id) do nothing;

insert into catcht.digest_items (
  digest_run_id, listing_id, emailed_price, emailed_effective_monthly
) values (
  '77777777-7777-4777-8777-777777777777',
  '55555555-5555-4555-8555-555555555555', 57900, null
), (
  '88888888-8888-4888-8888-888888888888',
  '66666666-6666-4666-8666-666666666666', 54800, null
) on conflict (digest_run_id, listing_id) do nothing;

insert into catcht.listing_matches (
  listing_id, search_id, deal_score, verification_status, eligibility_reason,
  feature_match_score, family_fit_score
) values
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', 89, 'not_applicable', 'eligible', 94, 91),
  ('66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444444', 87, 'not_applicable', 'eligible', 86, 95)
on conflict (listing_id, search_id) do nothing;

create schema if not exists mookmobile;

create table mookmobile.watch_models (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  aliases text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (make, model)
);

create table mookmobile.listings (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique,
  source text not null,
  source_listing_id text,
  url text not null,
  vin text,
  year integer not null check (year between 1980 and 2100),
  make text not null,
  model text not null,
  trim text,
  title text not null,
  price integer not null check (price >= 0),
  mileage integer not null check (mileage >= 0),
  distance_miles numeric(7,2) not null check (distance_miles >= 0),
  location text not null,
  transmission_claim text,
  image_urls text[] not null default '{}',
  primary_image_url text,
  market_estimate integer,
  manual_verified boolean not null default false,
  manual_confidence numeric(4,3) not null default 0,
  deal_score numeric(6,2) not null default 0,
  eligibility_reason text not null default 'manual_photo_unverified',
  disposition text not null default 'neutral'
    check (disposition in ('neutral', 'interested', 'ignored')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_emailed_at timestamptz,
  last_emailed_price integer,
  source_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listings_dashboard_idx
  on mookmobile.listings (disposition, manual_verified, deal_score desc, last_seen_at desc);
create index listings_vin_idx on mookmobile.listings (vin) where vin is not null;

create table mookmobile.manual_evidence (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references mookmobile.listings(id) on delete cascade,
  image_url text not null,
  shift_pattern_visible boolean not null,
  manual_lever_visible boolean not null,
  stock_style_shifter boolean not null,
  matching_interior_likely boolean not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  observed_pattern text,
  notes text not null,
  verifier_model text not null,
  raw_result jsonb not null default '{}',
  verified_at timestamptz not null default now(),
  unique (listing_id, image_url)
);

create table mookmobile.digest_runs (
  id uuid primary key default gen_random_uuid(),
  scheduled_for date not null unique,
  status text not null check (status in ('started', 'sent', 'empty', 'failed')),
  provider_message_id text,
  listing_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table mookmobile.digest_items (
  digest_run_id uuid not null references mookmobile.digest_runs(id) on delete cascade,
  listing_id uuid not null references mookmobile.listings(id) on delete cascade,
  emailed_price integer not null,
  primary key (digest_run_id, listing_id)
);

insert into mookmobile.watch_models (make, model, aliases) values
  ('Mazda', 'MX-5 Miata', array['Miata', 'MX-5']),
  ('Subaru', 'BRZ', array['BRZ']),
  ('Scion', 'FR-S', array['FRS', 'FR-S']),
  ('Honda', 'Civic Si', array['Civic SI', 'Civic Si'])
on conflict (make, model) do nothing;

-- The app connects directly with a server-only database URL. Keep this schema out of the
-- Supabase Data API and revoke accidental access from browser-facing roles.
revoke all on schema mookmobile from public, anon, authenticated;
revoke all on all tables in schema mookmobile from public, anon, authenticated;
alter default privileges in schema mookmobile revoke all on tables from public, anon, authenticated;
alter default privileges in schema mookmobile revoke all on sequences from public, anon, authenticated;

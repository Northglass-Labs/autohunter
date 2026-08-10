-- Expand the original used-listing store into a backwards-compatible vehicle-offer store.
-- The internal table name remains `listings` so existing Mookmobile IDs, FKs, and magic links stay valid.

create table catcht.saved_searches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  offer_kind text not null check (offer_kind in ('used', 'new', 'lease')),
  make text not null check (length(btrim(make)) between 1 and 100),
  model text not null check (length(btrim(model)) between 1 and 150),
  trim text check (trim is null or length(btrim(trim)) between 1 and 150),
  zip text check (zip is null or zip ~ '^[0-9]{5}$'),
  radius_miles integer check (radius_miles is null or radius_miles between 1 and 500),
  region text check (region is null or length(btrim(region)) between 1 and 150),
  transmission text not null default 'any'
    check (transmission in ('any', 'manual', 'automatic')),
  max_price integer check (max_price is null or max_price between 1 and 10000000),
  max_mileage integer check (max_mileage is null or max_mileage between 0 and 10000000),
  max_effective_monthly integer
    check (max_effective_monthly is null or max_effective_monthly between 1 and 100000),
  max_due_at_signing integer
    check (max_due_at_signing is null or max_due_at_signing between 0 and 1000000),
  min_annual_miles integer
    check (min_annual_miles is null or min_annual_miles between 1000 and 100000),
  source_ids jsonb not null default '{}',
  legacy_watch_model_id uuid unique references catcht.watch_models(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (offer_kind in ('used', 'new') and zip is not null and radius_miles is not null)
    or (offer_kind = 'lease' and region is not null)
  )
);

create unique index saved_searches_name_idx
  on catcht.saved_searches (lower(name));

insert into catcht.watch_models (make, model, aliases) values
  ('Porsche', '944', array['944', 'Porsche 944']),
  ('Porsche', '944 Turbo', array['944 Turbo', 'Porsche 944 Turbo', '951'])
on conflict (make, model) do update set aliases = excluded.aliases, active = true;

insert into catcht.saved_searches (
  name, offer_kind, make, model, zip, radius_miles, transmission,
  max_price, max_mileage, legacy_watch_model_id
)
select
  make || ' ' || model,
  'used',
  make,
  model,
  '10001',
  150,
  'manual',
  15000,
  120000,
  id
from catcht.watch_models
where active
on conflict (legacy_watch_model_id) do nothing;

alter table catcht.listings
  alter column year drop not null,
  alter column price drop not null,
  alter column mileage drop not null,
  alter column distance_miles drop not null,
  add column offer_kind text not null default 'used'
    check (offer_kind in ('used', 'new', 'lease')),
  add column vehicle_condition text not null default 'used'
    check (vehicle_condition in ('used', 'new', 'cpo', 'unknown')),
  add column origin_source text,
  add column search_id uuid references catcht.saved_searches(id) on delete set null,
  add column seller_name text,
  add column currency text not null default 'USD'
    check (currency ~ '^[A-Z]{3}$'),
  add column monthly_payment integer
    check (monthly_payment is null or monthly_payment between 1 and 100000),
  add column due_at_signing integer
    check (due_at_signing is null or due_at_signing between 0 and 1000000),
  add column term_months integer
    check (term_months is null or term_months between 1 and 120),
  add column annual_miles integer
    check (annual_miles is null or annual_miles between 1 and 100000),
  add column broker_fee integer
    check (broker_fee is null or broker_fee between 0 and 100000),
  add column acquisition_fee integer
    check (acquisition_fee is null or acquisition_fee between 0 and 100000),
  add column disposition_fee integer
    check (disposition_fee is null or disposition_fee between 0 and 100000),
  add column msrp integer
    check (msrp is null or msrp between 1 and 10000000),
  add column money_factor numeric(8,6)
    check (money_factor is null or money_factor between 0 and 1),
  add column residual_percent numeric(6,3)
    check (residual_percent is null or residual_percent between 0 and 100),
  add column discount_percent numeric(6,3)
    check (discount_percent is null or discount_percent between -100 and 100),
  add column taxes_included boolean,
  add column effective_monthly numeric(10,2)
    check (effective_monthly is null or effective_monthly between 0.01 and 100000),
  add column region text,
  add column parse_confidence numeric(4,3) not null default 1
    check (parse_confidence between 0 and 1),
  add column published_at timestamptz,
  add column expires_at timestamptz,
  add column last_emailed_effective_monthly numeric(10,2)
    check (last_emailed_effective_monthly is null or last_emailed_effective_monthly > 0);

alter table catcht.listings drop constraint listings_verification_status_check;
alter table catcht.listings add constraint listings_verification_status_check
  check (verification_status in ('verified', 'pending', 'unverified', 'not_applicable'));

create index listings_offer_dashboard_idx
  on catcht.listings (offer_kind, disposition, eligibility_reason, deal_score desc, last_seen_at desc);
create index listings_saved_search_idx
  on catcht.listings (search_id, last_seen_at desc) where search_id is not null;
create index saved_searches_active_idx
  on catcht.saved_searches (active, offer_kind, make, model);

alter table catcht.digest_items alter column emailed_price drop not null;
alter table catcht.digest_items add column emailed_effective_monthly numeric(10,2)
  check (emailed_effective_monthly is null or emailed_effective_monthly > 0);

create table catcht.source_runs (
  id uuid primary key default gen_random_uuid(),
  adapter text not null check (length(btrim(adapter)) between 1 and 100),
  source text not null check (length(btrim(source)) between 1 and 100),
  status text not null check (status in ('success', 'empty', 'unavailable', 'challenged', 'failed')),
  message_code text check (message_code is null or length(message_code) between 1 and 100),
  searched_count integer not null default 0 check (searched_count >= 0),
  discovered_count integer not null default 0 check (discovered_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (finished_at >= started_at)
);

create index source_runs_latest_idx on catcht.source_runs (source, finished_at desc);

revoke all on catcht.saved_searches, catcht.source_runs from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'catcht_app') then
    grant select, insert, update on catcht.saved_searches to catcht_app;
    grant select, insert on catcht.source_runs to catcht_app;
  end if;
end
$$;

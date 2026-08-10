-- Normalize the single-recipient installation into an invite-only multi-user platform without
-- duplicating canonical listing or evidence rows.

create table catcht.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text,
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  role text not null default 'member' check (role in ('admin', 'member')),
  active boolean not null default true,
  digest_enabled boolean not null default true,
  digest_cadence_hours integer not null default 23 check (digest_cadence_hours between 12 and 720),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    email is null
    or (
      email = lower(btrim(email))
      and length(email) between 3 and 320
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  )
);

create unique index user_profiles_email_idx
  on catcht.user_profiles (lower(email))
  where email is not null;
create index user_profiles_auth_idx
  on catcht.user_profiles (auth_user_id)
  where auth_user_id is not null and active;

insert into catcht.user_profiles (display_name, role)
values ('Legacy owner', 'admin');

alter table catcht.saved_searches
  add column owner_id uuid references catcht.user_profiles(id) on delete cascade;

update catcht.saved_searches
set owner_id = (select id from catcht.user_profiles where role = 'admin' order by created_at limit 1)
where owner_id is null;

alter table catcht.saved_searches alter column owner_id set not null;
drop index if exists catcht.saved_searches_name_idx;
create unique index saved_searches_owner_name_idx
  on catcht.saved_searches (owner_id, lower(name));
create index saved_searches_owner_active_idx
  on catcht.saved_searches (owner_id, active, garage_group, offer_kind);

create table catcht.listing_matches (
  listing_id uuid not null references catcht.listings(id) on delete cascade,
  search_id uuid not null references catcht.saved_searches(id) on delete cascade,
  deal_score numeric(6,2) not null default 0,
  manual_confidence numeric(4,3) not null default 0 check (manual_confidence between 0 and 1),
  verification_status text not null default 'not_applicable'
    check (verification_status in ('verified', 'pending', 'unverified', 'not_applicable')),
  eligibility_reason text not null default 'search_mismatch',
  feature_match_score numeric(5,2) not null default 0 check (feature_match_score between 0 and 100),
  family_fit_score numeric(5,2) not null default 0 check (family_fit_score between 0 and 100),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_emailed_at timestamptz,
  last_emailed_price integer,
  last_emailed_effective_monthly numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (listing_id, search_id)
);

create index listing_matches_search_queue_idx
  on catcht.listing_matches (search_id, last_seen_at desc, deal_score desc);
create index listing_matches_listing_idx on catcht.listing_matches (listing_id);

insert into catcht.listing_matches (
  listing_id, search_id, deal_score, manual_confidence, verification_status,
  eligibility_reason, feature_match_score, family_fit_score, first_seen_at, last_seen_at,
  last_emailed_at, last_emailed_price, last_emailed_effective_monthly, created_at, updated_at
)
select
  listings.id, listings.search_id, listings.deal_score, listings.manual_confidence,
  listings.verification_status, listings.eligibility_reason, listings.feature_match_score,
  listings.family_fit_score, listings.first_seen_at, listings.last_seen_at,
  listings.last_emailed_at, listings.last_emailed_price,
  listings.last_emailed_effective_monthly, listings.created_at, listings.updated_at
from catcht.listings listings
join catcht.saved_searches searches on searches.id = listings.search_id
where listings.search_id is not null
on conflict (listing_id, search_id) do nothing;

create table catcht.user_listing_decisions (
  user_id uuid not null references catcht.user_profiles(id) on delete cascade,
  listing_id uuid not null references catcht.listings(id) on delete cascade,
  disposition text not null default 'neutral'
    check (disposition in ('neutral', 'interested', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index user_listing_decisions_queue_idx
  on catcht.user_listing_decisions (user_id, disposition, updated_at desc);

insert into catcht.user_listing_decisions (user_id, listing_id, disposition, created_at, updated_at)
select distinct searches.owner_id, listings.id, listings.disposition, listings.created_at, listings.updated_at
from catcht.listings listings
join catcht.listing_matches matches on matches.listing_id = listings.id
join catcht.saved_searches searches on searches.id = matches.search_id
where listings.disposition <> 'neutral'
on conflict (user_id, listing_id) do update
set disposition = excluded.disposition, updated_at = excluded.updated_at;

alter table catcht.digest_runs
  add column user_id uuid references catcht.user_profiles(id) on delete cascade;

update catcht.digest_runs
set user_id = (select id from catcht.user_profiles where role = 'admin' order by created_at limit 1)
where user_id is null;

alter table catcht.digest_runs alter column user_id set not null;
alter table catcht.digest_runs drop constraint if exists digest_runs_scheduled_for_key;
alter table catcht.digest_runs
  add constraint digest_runs_user_scheduled_for_key unique (user_id, scheduled_for);
create index digest_runs_user_finished_idx
  on catcht.digest_runs (user_id, finished_at desc)
  where finished_at is not null;

create function catcht.authorize_invited_user(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_email text := lower(btrim(event->'user'->>'email'));
  invited boolean;
begin
  select exists (
    select 1
    from catcht.user_profiles profiles
    where profiles.active and profiles.email = requested_email
  ) into invited;

  if invited then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This private AutoHunter account requires an invitation.'
    )
  );
end;
$$;

grant usage on schema catcht to supabase_auth_admin;
grant execute on function catcht.authorize_invited_user(jsonb) to supabase_auth_admin;
revoke execute on function catcht.authorize_invited_user(jsonb) from public, anon, authenticated;

revoke all on catcht.user_profiles, catcht.listing_matches, catcht.user_listing_decisions
  from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'catcht_app') then
    grant select, insert, update on catcht.user_profiles to catcht_app;
    grant select, insert, update on catcht.listing_matches to catcht_app;
    grant select, insert, update on catcht.user_listing_decisions to catcht_app;
  end if;
end
$$;

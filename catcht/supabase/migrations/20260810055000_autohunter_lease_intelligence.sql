-- Preserve the useful Leasehackr report semantics without treating every source item as a live deal.

alter table catcht.listings
  add column offer_role text not null default 'active_offer'
    check (offer_role in ('active_offer', 'benchmark', 'market_signal')),
  add column source_method text not null default 'api'
    check (source_method in ('api', 'authorized_email', 'manual_import')),
  add column due_at_signing_includes_first_payment boolean,
  add column acquisition_fee_included_in_due_at_signing boolean,
  add column security_deposit integer
    check (security_deposit is null or security_deposit between 0 and 1000000),
  add column security_deposit_refundable boolean,
  add constraint listings_security_deposit_disclosure_check
    check (security_deposit_refundable is null or security_deposit is not null),
  add constraint listings_acquisition_fee_disclosure_check
    check (acquisition_fee_included_in_due_at_signing is null or acquisition_fee is not null),
  add constraint listings_purchase_role_check
    check (offer_kind = 'lease' or offer_role = 'active_offer');

update catcht.listings
set source_method = case
  when source = 'email_alert' then 'authorized_email'
  when source = 'leasehackr' then 'manual_import'
  else 'api'
end;

create index listings_lease_report_idx
  on catcht.listings (offer_role, expires_at desc, deal_score desc)
  where offer_kind = 'lease';

alter table catcht.digest_runs
  add column source_health jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_health) = 'array');

create or replace function catcht.authorize_invited_user(event jsonb)
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

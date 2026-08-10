alter table mookmobile.listings
  add column verification_status text not null default 'pending'
  check (verification_status in ('verified', 'pending', 'unverified'));

update mookmobile.listings
set verification_status = case
  when manual_verified then 'verified'
  when lower(coalesce(transmission_claim, '')) ~ '(manual|stick|[456][ -]?speed)'
    and lower(coalesce(transmission_claim, '')) !~ '(automatic|cvt|dct|dual[- ]clutch|paddle)'
    then 'pending'
  else 'unverified'
end;

create index listings_verification_dashboard_idx
  on mookmobile.listings (verification_status, disposition, deal_score desc, last_seen_at desc);

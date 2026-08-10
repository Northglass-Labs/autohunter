-- A page-observed VIN remains a correlation attribute, not a destructive cross-source identity.
update catcht.listings
set identity_key = case
  when nullif(btrim(source_listing_id), '') is not null and source not in ('dealer', 'other')
    then source || ':' || btrim(source_listing_id)
  when nullif(btrim(source_listing_id), '') is not null
    then source || ':' || lower(split_part(split_part(url, '://', 2), '/', 1)) || ':' || btrim(source_listing_id)
  else 'url:' || url
end;

create table catcht.consumed_tokens (
  token_id uuid primary key,
  purpose text not null check (length(purpose) between 3 and 150),
  consumed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at >= consumed_at)
);

create index consumed_tokens_expiry_idx on catcht.consumed_tokens (expires_at);

revoke all on catcht.consumed_tokens from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'catcht_app') then
    grant usage on schema catcht to catcht_app;
    grant select, insert on catcht.consumed_tokens to catcht_app;
  end if;
end
$$;

-- Keep the established production login least-privileged while new installations use catcht_app.
-- The role name is an internal compatibility detail; no application identity depends on it.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mookmobile_app') then
    grant usage on schema catcht to mookmobile_app;
    grant select, insert, update on catcht.watch_models to mookmobile_app;
    grant select, insert, update on catcht.listings to mookmobile_app;
    grant select, insert, update on catcht.manual_evidence to mookmobile_app;
    grant select, insert, update on catcht.digest_runs to mookmobile_app;
    grant select, insert on catcht.digest_items to mookmobile_app;
    grant select, insert on catcht.consumed_tokens to mookmobile_app;
    grant select, insert, update on catcht.saved_searches to mookmobile_app;
    grant select, insert on catcht.source_runs to mookmobile_app;
    grant select, insert, update on catcht.user_profiles to mookmobile_app;
    grant select, insert, update on catcht.listing_matches to mookmobile_app;
    grant select, insert, update on catcht.user_listing_decisions to mookmobile_app;

    revoke delete on all tables in schema catcht from mookmobile_app;
    revoke update, delete on catcht.consumed_tokens from mookmobile_app;
  end if;
end
$$;

-- digest_items and source_runs are append-only audit history. The canonical catcht_app
-- provisioning script never grants UPDATE, but the legacy production role retained it from an
-- earlier broad grant. Revoke the drift without requiring either optional runtime role to exist.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mookmobile_app') then
    revoke update on catcht.digest_items, catcht.source_runs from mookmobile_app;
  end if;

  if exists (select 1 from pg_roles where rolname = 'catcht_app') then
    revoke update on catcht.digest_items, catcht.source_runs from catcht_app;
  end if;
end
$$;

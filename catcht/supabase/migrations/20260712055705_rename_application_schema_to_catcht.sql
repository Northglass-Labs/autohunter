-- Preserve the original migration history while giving new and existing installations
-- a product-neutral application schema.
alter schema mookmobile rename to catcht;

-- Existing Mookmobile production uses this compatibility role. The application never deletes
-- directly; cascades are owned by Postgres, so remove the unnecessary privilege when present.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mookmobile_app') then
    revoke delete on all tables in schema catcht from mookmobile_app;
  end if;
end
$$;

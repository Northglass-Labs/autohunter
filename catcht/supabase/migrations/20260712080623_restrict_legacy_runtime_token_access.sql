do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mookmobile_app') then
    revoke update, delete on catcht.consumed_tokens from mookmobile_app;
    grant select, insert on catcht.consumed_tokens to mookmobile_app;
  end if;
  if exists (select 1 from pg_roles where rolname = 'catcht_app') then
    revoke update, delete on catcht.consumed_tokens from catcht_app;
    grant select, insert on catcht.consumed_tokens to catcht_app;
  end if;
end
$$;

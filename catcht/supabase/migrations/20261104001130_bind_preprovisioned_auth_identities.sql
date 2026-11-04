-- Close the invited-email pre-registration boundary. Only the server-side invitation provisioner
-- can choose the deterministic Auth UUID reserved by a profile; public signup receives a random
-- UUID and is denied even if the caller guesses an invited email address.
create or replace function catcht.authorize_invited_user(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_email text := lower(btrim(coalesce(event->'user'->>'email', '')));
  requested_auth_user_id text := coalesce(event->'user'->>'id', '');
  authorized boolean;
begin
  select exists (
    select 1
    from catcht.user_profiles profiles
    where profiles.active
      and lower(profiles.email) = requested_email
      and (
        profiles.auth_user_id::text = requested_auth_user_id
        or (profiles.auth_user_id is null and profiles.id::text = requested_auth_user_id)
      )
  ) into authorized;

  if authorized then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'User creation is not permitted.'
    )
  );
end;
$$;

grant usage on schema catcht to supabase_auth_admin;
grant execute on function catcht.authorize_invited_user(jsonb) to supabase_auth_admin;
revoke execute on function catcht.authorize_invited_user(jsonb) from public, anon, authenticated;

comment on function catcht.authorize_invited_user(jsonb) is
  'Allows only server-preprovisioned Auth UUIDs reserved by active AutoHunter profiles.';

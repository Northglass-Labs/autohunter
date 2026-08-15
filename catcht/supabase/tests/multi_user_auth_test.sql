begin;

select plan(19);

select has_table('catcht', 'user_profiles', 'profiles form the private membership allowlist');
select has_table('catcht', 'listing_matches', 'listings can match more than one owned search');
select has_table('catcht', 'user_listing_decisions', 'review state is stored per user');

select has_column('catcht', 'saved_searches', 'owner_id', 'saved searches have an explicit owner');
select has_column('catcht', 'digest_runs', 'user_id', 'digest runs are scoped to one user');
select has_column('catcht', 'user_profiles', 'auth_user_id', 'profiles map to Supabase Auth users');
select has_column('catcht', 'user_profiles', 'email', 'profiles reserve an invited email address');
select has_column('catcht', 'user_profiles', 'role', 'profiles carry server-authorized roles');
select has_column('catcht', 'listing_matches', 'search_id', 'a match belongs to an owned search');
select has_column('catcht', 'listing_matches', 'listing_id', 'a match points at one canonical listing');
select has_column('catcht', 'user_listing_decisions', 'user_id', 'a decision belongs to one user');
select has_column('catcht', 'user_listing_decisions', 'listing_id', 'a decision points at one listing');

select col_is_fk('catcht', 'saved_searches', 'owner_id', 'search ownership is enforced by a foreign key');
select col_not_null('catcht', 'saved_searches', 'zip', 'every regional inventory and lease search has a collector-safe ZIP');
select col_is_fk('catcht', 'digest_runs', 'user_id', 'digest ownership is enforced by a foreign key');
select has_function('catcht', 'authorize_invited_user', array['jsonb'], 'Auth creation is rejected outside the private invite list');
select col_default_is('catcht', 'user_profiles', 'digest_cadence_hours', '23', 'daily reports use a jitter-tolerant 23-hour cadence');
select ok(
  to_regclass('catcht.user_listing_decisions_listing_id_idx') is not null,
  'listing-decision foreign-key lookups have a covering index'
);
select is(
  (select count(*)::integer from catcht.saved_searches where make = 'Porsche' and model = 'Taycan' and active),
  1,
  'the Taycan target is durably present exactly once'
);

select * from finish();
rollback;

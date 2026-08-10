-- The collector, search form, and regional incentive APIs all require a five-digit ZIP.
-- Older lease-watch rows only carried a broad region, so give fresh/local installs a
-- neutral default before tightening the shared contract. Production profiles are
-- populated with their private ZIP before this migration is applied.
update catcht.saved_searches
set zip = '10001', updated_at = now()
where zip is null;

alter table catcht.saved_searches
  alter column zip set not null;

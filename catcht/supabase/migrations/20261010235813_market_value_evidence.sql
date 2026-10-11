-- ADR-023: a used listing's value comes from comparable listings, stored with its evidence.
alter table catcht.listings
  add column market_comparables integer check (market_comparables is null or market_comparables >= 0),
  add column market_basis text check (market_basis in ('trim', 'trim_family', 'model')),
  add column market_spread_percent numeric(6, 1) check (market_spread_percent is null or market_spread_percent >= 0);

comment on column catcht.listings.market_estimate is
  'Comparable-listing value at ingest (ADR-023), or a provider valuation when no comparables exist.';
comment on column catcht.listings.market_comparables is
  'Number of comparable listings behind market_estimate.';
comment on column catcht.listings.market_basis is
  'How comparables were chosen: same trim, trim family, or whole model.';

-- Ingest looks up comparables by make, model and model year among used listings.
create index listings_used_comparables_idx
  on catcht.listings (lower(make), lower(model), year)
  where offer_kind = 'used';

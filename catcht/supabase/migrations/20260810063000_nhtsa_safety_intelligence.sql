-- Bounded first-party model-year safety evidence. Specific open-recall status still requires a VIN lookup.

alter table catcht.listings
  add column safety_evidence jsonb,
  add constraint listings_safety_evidence_shape_check
    check (
      safety_evidence is null
      or (
        jsonb_typeof(safety_evidence) = 'object'
        and safety_evidence->>'source' = 'nhtsa'
        and safety_evidence->>'ratingStatus' in ('rated', 'not_rated')
        and jsonb_typeof(safety_evidence->'recallCampaigns') = 'array'
      )
    );

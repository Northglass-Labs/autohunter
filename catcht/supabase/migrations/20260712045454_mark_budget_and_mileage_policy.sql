-- Reclassify stored neutral listings under the driver's revised hard search limits.
update mookmobile.listings
set eligibility_reason = case
  when price > 15000 then 'over_budget'
  when mileage > 120000 then 'over_mileage'
  else eligibility_reason
end,
updated_at = now()
where disposition = 'neutral'
  and (price > 15000 or mileage > 120000);

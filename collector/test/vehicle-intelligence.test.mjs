import test from "node:test";
import assert from "node:assert/strict";
import {
  FAMILY_VEHICLE_TARGETS,
  inferVehicleIntelligence,
} from "../src/vehicle-intelligence.mjs";

const familySearch = {
  id: "family-bmw-x5-m60i",
  offerKind: "used",
  make: "BMW",
  model: "X5",
  trim: "M60i",
  profile: "family_gas",
  powertrainCategory: "gas",
  desiredFeatures: ["hands_free_highway", "rear_axle_steering", "air_suspension"],
  requiredFeatures: ["adaptive_cruise_lane_centering"],
  priority: 95,
};

const x5 = {
  year: 2024,
  make: "BMW",
  model: "X5",
  trim: "M60i",
  title: "2024 BMW X5 M60i",
  price: 68_500,
  mileage: 22_000,
};

test("ships a family catalog split into EV and gas lanes with the named target vehicles", () => {
  const active = FAMILY_VEHICLE_TARGETS.filter((target) => target.active !== false);
  const labels = active.map((target) => `${target.make} ${target.model} ${target.trim ?? ""}`.trim());

  assert.ok(active.some((target) => target.garageGroup === "ev"));
  assert.ok(active.some((target) => target.garageGroup === "gas"));
  assert.ok(labels.some((label) => /Mercedes-Benz EQS.*580/i.test(label)));
  assert.ok(labels.some((label) => /Rivian R1S/i.test(label)));
  assert.ok(labels.some((label) => /Audi e-tron GT/i.test(label)));
  assert.ok(labels.some((label) => /BMW X5.*xDrive40i/i.test(label)));
  assert.ok(labels.some((label) => /BMW X5.*M(50|60)i/i.test(label)));
  assert.ok(active.every((target) => target.maxPrice <= 70_000));
});

test("confirms feature equipment only from listing-detail evidence", () => {
  const result = inferVehicleIntelligence(x5, familySearch, {
    extra: {
      options: ["Driving Assistance Professional Package", "Integral Active Steering"],
      features: ["Highway Assistant", "Active Cruise Control with Stop & Go"],
      high_value_features: ["Air Suspension"],
      options_packages: ["ZDY Driving Assistance Professional", "2VH Integral Active Steering"],
    },
    build: {
      body_type: "SUV",
      fuel_type: "Premium Unleaded",
      powertrain_type: "Combustion",
      seating_capacity: 5,
    },
  });

  assert.equal(result.garageGroup, "gas");
  assert.equal(result.powertrainCategory, "gas");
  assert.equal(result.bodyStyle, "SUV");
  assert.equal(result.seatingCapacity, 5);
  assert.equal(result.enrichmentStatus, "enriched");
  assert.ok(result.packageNames.includes("Driving Assistance Professional Package"));
  assert.deepEqual(
    Object.fromEntries(result.featureEvidence.map((feature) => [feature.key, feature.status])),
    {
      hands_free_highway: "confirmed",
      rear_axle_steering: "confirmed",
      air_suspension: "confirmed",
      adaptive_cruise_lane_centering: "confirmed",
    },
  );
  assert.equal(result.featureMatchScore, 100);
  assert.ok(result.familyFitScore >= 70);
});

test("uses exact model-year rules for expected standard equipment without guessing optional packages", () => {
  const result = inferVehicleIntelligence(x5, familySearch);
  const evidence = Object.fromEntries(result.featureEvidence.map((feature) => [feature.key, feature]));

  assert.equal(evidence.rear_axle_steering.status, "expected");
  assert.equal(evidence.rear_axle_steering.source, "model_rule");
  assert.equal(evidence.hands_free_highway.status, "unknown");
  assert.match(evidence.hands_free_highway.evidence, /package|listing|sticker/i);
  assert.equal(result.enrichmentStatus, "not_requested");
});

test("does not infer rear steering on older e-tron GTs or hands-free driving on a hands-on system", () => {
  const result = inferVehicleIntelligence({
    year: 2023,
    make: "Audi",
    model: "e-tron GT",
    trim: "Prestige",
    title: "2023 Audi e-tron GT Prestige",
  }, {
    id: "family-audi-etron-gt",
    offerKind: "used",
    make: "Audi",
    model: "e-tron GT",
    profile: "family_ev",
    powertrainCategory: "ev",
    desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering", "rear_axle_steering"],
    requiredFeatures: [],
    priority: 80,
  }, {
    extra: { features: ["Audi adaptive cruise assist with lane guidance"] },
    build: { body_type: "Sedan", fuel_type: "Electric", powertrain_type: "BEV", seating_capacity: 5 },
  });
  const evidence = Object.fromEntries(result.featureEvidence.map((feature) => [feature.key, feature]));

  assert.equal(evidence.adaptive_cruise_lane_centering.status, "confirmed");
  assert.equal(evidence.hands_free_highway.status, "unknown");
  assert.equal(evidence.rear_axle_steering.status, "unknown");
});

test("marks Gen 2 R1S hands-free capability as expected while requiring activation verification", () => {
  const result = inferVehicleIntelligence({
    year: 2025,
    make: "Rivian",
    model: "R1S",
    trim: "Dual Motor",
    title: "2025 Rivian R1S Dual Motor",
  }, {
    id: "family-rivian-r1s",
    offerKind: "used",
    make: "Rivian",
    model: "R1S",
    profile: "family_ev",
    powertrainCategory: "ev",
    desiredFeatures: ["hands_free_highway", "third_row"],
    requiredFeatures: [],
    priority: 100,
  });
  const evidence = Object.fromEntries(result.featureEvidence.map((feature) => [feature.key, feature]));

  assert.equal(evidence.hands_free_highway.status, "expected");
  assert.match(evidence.hands_free_highway.evidence, /Gen 2|activation|subscription/i);
  assert.equal(evidence.third_row.status, "expected");
});

test("does not promote adaptive cruise plus basic lane-keeping warnings to lane centering", () => {
  const result = inferVehicleIntelligence({
    year: 2024,
    make: "Porsche",
    model: "Cayenne",
    trim: "S",
    title: "2024 Porsche Cayenne S",
  }, {
    offerKind: "used",
    make: "Porsche",
    model: "Cayenne",
    desiredFeatures: ["adaptive_cruise_lane_centering"],
  }, {
    extra: { features: ["Adaptive Cruise Control", "Lane Keep Assist"] },
  });

  assert.equal(result.featureEvidence[0].status, "unknown");
});

test("recognizes exact hands-on highway systems without calling them hands-free", () => {
  const cases = [{
    make: "Porsche",
    model: "Cayenne",
    features: ["Porsche InnoDrive including Adaptive Cruise Control", "Active Lane Keeping"],
  }, {
    make: "Genesis",
    model: "GV80",
    features: ["Highway Driving Assist II"],
  }, {
    make: "Volvo",
    model: "XC90",
    features: ["Pilot Assist"],
  }];

  for (const entry of cases) {
    const result = inferVehicleIntelligence({ year: 2024, ...entry, title: `2024 ${entry.make} ${entry.model}` }, {
      offerKind: "used",
      make: entry.make,
      model: entry.model,
      desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering"],
    }, { extra: { features: entry.features } });
    const evidence = Object.fromEntries(result.featureEvidence.map((feature) => [feature.key, feature.status]));
    assert.equal(evidence.adaptive_cruise_lane_centering, "confirmed", entry.model);
    assert.equal(evidence.hands_free_highway, "unknown", entry.model);
  }
});

test("recognizes Super Cruise as hands-free highway assistance only when explicitly listed", () => {
  const result = inferVehicleIntelligence({
    year: 2024,
    make: "Cadillac",
    model: "LYRIQ",
    trim: "Luxury 2",
    title: "2024 Cadillac LYRIQ Luxury 2",
  }, {
    offerKind: "used",
    make: "Cadillac",
    model: "LYRIQ",
    desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering"],
  }, { extra: { options: ["Super Cruise"] } });
  const evidence = Object.fromEntries(result.featureEvidence.map((feature) => [feature.key, feature.status]));

  assert.equal(evidence.hands_free_highway, "confirmed");
  assert.equal(evidence.adaptive_cruise_lane_centering, "confirmed");
});

test("bounds adversarially deep provider option structures", () => {
  let nested = "Highway Assistant";
  for (let depth = 0; depth < 10_000; depth += 1) nested = { child: nested };

  assert.doesNotThrow(() => inferVehicleIntelligence(x5, familySearch, {
    extra: { features: nested },
  }));
});

test("marks summary-text equipment as expected, never confirmed, from headings", () => {
  const result = inferVehicleIntelligence({
    ...x5,
    heading: "2024 BMW X5 M60i Executive w/ Driving Assistance Professional and Integral Active Steering",
  }, familySearch);
  const evidence = Object.fromEntries(result.featureEvidence.map((feature) => [feature.key, feature]));

  assert.equal(evidence.adaptive_cruise_lane_centering.status, "expected");
  assert.equal(evidence.adaptive_cruise_lane_centering.source, "provider_summary");
  assert.equal(evidence.rear_axle_steering.status, "expected");
  assert.equal(evidence.rear_axle_steering.source, "provider_summary");
  assert.equal(evidence.hands_free_highway.status, "unknown");
  assert.equal(result.featureEvidence.every((feature) => feature.status !== "confirmed"), true);
});

test("prefers listing-specific summary evidence over model rules, and detail evidence over both", () => {
  const withSummary = inferVehicleIntelligence({
    ...x5,
    heading: "2024 BMW X5 M60i with Integral Active Steering",
  }, familySearch);
  const summaryEvidence = Object.fromEntries(withSummary.featureEvidence.map((feature) => [feature.key, feature]));
  assert.equal(summaryEvidence.rear_axle_steering.status, "expected");
  assert.equal(summaryEvidence.rear_axle_steering.source, "provider_summary");

  const withDetail = inferVehicleIntelligence({
    ...x5,
    heading: "2024 BMW X5 M60i with Integral Active Steering",
  }, familySearch, { extra: { options: ["Integral Active Steering"] } });
  const detailEvidence = Object.fromEntries(withDetail.featureEvidence.map((feature) => [feature.key, feature]));
  assert.equal(detailEvidence.rear_axle_steering.status, "confirmed");
  assert.equal(detailEvidence.rear_axle_steering.source, "provider_listing");
});

test("does not promote generic cruise or lane-keep summary text to any evidence tier", () => {
  const result = inferVehicleIntelligence({
    year: 2024,
    make: "Porsche",
    model: "Cayenne",
    trim: "S",
    title: "2024 Porsche Cayenne S",
    heading: "2024 Porsche Cayenne S with Adaptive Cruise Control and Lane Keep Assist",
  }, {
    offerKind: "used",
    make: "Porsche",
    model: "Cayenne",
    desiredFeatures: ["adaptive_cruise_lane_centering", "hands_free_highway"],
  });
  const evidence = Object.fromEntries(result.featureEvidence.map((feature) => [feature.key, feature.status]));

  assert.equal(evidence.adaptive_cruise_lane_centering, "unknown");
  assert.equal(evidence.hands_free_highway, "unknown");
});

test("reads auxiliary summary texts such as Auto.dev descriptions as expected-tier evidence", () => {
  const result = inferVehicleIntelligence({
    year: 2025,
    make: "Rivian",
    model: "R1S",
    title: "2025 Rivian R1S Dual Motor",
    summaryTexts: ["Includes factory tow package and premium audio."],
  }, {
    offerKind: "used",
    make: "Rivian",
    model: "R1S",
    desiredFeatures: ["tow_package"],
  });

  assert.equal(result.featureEvidence[0].status, "expected");
  assert.equal(result.featureEvidence[0].source, "provider_summary");
});

test("maps MarketCheck search-response fields that previously fell through", () => {
  const result = inferVehicleIntelligence({
    ...x5,
    build: { body_type: "SUV", std_seating: 7, fuel_type: "Premium Unleaded" },
    carfax_1_owner: 1,
    carfax_clean_title: "true",
    exterior_color: "Mineral White Metallic",
    interior_color: "Coffee",
    dom: 41,
  }, familySearch);

  assert.equal(result.seatingCapacity, 7);
  assert.equal(result.oneOwner, true);
  assert.equal(result.cleanTitle, true);
  assert.equal(result.exteriorColor, "Mineral White Metallic");
  assert.equal(result.interiorColor, "Coffee");
  assert.equal(result.daysOnMarket, 41);
});

test("marks expected standard equipment for the lease-target three-row family", () => {
  const cases = [
    { make: "Lexus", model: "TX" },
    { make: "Toyota", model: "Grand Highlander" },
    { make: "Mazda", model: "CX-90" },
    { make: "Kia", model: "Telluride" },
    { make: "Hyundai", model: "Palisade" },
    { make: "Lincoln", model: "Aviator" },
    { make: "Audi", model: "SQ7" },
  ];
  for (const entry of cases) {
    const result = inferVehicleIntelligence({ year: 2024, ...entry, title: `2024 ${entry.make} ${entry.model}` }, {
      offerKind: "lease",
      make: entry.make,
      model: entry.model,
      desiredFeatures: ["third_row"],
    });
    assert.equal(result.featureEvidence[0].status, "expected", `${entry.make} ${entry.model}`);
    assert.equal(result.featureEvidence[0].source, "model_rule", `${entry.make} ${entry.model}`);
  }
});

test("marks precise expected equipment for SQ7 air suspension, GV80 and XC90 lane centering, and MDX Type S air suspension", () => {
  const cases = [
    { listing: { year: 2023, make: "Audi", model: "SQ7" }, key: "air_suspension" },
    { listing: { year: 2024, make: "Genesis", model: "GV80", trim: "3.5T" }, key: "adaptive_cruise_lane_centering" },
    { listing: { year: 2023, make: "Volvo", model: "XC90", trim: "Recharge" }, key: "adaptive_cruise_lane_centering" },
    { listing: { year: 2023, make: "Acura", model: "MDX", trim: "Type S" }, key: "air_suspension" },
  ];
  for (const entry of cases) {
    const result = inferVehicleIntelligence({ title: "listing", ...entry.listing }, {
      offerKind: "used",
      make: entry.listing.make,
      model: entry.listing.model,
      desiredFeatures: [entry.key],
    });
    assert.equal(result.featureEvidence[0].status, "expected", `${entry.listing.make} ${entry.listing.model} ${entry.key}`);
  }
});

test("does not mark expected air suspension on a non-Type-S MDX", () => {
  const result = inferVehicleIntelligence({ year: 2023, make: "Acura", model: "MDX", trim: "A-Spec", title: "MDX A-Spec" }, {
    offerKind: "used",
    make: "Acura",
    model: "MDX",
    desiredFeatures: ["air_suspension"],
  });
  assert.equal(result.featureEvidence[0].status, "unknown");
});

test("recognizes newly covered ADAS systems at the correct capability tier", () => {
  const handsFree = [
    { make: "Lincoln", model: "Aviator", text: "Lincoln BlueCruise hands-free highway driving" },
    { make: "Nissan", model: "Ariya", text: "ProPILOT Assist 2.1" },
  ];
  for (const entry of handsFree) {
    const result = inferVehicleIntelligence({ year: 2024, ...entry, title: `2024 ${entry.make} ${entry.model}` }, {
      offerKind: "used",
      make: entry.make,
      model: entry.model,
      desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering"],
    }, { extra: { features: [entry.text] } });
    const evidence = Object.fromEntries(result.featureEvidence.map((feature) => [feature.key, feature.status]));
    assert.equal(evidence.hands_free_highway, "confirmed", entry.text);
    assert.equal(evidence.adaptive_cruise_lane_centering, "confirmed", entry.text);
  }

  const handsOn = [
    { make: "Nissan", model: "Pathfinder", text: "ProPILOT Assist" },
    { make: "Volkswagen", model: "Atlas", text: "Travel Assist" },
    { make: "Porsche", model: "Cayenne", text: "Porsche InnoDrive" },
    { make: "BMW", model: "X5", text: "Active Driving Assistant Pro" },
    { make: "BMW", model: "X5", text: "ZDY Driving Assistance Professional Package" },
  ];
  for (const entry of handsOn) {
    const result = inferVehicleIntelligence({ year: 2024, ...entry, title: `2024 ${entry.make} ${entry.model}` }, {
      offerKind: "used",
      make: entry.make,
      model: entry.model,
      desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering"],
    }, { extra: { features: [entry.text] } });
    const evidence = Object.fromEntries(result.featureEvidence.map((feature) => [feature.key, feature.status]));
    assert.equal(evidence.adaptive_cruise_lane_centering, "confirmed", entry.text);
    assert.equal(evidence.hands_free_highway, "unknown", entry.text);
  }
});

test("decodes the verified BMW ZDH package code as rear-axle steering evidence", () => {
  const result = inferVehicleIntelligence({
    year: 2020,
    make: "BMW",
    model: "X5",
    trim: "M50i",
    title: "2020 BMW X5 M50i",
  }, {
    offerKind: "used",
    make: "BMW",
    model: "X5",
    trim: "M50i",
    desiredFeatures: ["rear_axle_steering"],
  }, { extra: { options_packages: ["ZDH Dynamic Handling Package"] } });

  assert.equal(result.featureEvidence[0].status, "confirmed");
});

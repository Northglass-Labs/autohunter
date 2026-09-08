import "server-only";
import { getDb } from "./db";
import type {
  CandidateOffer,
  CandidateListing,
  Disposition,
  EnrichmentStatus,
  GarageGroup,
  ManualPhotoEvidence,
  OfferKind,
  OfferRole,
  PowertrainCategory,
  SearchProfile,
  SourceMethod,
  VehicleCondition,
  VehicleFeatureEvidence,
  VehicleFeatureKey,
  VehicleSafetyEvidence,
} from "./types";
import { listingIdentity, normalizeVin } from "./identity";
import {
  canonicalizeVehicleRows,
  isCurrentListingRow,
  matchesListingView,
  needsManualPhotoVerification,
} from "./deduplication";
import {
  evaluateOffer,
  manualVerification,
  mergeManualEvidence,
  type ManualVerificationStatus,
  type OfferEvaluationPolicy,
} from "./ranking";
import { effectiveMonthlyCost } from "./offer-economics";
import { parseSafetyEvidence } from "./safety-evidence";
import { mergeFeatureIntelligence, type PersistedFeatureIntelligence } from "./feature-intelligence";

export interface ListingCard {
  id: string;
  vin: string | null;
  title: string;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  price: number | null;
  mileage: number | null;
  distanceMiles: number | null;
  location: string;
  source: string;
  url: string;
  primaryImageUrl: string | null;
  manualConfidence: number;
  verificationStatus: ManualVerificationStatus;
  dealScore: number;
  disposition: Disposition;
  lastSeenAt: string;
  offerKind: OfferKind;
  offerRole: OfferRole;
  sourceMethod: SourceMethod;
  condition: VehicleCondition;
  effectiveMonthly: number | null;
  monthlyPayment: number | null;
  dueAtSigning: number | null;
  dueAtSigningIncludesFirstPayment: boolean | null;
  acquisitionFeeIncludedInDueAtSigning: boolean | null;
  termMonths: number | null;
  annualMiles: number | null;
  securityDeposit: number | null;
  securityDepositRefundable: boolean | null;
  msrp: number | null;
  parseConfidence: number;
  region: string | null;
  sellerName: string | null;
  garageGroup: GarageGroup;
  powertrainCategory: PowertrainCategory;
  bodyStyle: string | null;
  seatingCapacity: number | null;
  packageNames: string[];
  featureEvidence: VehicleFeatureEvidence[];
  featureMatchScore: number;
  familyFitScore: number;
  daysOnMarket: number | null;
  priceChange: number | null;
  oneOwner: boolean | null;
  cleanTitle: boolean | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  enrichmentStatus: EnrichmentStatus;
  safetyEvidence: VehicleSafetyEvidence | null;
}

function card(row: Record<string, unknown>): ListingCard {
  return {
    id: String(row.id),
    vin: row.vin ? String(row.vin) : null,
    title: String(row.title),
    year: row.year === null || row.year === undefined ? null : Number(row.year),
    make: String(row.make),
    model: String(row.model),
    trim: row.trim ? String(row.trim) : null,
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    mileage: row.mileage === null || row.mileage === undefined ? null : Number(row.mileage),
    distanceMiles: row.distance_miles === null || row.distance_miles === undefined ? null : Number(row.distance_miles),
    location: String(row.location),
    source: String(row.source),
    url: String(row.url),
    primaryImageUrl: row.primary_image_url ? String(row.primary_image_url) : null,
    manualConfidence: Number(row.user_manual_confidence ?? row.manual_confidence),
    verificationStatus: (row.user_verification_status ?? row.verification_status ?? (row.manual_verified ? "verified" : "pending")) as ManualVerificationStatus,
    dealScore: Number(row.user_deal_score ?? row.deal_score),
    disposition: (row.user_disposition ?? row.disposition) as Disposition,
    lastSeenAt: new Date(String(row.user_last_seen_at ?? row.last_seen_at)).toISOString(),
    offerKind: (row.offer_kind ?? "used") as OfferKind,
    offerRole: (row.offer_role ?? "active_offer") as OfferRole,
    sourceMethod: (row.source_method ?? (row.source === "email_alert" ? "authorized_email" : "api")) as SourceMethod,
    condition: (row.vehicle_condition ?? row.offer_kind ?? "used") as VehicleCondition,
    effectiveMonthly: row.effective_monthly === null || row.effective_monthly === undefined ? null : Number(row.effective_monthly),
    monthlyPayment: row.monthly_payment === null || row.monthly_payment === undefined ? null : Number(row.monthly_payment),
    dueAtSigning: row.due_at_signing === null || row.due_at_signing === undefined ? null : Number(row.due_at_signing),
    dueAtSigningIncludesFirstPayment: row.due_at_signing_includes_first_payment === null || row.due_at_signing_includes_first_payment === undefined
      ? null : Boolean(row.due_at_signing_includes_first_payment),
    acquisitionFeeIncludedInDueAtSigning: row.acquisition_fee_included_in_due_at_signing === null || row.acquisition_fee_included_in_due_at_signing === undefined
      ? null : Boolean(row.acquisition_fee_included_in_due_at_signing),
    termMonths: row.term_months === null || row.term_months === undefined ? null : Number(row.term_months),
    annualMiles: row.annual_miles === null || row.annual_miles === undefined ? null : Number(row.annual_miles),
    securityDeposit: row.security_deposit === null || row.security_deposit === undefined ? null : Number(row.security_deposit),
    securityDepositRefundable: row.security_deposit_refundable === null || row.security_deposit_refundable === undefined
      ? null : Boolean(row.security_deposit_refundable),
    msrp: row.msrp === null || row.msrp === undefined ? null : Number(row.msrp),
    parseConfidence: row.parse_confidence === null || row.parse_confidence === undefined ? 1 : Number(row.parse_confidence),
    region: row.region ? String(row.region) : null,
    sellerName: row.seller_name ? String(row.seller_name) : null,
    garageGroup: (row.user_garage_group ?? row.garage_group ?? "other") as GarageGroup,
    powertrainCategory: (row.user_powertrain_category ?? row.powertrain_category ?? "any") as PowertrainCategory,
    bodyStyle: row.body_style ? String(row.body_style) : null,
    seatingCapacity: row.seating_capacity === null || row.seating_capacity === undefined ? null : Number(row.seating_capacity),
    packageNames: Array.isArray(row.package_names) ? row.package_names.map(String) : [],
    featureEvidence: featureEvidenceFromRow(row.feature_evidence),
    featureMatchScore: Number(row.user_feature_match_score ?? row.feature_match_score ?? 0),
    familyFitScore: Number(row.user_family_fit_score ?? row.family_fit_score ?? 0),
    daysOnMarket: row.days_on_market === null || row.days_on_market === undefined ? null : Number(row.days_on_market),
    priceChange: row.price_change === null || row.price_change === undefined ? null : Number(row.price_change),
    oneOwner: row.one_owner === null || row.one_owner === undefined ? null : Boolean(row.one_owner),
    cleanTitle: row.clean_title === null || row.clean_title === undefined ? null : Boolean(row.clean_title),
    exteriorColor: row.exterior_color ? String(row.exterior_color) : null,
    interiorColor: row.interior_color ? String(row.interior_color) : null,
    enrichmentStatus: (row.enrichment_status ?? "not_requested") as EnrichmentStatus,
    safetyEvidence: parseSafetyEvidence(row.safety_evidence),
  };
}

export interface UserProfile {
  id: string;
  authUserId: string | null;
  email: string | null;
  displayName: string;
  role: "admin" | "member";
  active: boolean;
  digestEnabled: boolean;
  digestCadenceHours: number;
}

function userProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    authUserId: row.auth_user_id ? String(row.auth_user_id) : null,
    email: row.email ? String(row.email) : null,
    displayName: String(row.display_name),
    role: row.role as UserProfile["role"],
    active: Boolean(row.active),
    digestEnabled: Boolean(row.digest_enabled),
    digestCadenceHours: Number(row.digest_cadence_hours),
  };
}

export async function getUserProfileByAuthUserId(authUserId: string): Promise<UserProfile | null> {
  const sql = getDb();
  const rows = await sql`
    select * from catcht.user_profiles
    where auth_user_id = ${authUserId}::uuid and active
    limit 1
  `;
  return rows[0] ? userProfile(rows[0]) : null;
}

export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const sql = getDb();
  const rows = await sql`
    select * from catcht.user_profiles
    where email = ${email} and active
    limit 1
  `;
  return rows[0] ? userProfile(rows[0]) : null;
}

export async function getUserProfileById(id: string): Promise<UserProfile | null> {
  const sql = getDb();
  const rows = await sql`
    select * from catcht.user_profiles
    where id = ${id}::uuid and active
    limit 1
  `;
  return rows[0] ? userProfile(rows[0]) : null;
}

export async function claimUserProfile(authUserId: string, email: string): Promise<UserProfile | null> {
  const sql = getDb();
  const rows = await sql`
    update catcht.user_profiles
    set auth_user_id = ${authUserId}::uuid, updated_at = now()
    where email = ${email} and active
      and (auth_user_id is null or auth_user_id = ${authUserId}::uuid)
    returning *
  `;
  return rows[0] ? userProfile(rows[0]) : null;
}

export async function listUserProfiles(): Promise<UserProfile[]> {
  const sql = getDb();
  const rows = await sql`
    select * from catcht.user_profiles
    where active
    order by case role when 'admin' then 0 else 1 end, display_name, email
  `;
  return rows.map((row) => userProfile(row));
}

export async function inviteUserProfile(email: string, displayName: string): Promise<UserProfile> {
  const sql = getDb();
  const rows = await sql`
    insert into catcht.user_profiles (email, display_name, role)
    values (${email}, ${displayName}, 'member')
    on conflict (lower(email)) where email is not null do update
      set display_name = excluded.display_name, active = true, updated_at = now()
    returning *
  `;
  return userProfile(rows[0]);
}

export async function getListings(
  userId: string,
  disposition: Disposition = "neutral",
  verificationStatus: "verified" | "pending" = "verified",
  offerKind?: OfferKind,
  garageGroup?: GarageGroup,
): Promise<ListingCard[]> {
  const sql = getDb();
  const allRows = await sql`
    select * from (
      select listings.*,
        coalesce(decisions.disposition, 'neutral') as user_disposition,
        matches.deal_score as user_deal_score,
        matches.manual_confidence as user_manual_confidence,
        matches.verification_status as user_verification_status,
        matches.feature_match_score as user_feature_match_score,
        matches.family_fit_score as user_family_fit_score,
        matches.last_seen_at as user_last_seen_at,
        searches.garage_group as user_garage_group,
        searches.powertrain_category as user_powertrain_category,
        row_number() over (
          partition by listings.id
          order by matches.deal_score desc, matches.last_seen_at desc, searches.priority desc
        ) as owner_match_rank
      from catcht.listings listings
      join catcht.listing_matches matches on matches.listing_id = listings.id
      join catcht.saved_searches searches on searches.id = matches.search_id
      left join catcht.user_listing_decisions decisions
        on decisions.user_id = ${userId}::uuid and decisions.listing_id = listings.id
      where searches.owner_id = ${userId}::uuid
        and (${offerKind ?? null}::text is null or listings.offer_kind = ${offerKind ?? null})
        and (${garageGroup ?? null}::text is null or searches.garage_group = ${garageGroup ?? null})
    ) owned
    where owner_match_rank = 1
    order by user_last_seen_at desc
    limit 2000
  `;
  const now = new Date();
  const rows = canonicalizeVehicleRows(asUserListingRows(allRows), now)
    .filter((row) => matchesListingView(row, disposition, verificationStatus, now));
  rows.sort(verificationStatus === "pending" && disposition === "neutral"
    ? (left, right) => timestamp(right.last_seen_at) - timestamp(left.last_seen_at)
      || nullableNumber(left.price) - nullableNumber(right.price)
    : (left, right) => number(right.deal_score) - number(left.deal_score)
      || timestamp(right.last_seen_at) - timestamp(left.last_seen_at));
  return rows.slice(0, 250).map((row) => card(row));
}

export async function getListing(userId: string, id: string): Promise<ListingCard | null> {
  const sql = getDb();
  const rows = await sql`
    select listings.*,
      coalesce(decisions.disposition, 'neutral') as user_disposition,
      matches.deal_score as user_deal_score,
      matches.manual_confidence as user_manual_confidence,
      matches.verification_status as user_verification_status,
      matches.feature_match_score as user_feature_match_score,
      matches.family_fit_score as user_family_fit_score,
      matches.last_seen_at as user_last_seen_at,
      searches.garage_group as user_garage_group,
      searches.powertrain_category as user_powertrain_category
    from catcht.listings listings
    join catcht.listing_matches matches on matches.listing_id = listings.id
    join catcht.saved_searches searches on searches.id = matches.search_id
    left join catcht.user_listing_decisions decisions
      on decisions.user_id = ${userId}::uuid and decisions.listing_id = listings.id
    where listings.id = ${id}::uuid and searches.owner_id = ${userId}::uuid
    order by matches.deal_score desc, matches.last_seen_at desc
    limit 1
  `;
  return rows[0] ? card(rows[0]) : null;
}

export async function setDisposition(userId: string, id: string, disposition: Disposition) {
  const sql = getDb();
  const rows = await sql`
    insert into catcht.user_listing_decisions (user_id, listing_id, disposition)
    select distinct ${userId}::uuid, ${id}::uuid, ${disposition}
    from catcht.listing_matches matches
    join catcht.saved_searches searches on searches.id = matches.search_id
    where matches.listing_id = ${id}::uuid and searches.owner_id = ${userId}::uuid
    on conflict (user_id, listing_id) do update
      set disposition = excluded.disposition, updated_at = now()
    returning listing_id
  `;
  if (!rows[0]) throw new Error("listing not found");
}

export async function consumeDecisionAndSetDisposition(
  tokenId: string,
  recipientId: string,
  listingId: string,
  disposition: Exclude<Disposition, "neutral">,
  expiresAt: Date,
) {
  const sql = getDb();
  await sql.begin(async (transaction) => {
    const consumed = await transaction`
      insert into catcht.consumed_tokens (token_id, purpose, expires_at)
      values (${tokenId}::uuid, ${`decision:${recipientId}`}, ${expiresAt.toISOString()}::timestamptz)
      on conflict (token_id) do nothing
      returning token_id
    `;
    if (!consumed[0]) throw new Error("decision link already used");
    const updated = await transaction`
      insert into catcht.user_listing_decisions (user_id, listing_id, disposition)
      select distinct ${recipientId}::uuid, ${listingId}::uuid, ${disposition}
      from catcht.listing_matches matches
      join catcht.saved_searches searches on searches.id = matches.search_id
      join catcht.user_profiles profiles on profiles.id = searches.owner_id and profiles.active
      where matches.listing_id = ${listingId}::uuid and searches.owner_id = ${recipientId}::uuid
      on conflict (user_id, listing_id) do update
        set disposition = excluded.disposition, updated_at = now()
      returning listing_id
    `;
    if (!updated[0]) throw new Error("listing not found");
  });
}

export async function getWatchModels() {
  const sql = getDb();
  const rows = await sql`select id, make, model, aliases, active from catcht.watch_models order by make, model`;
  return rows.map((row) => ({
    id: String(row.id),
    make: String(row.make),
    model: String(row.model),
    aliases: (row.aliases as string[]) ?? [],
    active: Boolean(row.active),
  }));
}

export async function addWatchModel(make: string, model: string) {
  const sql = getDb();
  await sql`insert into catcht.watch_models (make, model) values (${make}, ${model}) on conflict (make, model) do update set active = true`;
}

export interface SavedSearch {
  id: string;
  ownerId: string;
  ownerName: string | null;
  name: string;
  offerKind: OfferKind;
  make: string;
  model: string;
  trim: string | null;
  zip: string | null;
  radiusMiles: number | null;
  region: string | null;
  transmission: "any" | "manual" | "automatic";
  maxPrice: number | null;
  maxMileage: number | null;
  maxEffectiveMonthly: number | null;
  maxDueAtSigning: number | null;
  minAnnualMiles: number | null;
  aliases: string[];
  sourceIds: Record<string, string>;
  active: boolean;
  profile: SearchProfile;
  garageGroup: GarageGroup;
  powertrainCategory: PowertrainCategory;
  yearMin: number | null;
  yearMax: number | null;
  targetPrice: number | null;
  trimAliases: string[];
  bodyStyle: string | null;
  desiredFeatures: VehicleFeatureKey[];
  requiredFeatures: VehicleFeatureKey[];
  rationale: string | null;
  priority: number;
}

export interface SavedSearchInput {
  name: string;
  offerKind: OfferKind;
  make: string;
  model: string;
  trim?: string | null;
  zip?: string | null;
  radiusMiles?: number | null;
  region?: string | null;
  transmission: "any" | "manual" | "automatic";
  maxPrice?: number | null;
  maxMileage?: number | null;
  maxEffectiveMonthly?: number | null;
  maxDueAtSigning?: number | null;
  minAnnualMiles?: number | null;
  profile?: SearchProfile;
  garageGroup?: GarageGroup;
  powertrainCategory?: PowertrainCategory;
  yearMin?: number | null;
  yearMax?: number | null;
  targetPrice?: number | null;
  aliases?: string[];
  trimAliases?: string[];
  bodyStyle?: string | null;
  desiredFeatures?: VehicleFeatureKey[];
  requiredFeatures?: VehicleFeatureKey[];
  rationale?: string | null;
  priority?: number | null;
}

function savedSearch(row: Record<string, unknown>): SavedSearch {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    ownerName: row.owner_name ? String(row.owner_name) : null,
    name: String(row.name),
    offerKind: row.offer_kind as OfferKind,
    make: String(row.make),
    model: String(row.model),
    trim: row.trim ? String(row.trim) : null,
    zip: row.zip ? String(row.zip) : null,
    radiusMiles: row.radius_miles === null ? null : Number(row.radius_miles),
    region: row.region ? String(row.region) : null,
    transmission: row.transmission as SavedSearch["transmission"],
    maxPrice: row.max_price === null ? null : Number(row.max_price),
    maxMileage: row.max_mileage === null ? null : Number(row.max_mileage),
    maxEffectiveMonthly: row.max_effective_monthly === null ? null : Number(row.max_effective_monthly),
    maxDueAtSigning: row.max_due_at_signing === null ? null : Number(row.max_due_at_signing),
    minAnnualMiles: row.min_annual_miles === null ? null : Number(row.min_annual_miles),
    aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
    sourceIds: row.source_ids && typeof row.source_ids === "object" ? row.source_ids as Record<string, string> : {},
    active: Boolean(row.active),
    profile: (row.profile ?? "general") as SearchProfile,
    garageGroup: (row.garage_group ?? "other") as GarageGroup,
    powertrainCategory: (row.powertrain_category ?? "any") as PowertrainCategory,
    yearMin: row.year_min === null || row.year_min === undefined ? null : Number(row.year_min),
    yearMax: row.year_max === null || row.year_max === undefined ? null : Number(row.year_max),
    targetPrice: row.target_price === null || row.target_price === undefined ? null : Number(row.target_price),
    trimAliases: Array.isArray(row.trim_aliases) ? row.trim_aliases.map(String) : [],
    bodyStyle: row.body_style ? String(row.body_style) : null,
    desiredFeatures: Array.isArray(row.desired_features) ? row.desired_features.map(String) as VehicleFeatureKey[] : [],
    requiredFeatures: Array.isArray(row.required_features) ? row.required_features.map(String) as VehicleFeatureKey[] : [],
    rationale: row.rationale ? String(row.rationale) : null,
    priority: Number(row.priority ?? 50),
  };
}

export async function getSavedSearches(userId: string): Promise<SavedSearch[]> {
  const sql = getDb();
  const rows = await sql`
    select searches.*, searches.aliases || coalesce(models.aliases, '{}') as aliases
    from catcht.saved_searches searches
    left join catcht.watch_models models on models.id = searches.legacy_watch_model_id
    where searches.owner_id = ${userId}::uuid
    order by searches.offer_kind, searches.make, searches.model, searches.created_at
  `;
  return rows.map((row) => savedSearch(row));
}

export async function getActiveSavedSearchesForCollector(): Promise<SavedSearch[]> {
  const sql = getDb();
  const rows = await sql`
    select searches.*, searches.aliases || coalesce(models.aliases, '{}') as aliases
    from catcht.saved_searches searches
    left join catcht.watch_models models on models.id = searches.legacy_watch_model_id
    join catcht.user_profiles owners on owners.id = searches.owner_id and owners.active
    where searches.active
    order by searches.priority desc, searches.offer_kind, searches.make, searches.model
  `;
  return rows.map((row) => savedSearch(row));
}

export async function getAllSavedSearches(): Promise<SavedSearch[]> {
  const sql = getDb();
  const rows = await sql`
    select searches.*, searches.aliases || coalesce(models.aliases, '{}') as aliases,
      owners.display_name as owner_name
    from catcht.saved_searches searches
    left join catcht.watch_models models on models.id = searches.legacy_watch_model_id
    join catcht.user_profiles owners on owners.id = searches.owner_id and owners.active
    order by owners.display_name, searches.garage_group, searches.priority desc, searches.name
  `;
  return rows.map((row) => savedSearch(row));
}

export async function addSavedSearch(userId: string, input: SavedSearchInput) {
  const sql = getDb();
  const trim = input.trim ?? null;
  const region = input.region ?? null;
  const rows = await sql`
    insert into catcht.saved_searches (
      owner_id, name, offer_kind, make, model, trim, zip, radius_miles, region, transmission,
      max_price, max_mileage, max_effective_monthly, max_due_at_signing, min_annual_miles,
      profile, garage_group, powertrain_category, year_min, year_max, target_price,
      aliases, trim_aliases, desired_features, required_features, rationale, priority, body_style
    ) values (
      ${userId}::uuid, ${input.name}, ${input.offerKind}, ${input.make}, ${input.model}, ${trim},
      ${input.zip ?? null}, ${input.radiusMiles ?? null}, ${region}, ${input.transmission},
      ${input.maxPrice ?? null}, ${input.maxMileage ?? null}, ${input.maxEffectiveMonthly ?? null},
      ${input.maxDueAtSigning ?? null}, ${input.minAnnualMiles ?? null},
      ${input.profile ?? "general"}, ${input.garageGroup ?? "other"}, ${input.powertrainCategory ?? "any"},
      ${input.yearMin ?? null}, ${input.yearMax ?? null}, ${input.targetPrice ?? null},
      ${input.aliases ?? []}, ${input.trimAliases ?? []}, ${input.desiredFeatures ?? []},
      ${input.requiredFeatures ?? []}, ${input.rationale ?? null}, ${input.priority ?? 50}, ${input.bodyStyle ?? null}
    )
    on conflict do nothing
    returning id
  `;
  return Boolean(rows[0]);
}

export async function setSavedSearchActive(userId: string, id: string, active: boolean) {
  const sql = getDb();
  await sql`
    update catcht.saved_searches set active = ${active}, updated_at = now()
    where id = ${id}::uuid and owner_id = ${userId}::uuid
  `;
}

export async function setSavedSearchOwner(id: string, ownerId: string) {
  const sql = getDb();
  const rows = await sql`
    update catcht.saved_searches searches
    set owner_id = ${ownerId}::uuid, updated_at = now()
    from catcht.user_profiles owners
    where searches.id = ${id}::uuid and owners.id = ${ownerId}::uuid and owners.active
    returning searches.id
  `;
  if (!rows[0]) throw new Error("search or owner not found");
}

export interface SourceRunInput {
  adapter: string;
  source: string;
  status: "success" | "empty" | "unavailable" | "challenged" | "failed";
  startedAt: string;
  finishedAt: string;
  searchedCount: number;
  discoveredCount: number;
  acceptedCount: number;
  messageCode?: string | null;
}

export async function recordSourceRuns(runs: SourceRunInput[]) {
  if (runs.length === 0) return;
  const sql = getDb();
  await sql.begin(async (transaction) => {
    for (const run of runs) {
      await transaction`
        insert into catcht.source_runs (
          adapter, source, status, message_code, searched_count, discovered_count, accepted_count,
          started_at, finished_at
        ) values (
          ${run.adapter}, ${run.source}, ${run.status}, ${run.messageCode ?? null},
          ${run.searchedCount}, ${run.discoveredCount}, ${run.acceptedCount},
          ${run.startedAt}::timestamptz, ${run.finishedAt}::timestamptz
        )
      `;
    }
  });
}

export interface SourceHealth {
  source: string;
  adapter: string;
  status: SourceRunInput["status"];
  messageCode: string | null;
  searchedCount: number;
  discoveredCount: number;
  acceptedCount: number;
  finishedAt: string;
}

export interface DigestReport {
  id: string;
  scheduledFor: string;
  status: "started" | "sent" | "empty" | "failed";
  listingCount: number;
  startedAt: string;
  finishedAt: string | null;
  sourceHealth: SourceHealth[];
}

export interface DigestReportDetail extends DigestReport {
  listings: ListingCard[];
}

export async function getSourceHealth(): Promise<SourceHealth[]> {
  const sql = getDb();
  const rows = await sql`
    select distinct on (source)
      source, adapter, status, message_code, searched_count, discovered_count, accepted_count, finished_at
    from catcht.source_runs
    order by source, finished_at desc
  `;
  return rows.map((row) => ({
    source: String(row.source),
    adapter: String(row.adapter),
    status: String(row.status) as SourceRunInput["status"],
    messageCode: row.message_code ? String(row.message_code) : null,
    searchedCount: Number(row.searched_count),
    discoveredCount: Number(row.discovered_count),
    acceptedCount: Number(row.accepted_count),
    finishedAt: new Date(String(row.finished_at)).toISOString(),
  }));
}

export async function listDigestReports(userId: string): Promise<DigestReport[]> {
  const sql = getDb();
  const rows = await sql`
    select id, scheduled_for, status, listing_count, started_at, finished_at, source_health
    from catcht.digest_runs
    where user_id = ${userId}::uuid
    order by scheduled_for desc, started_at desc
    limit 120
  `;
  return rows.map((row) => digestReport(row));
}

export async function getDigestReport(userId: string, runId: string): Promise<DigestReportDetail | null> {
  const sql = getDb();
  const runs = await sql`
    select id, scheduled_for, status, listing_count, started_at, finished_at, source_health
    from catcht.digest_runs
    where id = ${runId}::uuid and user_id = ${userId}::uuid
    limit 1
  `;
  if (!runs[0]) return null;
  const rows = await sql`
    select listings.*, items.emailed_price as report_price,
      items.emailed_effective_monthly as report_effective_monthly
    from catcht.digest_items items
    join catcht.digest_runs runs on runs.id = items.digest_run_id
    join catcht.listings listings on listings.id = items.listing_id
    where runs.id = ${runId}::uuid and runs.user_id = ${userId}::uuid
    order by listings.offer_kind, listings.offer_role, listings.deal_score desc,
      items.emailed_price asc nulls last, items.emailed_effective_monthly asc nulls last
  `;
  return {
    ...digestReport(runs[0]),
    listings: rows.map((row) => card({
      ...row,
      price: row.report_price ?? row.price,
      effective_monthly: row.report_effective_monthly ?? row.effective_monthly,
    })),
  };
}

export async function getDigestRecipients(): Promise<UserProfile[]> {
  const sql = getDb();
  const rows = await sql`
    select * from catcht.user_profiles
    where active and digest_enabled and email is not null
    order by role, created_at
  `;
  return rows.map((row) => userProfile(row));
}

export async function getDigestCandidates(userId: string): Promise<ListingCard[]> {
  const sql = getDb();
  const allRows = await sql`
    select * from (
      select listings.*,
        coalesce(decisions.disposition, 'neutral') as user_disposition,
        matches.deal_score as user_deal_score,
        matches.manual_confidence as user_manual_confidence,
        matches.verification_status as user_verification_status,
        matches.eligibility_reason as user_eligibility_reason,
        matches.feature_match_score as user_feature_match_score,
        matches.family_fit_score as user_family_fit_score,
        matches.last_seen_at as user_last_seen_at,
        matches.last_emailed_at as user_last_emailed_at,
        matches.last_emailed_price as user_last_emailed_price,
        matches.last_emailed_effective_monthly as user_last_emailed_effective_monthly,
        searches.garage_group as user_garage_group,
        searches.powertrain_category as user_powertrain_category,
        row_number() over (
          partition by listings.id
          order by matches.deal_score desc, matches.last_seen_at desc, searches.priority desc
        ) as owner_match_rank
      from catcht.listings listings
      join catcht.listing_matches matches on matches.listing_id = listings.id
      join catcht.saved_searches searches on searches.id = matches.search_id
      left join catcht.user_listing_decisions decisions
        on decisions.user_id = ${userId}::uuid and decisions.listing_id = listings.id
      where searches.owner_id = ${userId}::uuid and searches.active
    ) owned
    where owner_match_rank = 1
    order by user_last_seen_at desc
    limit 2000
  `;
  const now = new Date();
  const rows = canonicalizeVehicleRows(asUserListingRows(allRows), now)
    .filter((row) => (row.user_disposition ?? row.disposition) === "neutral"
      && ["verified", "not_applicable"].includes(String(row.user_verification_status ?? row.verification_status))
      && (row.user_eligibility_reason ?? row.eligibility_reason) === "eligible"
      && isCurrentListingRow(row, now)
      && digestCandidateIsDue(row, now))
    .sort((left, right) => number(right.user_deal_score ?? right.deal_score) - number(left.user_deal_score ?? left.deal_score)
      || number(right.user_manual_confidence ?? right.manual_confidence) - number(left.user_manual_confidence ?? left.manual_confidence)
      || nullableNumber(left.price) - nullableNumber(right.price)
      || nullableNumber(left.effective_monthly) - nullableNumber(right.effective_monthly));
  return rows.slice(0, 12).map((row) => card(row));
}

export async function digestIsDue(userId: string, cadenceHours = 23): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    select finished_at from catcht.digest_runs
    where user_id = ${userId}::uuid and status in ('sent', 'empty') and finished_at is not null
    order by finished_at desc limit 1
  `;
  if (!rows[0]) return true;
  return Date.now() - new Date(String(rows[0].finished_at)).getTime() >= cadenceHours * 3_600_000;
}

export async function startDigestRun(userId: string, scheduledFor: string): Promise<string | null> {
  const sql = getDb();
  const existing = await sql`
    select id, status from catcht.digest_runs
    where user_id = ${userId}::uuid and scheduled_for = ${scheduledFor}::date
  `;
  if (existing[0] && ["started", "sent", "empty"].includes(String(existing[0].status))) return null;
  const rows = await sql`
    insert into catcht.digest_runs (user_id, scheduled_for, status)
    values (${userId}::uuid, ${scheduledFor}::date, 'started')
    on conflict (user_id, scheduled_for) do update
      set status = 'started', error_message = null, started_at = now(), finished_at = null
    returning id
  `;
  return String(rows[0].id);
}

export async function getDigestRunForDate(userId: string, scheduledFor: string) {
  const sql = getDb();
  const rows = await sql`
    select id, status from catcht.digest_runs
    where user_id = ${userId}::uuid and scheduled_for = ${scheduledFor}::date
    limit 1
  `;
  return rows[0]
    ? { id: String(rows[0].id), status: String(rows[0].status) }
    : null;
}

export async function stageDigestItems(runId: string, listings: ListingCard[]) {
  const sql = getDb();
  await sql.begin(async (transaction) => {
    for (const listing of listings) {
      await transaction`
        insert into catcht.digest_items (digest_run_id, listing_id, emailed_price, emailed_effective_monthly)
        values (${runId}::uuid, ${listing.id}::uuid, ${listing.price}, ${listing.effectiveMonthly})
        on conflict do nothing
      `;
    }
  });
}

export async function getDigestRunListings(runId: string): Promise<ListingCard[]> {
  const sql = getDb();
  const rows = await sql`
    select listings.*
    from catcht.digest_items items
    join catcht.listings listings on listings.id = items.listing_id
    where items.digest_run_id = ${runId}::uuid
    order by listings.deal_score desc, listings.manual_confidence desc,
             listings.price asc nulls last, listings.effective_monthly asc nulls last
  `;
  return rows.map((row) => card(row));
}

export async function finishDigestRun(
  runId: string,
  listings: ListingCard[],
  providerMessageId: string,
  sourceHealth: SourceHealth[],
) {
  const sql = getDb();
  await sql.begin(async (tx) => {
    for (const listing of listings) {
      await tx`
        insert into catcht.digest_items (digest_run_id, listing_id, emailed_price, emailed_effective_monthly)
        values (${runId}::uuid, ${listing.id}::uuid, ${listing.price}, ${listing.effectiveMonthly})
        on conflict do nothing
      `;
      await tx`
        update catcht.listing_matches matches
        set last_emailed_at = now(), last_emailed_price = ${listing.price},
            last_emailed_effective_monthly = ${listing.effectiveMonthly}, updated_at = now()
        from catcht.saved_searches searches, catcht.digest_runs runs
        where matches.search_id = searches.id
          and runs.id = ${runId}::uuid
          and searches.owner_id = runs.user_id
          and matches.listing_id = ${listing.id}::uuid
      `;
    }
    await tx`
      update catcht.digest_runs
      set status = ${listings.length ? "sent" : "empty"}, provider_message_id = ${providerMessageId},
          listing_count = ${listings.length}, source_health = ${tx.json(sourceHealth as never)},
          finished_at = now()
      where id = ${runId}::uuid
    `;
  });
}

export async function failDigestRun(runId: string, message: string) {
  const sql = getDb();
  await sql`
    update catcht.digest_runs set status = 'failed', error_message = ${message.slice(0, 1000)}, finished_at = now()
    where id = ${runId}::uuid
  `;
}

function digestReport(row: Record<string, unknown>): DigestReport {
  return {
    id: String(row.id),
    scheduledFor: dateOnly(row.scheduled_for),
    status: String(row.status) as DigestReport["status"],
    listingCount: Number(row.listing_count ?? 0),
    startedAt: new Date(String(row.started_at)).toISOString(),
    finishedAt: row.finished_at ? new Date(String(row.finished_at)).toISOString() : null,
    sourceHealth: sourceHealthSnapshot(row.source_health),
  };
}

function sourceHealthSnapshot(value: unknown): SourceHealth[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const row = candidate as Record<string, unknown>;
    const status = String(row.status);
    if (!["success", "empty", "unavailable", "challenged", "failed"].includes(status)) return [];
    return [{
      source: String(row.source ?? "Unknown source"),
      adapter: String(row.adapter ?? "unknown"),
      status: status as SourceHealth["status"],
      messageCode: row.messageCode ? String(row.messageCode) : null,
      searchedCount: Number(row.searchedCount ?? 0),
      discoveredCount: Number(row.discoveredCount ?? 0),
      acceptedCount: Number(row.acceptedCount ?? 0),
      finishedAt: row.finishedAt ? new Date(String(row.finishedAt)).toISOString() : new Date(0).toISOString(),
    }];
  });
}

function dateOnly(value: unknown) {
  const raw = String(value);
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? new Date(raw).toISOString().slice(0, 10);
}

export interface PendingVerificationCandidate {
  candidate: CandidateListing;
  rawPayload: unknown;
}

export async function getPendingVerificationCandidates(limit = 5): Promise<PendingVerificationCandidate[]> {
  const sql = getDb();
  const rows = await sql`
    select * from catcht.listings
    where offer_kind in ('used', 'new')
    order by last_seen_at desc
    limit 2000
  `;
  const now = new Date();
  return canonicalizeVehicleRows(asListingRows(rows), now)
    .filter((row) => needsManualPhotoVerification(row, now)
      && Array.isArray(row.image_urls)
      && row.image_urls.length > 0)
    .slice(0, Math.max(1, Math.min(10, limit)))
    .map((row) => ({ candidate: candidateFromRow(row), rawPayload: row.source_payload ?? {} }));
}

export async function getPersistedManualEvidence(candidate: CandidateOffer): Promise<ManualPhotoEvidence[]> {
  if (candidate.offerKind === "lease") return [];
  const sql = getDb();
  const identity = listingIdentity(candidate);
  const candidateVin = normalizeVin(candidate.vin);
  const rows = await sql`
    select evidence.image_url, evidence.shift_pattern_visible, evidence.manual_lever_visible,
           evidence.stock_style_shifter, evidence.matching_interior_likely, evidence.confidence,
           evidence.observed_pattern, evidence.notes, evidence.verifier_model
    from catcht.manual_evidence evidence
    join catcht.listings listing on listing.id = evidence.listing_id
    where listing.identity_key = ${identity}
       or (
         ${candidateVin}::text is not null
         and upper(regexp_replace(coalesce(listing.vin, ''), '[^A-Za-z0-9]', '', 'g')) = ${candidateVin}
       )
    order by evidence.confidence desc, evidence.verified_at desc
  `;
  return rows.map(evidenceFromRow);
}

export async function upsertCandidate(candidate: CandidateOffer, rawPayload: unknown) {
  const sql = getDb();
  const identity = listingIdentity(candidate);
  const searchId = candidate.searchId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.searchId)
    ? candidate.searchId
    : null;
  const policyRows = searchId ? await sql`
    select searches.*, searches.aliases || coalesce(models.aliases, '{}') as aliases
    from catcht.saved_searches searches
    left join catcht.watch_models models on models.id = searches.legacy_watch_model_id
    where searches.id = ${searchId}::uuid and searches.active
    limit 1
  ` : [];
  const evaluationPolicy = policyRows[0] ? evaluationPolicyFromRow(policyRows[0]) : undefined;
  const persistedEvidence = await getPersistedManualEvidence(candidate);
  const persistedIntelligence = await getPersistedFeatureIntelligence(identity);
  const evaluatedCandidate = mergeFeatureIntelligence({
    ...candidate,
    manualEvidence: mergeManualEvidence(candidate.manualEvidence, persistedEvidence),
  }, persistedIntelligence);
  const evaluation = searchId && !evaluationPolicy
    ? {
        eligible: false,
        reason: "search_mismatch" as const,
        score: 0,
        manualConfidence: 0,
        discountPercent: null,
        verificationStatus: "not_applicable" as const,
      }
    : evaluateOffer(evaluatedCandidate, evaluationPolicy);
  const verification = evaluatedCandidate.offerKind === "lease" || evaluation.verificationStatus === "not_applicable"
    ? { status: "not_applicable" as const, confidence: 0, evidence: null }
    : manualVerification(evaluatedCandidate as CandidateListing);
  const bestEvidence = verification.evidence;
  const offerKind = candidate.offerKind ?? "used";
  const condition = candidate.condition ?? offerKind;
  const lease = candidate.offerKind === "lease" ? candidate : null;
  const leaseEffectiveMonthly = lease?.effectiveMonthly ?? (lease ? effectiveMonthlyCost({
    monthlyPayment: lease.monthlyPayment,
    dueAtSigning: lease.dueAtSigning,
    termMonths: lease.termMonths,
    brokerFee: lease.brokerFee,
    acquisitionFee: lease.acquisitionFee,
    acquisitionFeeIncludedInDueAtSigning: lease.acquisitionFeeIncludedInDueAtSigning,
    dueAtSigningIncludesFirstPayment: lease.dueAtSigningIncludesFirstPayment ?? undefined,
    securityDeposit: lease.securityDeposit,
    securityDepositRefundable: lease.securityDepositRefundable,
  }) : null);
  const rows = await sql`
    insert into catcht.listings (
      identity_key, offer_kind, offer_role, source_method, vehicle_condition, source, origin_source, source_listing_id,
      search_id, url, vin, year, make, model, trim, title,
      price, mileage, distance_miles, location, transmission_claim, image_urls,
      primary_image_url, market_estimate, manual_verified, verification_status, manual_confidence, deal_score,
      eligibility_reason, source_payload, seller_name, monthly_payment, due_at_signing,
      due_at_signing_includes_first_payment, acquisition_fee_included_in_due_at_signing,
      term_months, annual_miles, broker_fee,
      acquisition_fee, disposition_fee, security_deposit, security_deposit_refundable, msrp, money_factor,
      residual_percent, discount_percent, taxes_included, effective_monthly, region,
      parse_confidence, published_at, expires_at
      , garage_group, powertrain_category, body_style, seating_capacity, package_names,
      feature_evidence, feature_match_score, family_fit_score, days_on_market, price_change,
      one_owner, clean_title, exterior_color, interior_color, enrichment_status, safety_evidence
    ) values (
      ${identity}, ${offerKind}, ${candidate.offerRole ?? "active_offer"}, ${candidate.sourceMethod ?? "api"},
      ${condition}, ${candidate.source}, ${candidate.originSource ?? null},
      ${candidate.sourceListingId ?? null}, ${searchId}, ${candidate.url},
      ${candidate.vin ?? null}, ${candidate.year ?? null}, ${candidate.make}, ${candidate.model},
      ${candidate.trim ?? null}, ${candidate.title}, ${candidate.price ?? null}, ${candidate.mileage ?? null},
      ${candidate.distanceMiles ?? null}, ${candidate.location}, ${candidate.transmissionClaim ?? null},
      ${candidate.imageUrls}, ${candidate.primaryImageUrl ?? null}, ${candidate.marketEstimate ?? null},
      ${verification.status === "verified"}, ${verification.status}, ${evaluation.manualConfidence}, ${evaluation.score}, ${evaluation.reason},
      ${sql.json(rawPayload as never)}, ${candidate.sellerName ?? null}, ${lease?.monthlyPayment ?? null},
      ${lease?.dueAtSigning ?? null}, ${lease?.dueAtSigningIncludesFirstPayment ?? null},
      ${lease?.acquisitionFeeIncludedInDueAtSigning ?? null}, ${lease?.termMonths ?? null},
      ${lease?.annualMiles ?? null}, ${lease?.brokerFee ?? null},
      ${lease?.acquisitionFee ?? null}, ${lease?.dispositionFee ?? null}, ${lease?.securityDeposit ?? null},
      ${lease?.securityDepositRefundable ?? null},
      ${candidate.msrp ?? null}, ${lease?.moneyFactor ?? null}, ${lease?.residualPercent ?? null},
      ${evaluation.discountPercent}, ${lease?.taxesIncluded ?? null}, ${leaseEffectiveMonthly},
      ${lease?.region ?? null}, ${candidate.parseConfidence ?? 1}, ${lease?.publishedAt ?? null},
      ${candidate.expiresAt ?? null}
      , ${candidate.garageGroup ?? "other"}, ${candidate.powertrainCategory ?? "any"},
      ${candidate.bodyStyle ?? null}, ${candidate.seatingCapacity ?? null}, ${evaluatedCandidate.packageNames ?? []},
      ${sql.json((evaluatedCandidate.featureEvidence ?? []) as never)}, ${evaluatedCandidate.featureMatchScore ?? 0},
      ${evaluatedCandidate.familyFitScore ?? 0}, ${candidate.daysOnMarket ?? null}, ${candidate.priceChange ?? null},
      ${candidate.oneOwner ?? null}, ${candidate.cleanTitle ?? null}, ${candidate.exteriorColor ?? null},
      ${candidate.interiorColor ?? null}, ${evaluatedCandidate.enrichmentStatus ?? "not_requested"},
      ${candidate.safetyEvidence ? sql.json(candidate.safetyEvidence as never) : null}
    )
    on conflict (identity_key) do update set
      offer_kind = excluded.offer_kind, offer_role = excluded.offer_role,
      source_method = excluded.source_method, vehicle_condition = excluded.vehicle_condition,
      source = excluded.source, origin_source = excluded.origin_source, search_id = excluded.search_id,
      url = excluded.url, price = excluded.price, mileage = excluded.mileage,
      distance_miles = excluded.distance_miles, location = excluded.location,
      transmission_claim = excluded.transmission_claim, image_urls = excluded.image_urls,
      primary_image_url = excluded.primary_image_url, market_estimate = excluded.market_estimate,
      manual_verified = excluded.manual_verified, verification_status = excluded.verification_status,
      manual_confidence = excluded.manual_confidence,
      deal_score = excluded.deal_score, eligibility_reason = excluded.eligibility_reason,
      source_payload = excluded.source_payload, seller_name = excluded.seller_name,
      monthly_payment = excluded.monthly_payment, due_at_signing = excluded.due_at_signing,
      due_at_signing_includes_first_payment = excluded.due_at_signing_includes_first_payment,
      acquisition_fee_included_in_due_at_signing = excluded.acquisition_fee_included_in_due_at_signing,
      term_months = excluded.term_months, annual_miles = excluded.annual_miles,
      broker_fee = excluded.broker_fee, acquisition_fee = excluded.acquisition_fee,
      disposition_fee = excluded.disposition_fee, security_deposit = excluded.security_deposit,
      security_deposit_refundable = excluded.security_deposit_refundable, msrp = excluded.msrp,
      money_factor = excluded.money_factor, residual_percent = excluded.residual_percent,
      discount_percent = excluded.discount_percent, taxes_included = excluded.taxes_included,
      effective_monthly = excluded.effective_monthly, region = excluded.region,
      parse_confidence = excluded.parse_confidence, published_at = excluded.published_at,
      expires_at = excluded.expires_at,
      garage_group = excluded.garage_group, powertrain_category = excluded.powertrain_category,
      body_style = excluded.body_style, seating_capacity = excluded.seating_capacity,
      package_names = excluded.package_names, feature_evidence = excluded.feature_evidence,
      feature_match_score = excluded.feature_match_score, family_fit_score = excluded.family_fit_score,
      days_on_market = excluded.days_on_market, price_change = excluded.price_change,
      one_owner = excluded.one_owner, clean_title = excluded.clean_title,
      exterior_color = excluded.exterior_color, interior_color = excluded.interior_color,
      enrichment_status = excluded.enrichment_status, safety_evidence = excluded.safety_evidence,
      last_seen_at = now(), updated_at = now()
    returning id
  `;
  const listingId = String(rows[0].id);
  if (searchId && evaluationPolicy) {
    await sql`
      insert into catcht.listing_matches (
        listing_id, search_id, deal_score, manual_confidence, verification_status,
        eligibility_reason, feature_match_score, family_fit_score
      ) values (
        ${listingId}::uuid, ${searchId}::uuid, ${evaluation.score}, ${evaluation.manualConfidence},
        ${verification.status}, ${evaluation.reason}, ${evaluatedCandidate.featureMatchScore ?? 0},
        ${evaluatedCandidate.familyFitScore ?? 0}
      )
      on conflict (listing_id, search_id) do update set
        deal_score = excluded.deal_score,
        manual_confidence = excluded.manual_confidence,
        verification_status = excluded.verification_status,
        eligibility_reason = excluded.eligibility_reason,
        feature_match_score = excluded.feature_match_score,
        family_fit_score = excluded.family_fit_score,
        last_seen_at = now(), updated_at = now()
    `;
  }
  if (candidate.offerKind !== "lease") {
    for (const evidence of evaluatedCandidate.manualEvidence) await saveEvidence(listingId, evidence);
  }
  return { listingId, identity, evaluation, verification, bestEvidence };
}

type ListingRow = Record<string, unknown> & { identity_key: unknown };

function asListingRows(rows: Iterable<Record<string, unknown>>): ListingRow[] {
  return [...rows].filter((row): row is ListingRow => row.identity_key !== null && row.identity_key !== undefined);
}

function asUserListingRows(rows: Iterable<Record<string, unknown>>): ListingRow[] {
  return asListingRows(rows).map((row) => ({
    ...row,
    disposition: row.user_disposition ?? row.disposition,
    deal_score: row.user_deal_score ?? row.deal_score,
    manual_confidence: row.user_manual_confidence ?? row.manual_confidence,
    verification_status: row.user_verification_status ?? row.verification_status,
    eligibility_reason: row.user_eligibility_reason ?? row.eligibility_reason,
    feature_match_score: row.user_feature_match_score ?? row.feature_match_score,
    family_fit_score: row.user_family_fit_score ?? row.family_fit_score,
    garage_group: row.user_garage_group ?? row.garage_group,
    powertrain_category: row.user_powertrain_category ?? row.powertrain_category,
    last_seen_at: row.user_last_seen_at ?? row.last_seen_at,
    last_emailed_at: row.user_last_emailed_at ?? row.last_emailed_at,
    last_emailed_price: row.user_last_emailed_price ?? row.last_emailed_price,
    last_emailed_effective_monthly: row.user_last_emailed_effective_monthly ?? row.last_emailed_effective_monthly,
  }));
}

function candidateFromRow(row: ListingRow): CandidateListing {
  const imageUrls = Array.isArray(row.image_urls) ? row.image_urls.map(String) : [];
  return {
    offerKind: row.offer_kind === "new" ? "new" : "used",
    condition: (row.vehicle_condition ?? row.offer_kind ?? "used") as VehicleCondition,
    source: String(row.source) as CandidateListing["source"],
    originSource: row.origin_source ? String(row.origin_source) : null,
    sourceListingId: row.source_listing_id ? String(row.source_listing_id) : null,
    searchId: row.search_id ? String(row.search_id) : null,
    url: String(row.url),
    vin: row.vin ? String(row.vin) : null,
    year: requiredNumber(row.year, "year"),
    make: String(row.make),
    model: String(row.model),
    trim: row.trim ? String(row.trim) : null,
    title: String(row.title),
    price: requiredNumber(row.price, "price"),
    mileage: requiredNumber(row.mileage, "mileage"),
    distanceMiles: requiredNumber(row.distance_miles, "distance_miles"),
    location: String(row.location),
    transmissionClaim: row.transmission_claim ? String(row.transmission_claim) : null,
    imageUrls,
    primaryImageUrl: row.primary_image_url ? String(row.primary_image_url) : imageUrls[0] ?? null,
    marketEstimate: row.market_estimate === null || row.market_estimate === undefined ? null : Number(row.market_estimate),
    msrp: row.msrp === null || row.msrp === undefined ? null : Number(row.msrp),
    sellerName: row.seller_name ? String(row.seller_name) : null,
    requiresManualVerification: true,
    parseConfidence: row.parse_confidence === null || row.parse_confidence === undefined ? 1 : Number(row.parse_confidence),
    expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
    garageGroup: (row.garage_group ?? "other") as GarageGroup,
    powertrainCategory: (row.powertrain_category ?? "any") as PowertrainCategory,
    bodyStyle: row.body_style ? String(row.body_style) : null,
    seatingCapacity: row.seating_capacity === null || row.seating_capacity === undefined ? null : Number(row.seating_capacity),
    packageNames: Array.isArray(row.package_names) ? row.package_names.map(String) : [],
    featureEvidence: featureEvidenceFromRow(row.feature_evidence),
    featureMatchScore: Number(row.feature_match_score ?? 0),
    familyFitScore: Number(row.family_fit_score ?? 0),
    daysOnMarket: row.days_on_market === null || row.days_on_market === undefined ? null : Number(row.days_on_market),
    priceChange: row.price_change === null || row.price_change === undefined ? null : Number(row.price_change),
    oneOwner: row.one_owner === null || row.one_owner === undefined ? null : Boolean(row.one_owner),
    cleanTitle: row.clean_title === null || row.clean_title === undefined ? null : Boolean(row.clean_title),
    exteriorColor: row.exterior_color ? String(row.exterior_color) : null,
    interiorColor: row.interior_color ? String(row.interior_color) : null,
    enrichmentStatus: (row.enrichment_status ?? "not_requested") as EnrichmentStatus,
    safetyEvidence: parseSafetyEvidence(row.safety_evidence),
    manualEvidence: [],
  };
}

function evidenceFromRow(row: Record<string, unknown>): ManualPhotoEvidence {
  return {
    imageUrl: String(row.image_url),
    shiftPatternVisible: Boolean(row.shift_pattern_visible),
    manualLeverVisible: Boolean(row.manual_lever_visible),
    stockStyleShifter: Boolean(row.stock_style_shifter),
    matchingInteriorLikely: Boolean(row.matching_interior_likely),
    confidence: Number(row.confidence),
    observedPattern: row.observed_pattern ? String(row.observed_pattern) : null,
    notes: String(row.notes ?? ""),
    verifierModel: row.verifier_model ? String(row.verifier_model) : undefined,
  };
}

function digestCandidateIsDue(row: ListingRow, now: Date) {
  const lastEmailedAt = row.user_last_emailed_at ?? row.last_emailed_at;
  if (!lastEmailedAt) return true;
  if (timestamp(lastEmailedAt) <= now.getTime() - 14 * 86_400_000) return true;
  const price = nullableNumber(row.price);
  const lastPrice = nullableNumber(row.user_last_emailed_price ?? row.last_emailed_price);
  if (Number.isFinite(price) && Number.isFinite(lastPrice) && (price <= lastPrice - 750 || price <= lastPrice * 0.95)) return true;
  const monthly = nullableNumber(row.effective_monthly);
  const lastMonthly = nullableNumber(row.user_last_emailed_effective_monthly ?? row.last_emailed_effective_monthly);
  return Number.isFinite(monthly) && Number.isFinite(lastMonthly) && monthly <= lastMonthly * 0.95;
}

function requiredNumber(value: unknown, field: string) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`pending verification row is missing ${field}`);
  return result;
}

function number(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return Number.POSITIVE_INFINITY;
  const result = Number(value);
  return Number.isFinite(result) ? result : Number.POSITIVE_INFINITY;
}

function timestamp(value: unknown) {
  const result = new Date(String(value)).getTime();
  return Number.isFinite(result) ? result : 0;
}

function evaluationPolicyFromRow(row: Record<string, unknown>): OfferEvaluationPolicy {
  return {
    offerKind: row.offer_kind as OfferKind,
    make: String(row.make),
    model: String(row.model),
    trim: row.trim ? String(row.trim) : null,
    aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
    trimAliases: Array.isArray(row.trim_aliases) ? row.trim_aliases.map(String) : [],
    bodyStyle: row.body_style ? String(row.body_style) : null,
    transmission: row.transmission as OfferEvaluationPolicy["transmission"],
    radiusMiles: row.radius_miles === null ? null : Number(row.radius_miles),
    maxPrice: row.max_price === null ? null : Number(row.max_price),
    maxMileage: row.max_mileage === null ? null : Number(row.max_mileage),
    region: row.region ? String(row.region) : null,
    maxEffectiveMonthly: row.max_effective_monthly === null ? null : Number(row.max_effective_monthly),
    maxDueAtSigning: row.max_due_at_signing === null ? null : Number(row.max_due_at_signing),
    minAnnualMiles: row.min_annual_miles === null ? null : Number(row.min_annual_miles),
    yearMin: row.year_min === null || row.year_min === undefined ? null : Number(row.year_min),
    yearMax: row.year_max === null || row.year_max === undefined ? null : Number(row.year_max),
    targetPrice: row.target_price === null || row.target_price === undefined ? null : Number(row.target_price),
    desiredFeatures: Array.isArray(row.desired_features) ? row.desired_features.map(String) as VehicleFeatureKey[] : [],
    requiredFeatures: Array.isArray(row.required_features) ? row.required_features.map(String) as VehicleFeatureKey[] : [],
  };
}

const ENRICHMENT_STATUSES = ["not_requested", "enriched", "budget_deferred", "unavailable", "failed"] as const;

async function getPersistedFeatureIntelligence(identity: string): Promise<PersistedFeatureIntelligence | null> {
  const sql = getDb();
  const rows = await sql`
    select feature_evidence, package_names, enrichment_status
    from catcht.listings where identity_key = ${identity} limit 1
  `;
  if (!rows[0]) return null;
  const status = String(rows[0].enrichment_status ?? "not_requested");
  return {
    featureEvidence: featureEvidenceFromRow(rows[0].feature_evidence),
    packageNames: Array.isArray(rows[0].package_names) ? rows[0].package_names.map(String) : [],
    enrichmentStatus: (ENRICHMENT_STATUSES as readonly string[]).includes(status)
      ? (status as PersistedFeatureIntelligence["enrichmentStatus"])
      : "not_requested",
  };
}

// Source listing IDs whose metered provider detail is already persisted, so the collector can
// spend its daily detail budget on listings that still need evidence. Opaque provider IDs only.
export async function getEnrichedListingIds(): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    select source_listing_id from catcht.listings
    where source = 'marketcheck' and enrichment_status = 'enriched'
      and source_listing_id is not null and (expires_at is null or expires_at > now())
    order by last_seen_at desc
    limit 2000
  `;
  return rows.map((row) => String(row.source_listing_id));
}

function featureEvidenceFromRow(value: unknown): VehicleFeatureEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is VehicleFeatureEvidence => Boolean(
    entry
    && typeof entry === "object"
    && "key" in entry
    && "label" in entry
    && "status" in entry
    && "source" in entry
    && "evidence" in entry,
  ));
}

async function saveEvidence(listingId: string, evidence: ManualPhotoEvidence) {
  const sql = getDb();
  await sql`
    insert into catcht.manual_evidence (
      listing_id, image_url, shift_pattern_visible, manual_lever_visible, stock_style_shifter,
      matching_interior_likely, confidence, observed_pattern, notes, verifier_model, raw_result
    ) values (
      ${listingId}::uuid, ${evidence.imageUrl}, ${evidence.shiftPatternVisible},
      ${evidence.manualLeverVisible}, ${evidence.stockStyleShifter},
      ${evidence.matchingInteriorLikely}, ${evidence.confidence}, ${evidence.observedPattern},
      ${evidence.notes}, ${evidence.verifierModel ?? process.env.OPENAI_VISION_MODEL ?? "gpt-5.4-mini"}, ${getDb().json(evidence as never)}
    ) on conflict (listing_id, image_url) do update set
      shift_pattern_visible = excluded.shift_pattern_visible,
      manual_lever_visible = excluded.manual_lever_visible,
      stock_style_shifter = excluded.stock_style_shifter,
      matching_interior_likely = excluded.matching_interior_likely,
      confidence = excluded.confidence, observed_pattern = excluded.observed_pattern,
      notes = excluded.notes, raw_result = excluded.raw_result, verified_at = now()
  `;
}

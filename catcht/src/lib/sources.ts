import { SEARCH_POLICY } from "./search-policy";

export const SOURCE_SEARCHES = [
  {
    source: "autotempest",
    label: "AutoTempest (primary discovery)",
    url: `https://www.autotempest.com/results?zip=${SEARCH_POLICY.centerZip}&radius=${SEARCH_POLICY.maxDistanceMiles}&maxprice=${SEARCH_POLICY.maxPrice}&maxmiles=${SEARCH_POLICY.maxMileage}&transmission=man`,
  },
  {
    source: "cargurus",
    label: "CarGurus",
    url: `https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?zip=${SEARCH_POLICY.centerZip}&distance=${SEARCH_POLICY.maxDistanceMiles}&maxPrice=${SEARCH_POLICY.maxPrice}&maxMileage=${SEARCH_POLICY.maxMileage}&transmission=M`,
  },
  {
    source: "autotrader",
    label: "AutoTrader",
    url: `https://www.autotrader.com/cars-for-sale/all-cars?zip=${SEARCH_POLICY.centerZip}&maxPrice=${SEARCH_POLICY.maxPrice}&mileage=${SEARCH_POLICY.maxMileage}&searchRadius=${SEARCH_POLICY.maxDistanceMiles}&transmissionCode=MAN`,
  },
  {
    source: "cars.com",
    label: "Cars.com",
    url: `https://www.cars.com/shopping/results/?maximum_distance=${SEARCH_POLICY.maxDistanceMiles}&zip=${SEARCH_POLICY.centerZip}&list_price_max=${SEARCH_POLICY.maxPrice}&mileage_max=${SEARCH_POLICY.maxMileage}&transmission_slugs[]=manual`,
  },
  {
    source: "facebook",
    label: "Facebook Marketplace (future authenticated adapter)",
    url: "https://www.facebook.com/marketplace/108164415873172/vehicles",
  },
  {
    source: "hemmings",
    label: "Hemmings",
    url: "https://www.hemmings.com/classifieds/cars-for-sale",
  },
  {
    source: "craigslist",
    label: "Craigslist via SearchTempest",
    url: `https://www.searchtempest.com/search?category=8&subcat=cta&cityselect=zip&zip=${SEARCH_POLICY.centerZip}&maxDist=${SEARCH_POLICY.maxDistanceMiles}`,
  },
] as const;

export const WATCHED_SEARCH_TERMS = ["Mazda MX-5 Miata", "Subaru BRZ", "Scion FR-S", "Honda Civic Si"];

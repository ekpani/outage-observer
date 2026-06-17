// Region-relevant alerting. Coarse geographies users can pick from. Region data
// is only reliably structured for GCP (affected_locations) and AWS (region_name);
// every other provider yields [] → treated as global/unknown → always alert
// (fail-safe: we never suppress a global or unparseable incident).

export const GEOS = ["na", "sa", "eu", "apac", "me", "af", "oce"] as const;
export type Geo = (typeof GEOS)[number];

export const GEO_LABEL: Record<Geo, string> = {
  na: "North America",
  sa: "South America",
  eu: "Europe",
  apac: "Asia-Pacific",
  me: "Middle East",
  af: "Africa",
  oce: "Oceania",
};

const GEO_SET = new Set<string>(GEOS);
export function isGeo(s: string): s is Geo {
  return GEO_SET.has(s);
}

/** Map a cloud region code or location label ("Delhi (asia-south2)", "us-east-1",
 *  "Global") to a coarse geo, "global", or null when we can't tell. Order matters:
 *  Oceania before APAC (Sydney is ap-southeast-2), Europe's `eu-` before NA. */
export function geoForLocation(raw: string): Geo | "global" | null {
  const s = String(raw).toLowerCase();
  if (!s) return null;
  if (/\bglobal\b|\ball\b|multi-?region|worldwide|everywhere/.test(s)) return "global";
  if (/australia|oceania|new ?zealand|\bnz\b|sydney|melbourne|australia-southeast|ap-southeast-[24]\b/.test(s)) return "oce";
  if (/\beu\b|eu-|europe|ireland|frankfurt|london|paris|netherlands|belgium|finland|milan|zurich|madrid|warsaw|stockholm/.test(s)) return "eu";
  if (/africa|af-|johannesburg|cape ?town/.test(s)) return "af";
  if (/middle.?east|\bme-|bahrain|\buae\b|dubai|tel.?aviv|israel|qatar|dammam|riyadh/.test(s)) return "me";
  if (/south.?america|\bsa-|southamerica|brazil|s[ãa]o ?paulo|santiago|chile|bogot/.test(s)) return "sa";
  if (/\basia\b|asia-|ap-|\bindia\b|delhi|mumbai|chennai|bangalore|hyderabad|singapore|tokyo|osaka|seoul|jakarta|hong ?kong|taiwan/.test(s)) return "apac";
  if (/north.?america|\bus-|us-|northamerica|canada|ca-central|montreal|iowa|virginia|oregon|ohio|california|\bus\b/.test(s)) return "na";
  return null;
}

/** Normalize raw location labels into a set of geos (may include "global").
 *  Empty result = unknown scope → caller treats as always-alert. */
export function geosFromLocations(raw: string[]): string[] {
  const out = new Set<string>();
  for (const r of raw) {
    const g = geoForLocation(r);
    if (g) out.add(g);
  }
  return [...out];
}

/** Fail-safe alerting decision: should a subscriber whose chosen geos are `prefs`
 *  (empty = all regions) be alerted about an incident affecting `regions`?
 *   - prefs empty → yes (default).
 *   - regions empty/unknown, or includes "global" → yes (never suppress those).
 *   - else → only if prefs intersect regions. */
export function shouldAlert(prefs: string[], regions: string[]): boolean {
  if (!prefs.length) return true;
  if (!regions.length || regions.includes("global")) return true;
  return regions.some((r) => prefs.includes(r));
}

/** Parse a stored comma-joined region preference into a clean geo list. */
export function parsePrefs(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(isGeo);
}

/** Human label for a region list, e.g. "Europe, Asia-Pacific" (or "Global"). */
export function regionLabel(regions: string[]): string {
  if (!regions.length) return "";
  if (regions.includes("global")) return "Global";
  return regions.map((r) => (isGeo(r) ? GEO_LABEL[r] : r)).join(", ");
}

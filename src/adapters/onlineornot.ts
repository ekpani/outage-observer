import type { Level, ProviderStatus } from "./types";

// OnlineOrNot's overall-status banner is a Tailwind bg-colour token plus a
// headline. We map from the headline text first (semantic), falling back to
// the colour if the wording is unfamiliar.
const COLOR_LEVEL: Record<string, Level> = {
  green: "operational",
  yellow: "degraded",
  amber: "degraded",
  orange: "partial_outage",
  red: "major_outage",
  blue: "maintenance",
};

// OnlineOrNot's documented overall-status set (from their API enum):
// ALL_SYSTEMS_OPERATIONAL, PARTIALLY_DEGRADED_SERVICE, MINOR_SERVICE_OUTAGE,
// MAJOR_SYSTEM_OUTAGE, SERVICE_UNDER_MAINTENANCE. Order matters: check the
// unambiguous words first so "Partially Degraded" isn't caught by "partial".
function textLevel(s: string): Level | null {
  const t = s.toLowerCase();
  if (t.includes("operational")) return "operational";
  if (t.includes("maintenance")) return "maintenance";
  if (t.includes("major")) return "major_outage";
  if (t.includes("minor") && t.includes("outage")) return "partial_outage";
  if (t.includes("degraded") || t.includes("partial")) return "degraded";
  if (t.includes("outage")) return "partial_outage";
  return null;
}

/** OnlineOrNot (onlineornot.com) status pages expose no JSON API; the overall
 *  status is the coloured banner at the top of the page. We read the banner
 *  headline and its bg-colour class and reconcile them (text wins, colour is
 *  the fallback). Incident history comes from the RSS feed (see incidents.ts). */
export async function fetchOnlineOrNot(base: string): Promise<ProviderStatus> {
  const res = await fetch(base, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 30, cacheEverything: true },
    signal: AbortSignal.timeout(8000),   // a hung provider must not stall the tick
  });
  if (!res.ok) {
    return { level: "unknown", description: `HTTP ${res.status}`, incidents: [] };
  }
  const html = await res.text();
  const m = /bg-(\w+)-\d00[\s\S]{0,600}?<p[^>]*\btext-lg\b[^>]*>([^<]+)<\/p>/.exec(html);
  const text = (m?.[2] ?? "").trim();
  const level = textLevel(text) ?? (m?.[1] ? COLOR_LEVEL[m[1]] : undefined) ?? "unknown";
  return { level, description: text || "Unknown", incidents: [] };
}

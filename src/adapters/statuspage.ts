import type { Incident, Level, ProviderStatus } from "./types";
import { SEVERITY } from "./types";

const IMPACTFUL = new Set(["minor", "major", "critical"]);

/** Atlassian Statuspage: GET {base}/api/v2/summary.json
 *
 *  Note on "minor": Statuspage rolls per-component statuses up into the overall
 *  indicator, so providers with many granular components sit at "minor" almost
 *  permanently. Cloudflare is the worst case: ~330 edge locations, routinely a
 *  few under maintenance, which rolls up to "minor" with dozens of degraded
 *  components but no real incident. So "minor" alone is routine noise →
 *  operational. major / critical reflect through, since those are real.
 *
 *  Note on the indicator vs incidents: some providers leave the overall
 *  indicator green ("none") while a real incident is still OPEN — e.g. Anthropic
 *  keeps "All Systems Operational" while an incident suspending access to
 *  specific models is in "monitoring". Trusting the indicator alone made us fire
 *  a false "recovered" while that incident was still open. So an open incident
 *  with real impact keeps a provider off operational until it actually
 *  resolves. */
export async function fetchStatuspage(base: string): Promise<ProviderStatus> {
  const res = await fetch(`${base}/api/v2/summary.json`, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 30, cacheEverything: true },
    signal: AbortSignal.timeout(8000),   // a hung provider must not stall the tick

  });
  if (!res.ok) {
    return { level: "unknown", description: `HTTP ${res.status}`, incidents: [] };
  }

  const data = await res.json<any>();
  const indicator: string = data?.status?.indicator ?? "none";
  const openIncidents: any[] = Array.isArray(data?.incidents) ? data.incidents : [];

  // Start from the overall indicator. "minor" alone is routine component-rollup
  // noise (see header), so it does not pull a provider off operational by itself;
  // major / critical are real and reflect through. Scheduled maintenance is not
  // rolled into the indicator and is intentionally ignored.
  let level: Level = "operational";
  const bump = (l: Level) => { if (SEVERITY[l] > SEVERITY[level]) level = l; };
  if (indicator === "major") bump("partial_outage");
  else if (indicator === "critical") bump("major_outage");

  // An OPEN incident with real impact (minor/major/critical, ignoring
  // maintenance/none notices) keeps the provider off operational until it
  // resolves, even when the headline indicator stays green — so a still-open
  // incident never reads as a recovery. Capped at degraded; a genuine outage
  // raises the level through the indicator above.
  const hasOpenImpact = openIncidents.some((i) => IMPACTFUL.has(String(i?.impact)));
  if (hasOpenImpact) bump("degraded");

  const incidents: Incident[] = openIncidents.map((i: any) => ({
    name: String(i?.name ?? "Incident"),
    impact: String(i?.impact ?? "none"),
    status: String(i?.status ?? "investigating"),
    url: i?.shortlink ? String(i.shortlink) : undefined,
  }));

  // When an incident is driving the level, surface its name instead of the
  // provider's "All Systems Operational" headline (which would contradict it).
  const description = level === "operational"
    ? String(data?.status?.description ?? "")
    : (incidents.find((i) => IMPACTFUL.has(i.impact))?.name ?? String(data?.status?.description ?? ""));

  return { level, description, incidents };
}

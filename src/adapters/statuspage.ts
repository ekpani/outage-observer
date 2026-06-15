import type { Incident, Level, ProviderStatus } from "./types";

/** Atlassian Statuspage: GET {base}/api/v2/summary.json
 *
 *  Note on "minor": Statuspage rolls per-component statuses up into the overall
 *  indicator, so providers with many granular components sit at "minor" almost
 *  permanently. Cloudflare is the worst case: ~330 edge locations, routinely a
 *  few under maintenance, which rolls up to "minor" with dozens of degraded
 *  components but no real incident. So we only treat "minor" as degraded when
 *  there is an actual open incident; otherwise it's routine noise → operational.
 *  major / critical always reflect through, since those are real. */
export async function fetchStatuspage(base: string): Promise<ProviderStatus> {
  const res = await fetch(`${base}/api/v2/summary.json`, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 30, cacheEverything: true },
  });
  if (!res.ok) {
    return { level: "unknown", description: `HTTP ${res.status}`, incidents: [] };
  }

  const data = await res.json<any>();
  const indicator: string = data?.status?.indicator ?? "none";
  const openIncidents: any[] = Array.isArray(data?.incidents) ? data.incidents : [];

  // Scheduled maintenance is NOT rolled into the status. Big providers run
  // rolling per-datacenter maintenance almost constantly (Cloudflare lists ~10
  // at a time), so surfacing it as "maintenance" is pure noise and reads as a
  // problem when there isn't one. A maintenance that actually impacts service
  // shows through the indicator / an open incident instead.
  let level: Level;
  if (indicator === "minor") {
    // "minor" with no open incident is routine component/edge noise → operational.
    level = openIncidents.length > 0 ? "degraded" : "operational";
  } else if (indicator === "major") {
    level = "partial_outage";
  } else if (indicator === "critical") {
    level = "major_outage";
  } else {
    level = "operational";
  }

  const incidents: Incident[] = openIncidents.map((i: any) => ({
    name: String(i?.name ?? "Incident"),
    impact: String(i?.impact ?? "none"),
    status: String(i?.status ?? "investigating"),
    url: i?.shortlink ? String(i.shortlink) : undefined,
  }));

  return {
    level,
    description: String(data?.status?.description ?? ""),
    incidents,
  };
}

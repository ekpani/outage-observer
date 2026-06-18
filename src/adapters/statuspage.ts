import type { Incident, Level, ProviderStatus } from "./types";

/** Atlassian Statuspage: GET {base}/api/v2/summary.json
 *
 *  We follow the provider's own overall indicator for the level:
 *
 *  - "minor": Statuspage rolls per-component statuses up into the overall
 *    indicator, so providers with many granular components sit at "minor" almost
 *    permanently. Cloudflare is the worst case: ~330 edge locations, routinely a
 *    few under maintenance, which rolls up to "minor" with dozens of degraded
 *    components but no real incident. So "minor" is only "degraded" when there's
 *    an actual open incident; otherwise it's routine noise → operational.
 *  - major / critical always reflect through, since those are real.
 *  - "none" is operational, even if an incident is still OPEN. Some providers
 *    keep the headline green during a contained incident — e.g. Anthropic leaves
 *    "All Systems Operational" up while access to specific models is suspended.
 *    We respect that headline rather than overstate it as an outage; the open
 *    incident is surfaced downstream as an "ongoing" note (see toEntry) and does
 *    not trigger a recovery alert. */
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

  let level: Level;
  if (indicator === "minor") {
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

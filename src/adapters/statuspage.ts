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
  const inMaintenance = (data?.scheduled_maintenances ?? []).some(
    (m: any) => m?.status === "in_progress",
  );

  let level: Level;
  if (indicator === "minor") {
    level = openIncidents.length > 0 ? "degraded" : inMaintenance ? "maintenance" : "operational";
  } else if (indicator === "major") {
    level = "partial_outage";
  } else if (indicator === "critical") {
    level = "major_outage";
  } else {
    // "none" (or anything unrecognized) is operational, unless mid-maintenance.
    level = inMaintenance ? "maintenance" : "operational";
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

import { SEVERITY, type Incident, type Level, type ProviderStatus } from "./types";

const SEVERITY_TO_LEVEL: Record<string, Level> = {
  high: "major_outage",
  medium: "partial_outage",
  low: "degraded",
};

/** Google Cloud: GET https://status.cloud.google.com/incidents.json
 *  Returns recent incidents; one is ongoing while it has no `end` field. */
export async function fetchGcp(url: string): Promise<ProviderStatus> {
  const res = await fetch(url, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 30, cacheEverything: true },
  });
  if (!res.ok) return { level: "unknown", description: `HTTP ${res.status}`, incidents: [] };

  const data = await res.json<any>();
  const ongoing = (Array.isArray(data) ? data : []).filter((i: any) => !i?.end);
  if (ongoing.length === 0) {
    return { level: "operational", description: "All services available", incidents: [] };
  }

  let worst: Level = "degraded";
  for (const i of ongoing) {
    const lvl = SEVERITY_TO_LEVEL[String(i?.severity)] ?? "degraded";
    if (SEVERITY[lvl] > SEVERITY[worst]) worst = lvl;
  }
  const incidents: Incident[] = ongoing.map((i: any) => ({
    name: String(i?.external_desc ?? "Service incident"),
    impact: String(i?.severity ?? ""),
    status: "ongoing",
    url: i?.uri ? `https://status.cloud.google.com/${i.uri}` : undefined,
  }));
  return { level: worst, description: incidents[0]?.name ?? "Service incident", incidents };
}

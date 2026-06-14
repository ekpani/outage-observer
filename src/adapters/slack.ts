import { SEVERITY, type Incident, type Level, type ProviderStatus } from "./types";

const TYPE_TO_LEVEL: Record<string, Level> = {
  outage: "major_outage",
  incident: "partial_outage",
  maintenance: "maintenance",
  notice: "degraded",
};

/** Slack status API: GET https://slack-status.com/api/v2.0.0/current
 *  { status: "ok" | "active", active_incidents: [{ title, type, status, url }] } */
export async function fetchSlack(url: string): Promise<ProviderStatus> {
  const res = await fetch(url, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 30, cacheEverything: true },
  });
  if (!res.ok) return { level: "unknown", description: `HTTP ${res.status}`, incidents: [] };

  const data = await res.json<any>();
  const active = Array.isArray(data?.active_incidents) ? data.active_incidents : [];
  if (data?.status === "ok" || active.length === 0) {
    return { level: "operational", description: "All systems operational", incidents: [] };
  }

  let worst: Level = "degraded";
  for (const i of active) {
    const lvl = TYPE_TO_LEVEL[String(i?.type)] ?? "degraded";
    if (SEVERITY[lvl] > SEVERITY[worst]) worst = lvl;
  }
  const incidents: Incident[] = active.map((i: any) => ({
    name: String(i?.title ?? "Incident"),
    impact: String(i?.type ?? ""),
    status: String(i?.status ?? "active"),
    url: i?.url ? String(i.url) : undefined,
  }));
  return { level: worst, description: incidents[0]?.name ?? "Active incident", incidents };
}

import type { Incident, Level, ProviderStatus } from "./types";

// Status.io status_code -> our level. Their scale: 100 Operational,
// 200 Planned Maintenance, 300 Degraded Performance, 400 Partial Service
// Disruption, 500 Service Disruption, 600 Security Event.
const STATUSIO_LEVEL: Record<number, Level> = {
  100: "operational",
  200: "maintenance",
  300: "degraded",
  400: "partial_outage",
  500: "major_outage",
  600: "major_outage",
};

/** Status.io: GET https://api.status.io/1.0/status/<pageId> (the catalog url is
 *  that full endpoint). `result.status_overall` is the headline level;
 *  `result.incidents` holds any active (unresolved) incidents. */
export async function fetchStatusio(url: string): Promise<ProviderStatus> {
  const res = await fetch(url, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 30, cacheEverything: true },
    signal: AbortSignal.timeout(8000),   // a hung provider must not stall the tick
  });
  if (!res.ok) {
    return { level: "unknown", description: `HTTP ${res.status}`, incidents: [] };
  }

  const data = await res.json<any>();
  const overall = data?.result?.status_overall ?? {};
  const level = STATUSIO_LEVEL[Number(overall?.status_code)] ?? "unknown";

  const active: any[] = Array.isArray(data?.result?.incidents) ? data.result.incidents : [];
  const incidents: Incident[] = active.map((i) => ({
    name: String(i?.name ?? "Incident"),
    impact: String(overall?.status ?? "minor"),
    status: String(i?.current_state ?? i?.current_status ?? "investigating"),
  }));

  return {
    level,
    description: String(overall?.status ?? "Unknown"),
    incidents,
  };
}

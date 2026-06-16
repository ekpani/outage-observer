import type { Incident, Level, ProviderStatus } from "./types";

const PAGE_STATUS_TO_LEVEL: Record<string, Level> = {
  UP: "operational",
  HASISSUES: "degraded",
  UNDERMAINTENANCE: "maintenance",
};

/** Instatus: GET {base}/summary.json */
export async function fetchInstatus(base: string): Promise<ProviderStatus> {
  const res = await fetch(`${base}/summary.json`, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 30, cacheEverything: true },
    signal: AbortSignal.timeout(8000),   // a hung provider must not stall the tick

  });
  if (!res.ok) {
    return { level: "unknown", description: `HTTP ${res.status}`, incidents: [] };
  }

  const data = await res.json<any>();
  const pageStatus: string = data?.page?.status ?? "UP";

  const incidents: Incident[] = (data?.activeIncidents ?? []).map((i: any) => ({
    name: String(i?.name ?? "Incident"),
    impact: String(i?.impact ?? "minor"),
    status: String(i?.status ?? "investigating"),
    url: i?.url ? String(i.url) : undefined,
  }));

  return {
    level: PAGE_STATUS_TO_LEVEL[pageStatus] ?? "unknown",
    description: pageStatus,
    incidents,
  };
}

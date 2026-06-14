import type { Incident, Level, ProviderStatus } from "./types";

const INDICATOR_TO_LEVEL: Record<string, Level> = {
  none: "operational",
  minor: "degraded",
  major: "partial_outage",
  critical: "major_outage",
};

/** Atlassian Statuspage: GET {base}/api/v2/summary.json */
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
  const inMaintenance = (data?.scheduled_maintenances ?? []).some(
    (m: any) => m?.status === "in_progress",
  );
  const level: Level =
    inMaintenance && indicator === "none"
      ? "maintenance"
      : INDICATOR_TO_LEVEL[indicator] ?? "unknown";

  const incidents: Incident[] = (data?.incidents ?? []).map((i: any) => ({
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

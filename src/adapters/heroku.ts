import { SEVERITY, type Incident, type Level, type ProviderStatus } from "./types";

const COLOR_TO_LEVEL: Record<string, Level> = {
  green: "operational",
  blue: "maintenance",
  yellow: "partial_outage",
  red: "major_outage",
};

/** Heroku: GET https://status.heroku.com/api/v4/current-status
 *  { status: [{ system, status: "green"|"yellow"|"red" }], incidents: [...] } */
export async function fetchHeroku(url: string): Promise<ProviderStatus> {
  const res = await fetch(url, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 30, cacheEverything: true },
  });
  if (!res.ok) return { level: "unknown", description: `HTTP ${res.status}`, incidents: [] };

  const data = await res.json<any>();
  const systems = Array.isArray(data?.status) ? data.status : [];
  let worst: Level = "operational";
  for (const s of systems) {
    const lvl = COLOR_TO_LEVEL[String(s?.status)];
    if (lvl && SEVERITY[lvl] > SEVERITY[worst]) worst = lvl;
  }

  const active = Array.isArray(data?.incidents) ? data.incidents : [];
  const incidents: Incident[] = active.map((i: any) => ({
    name: String(i?.title ?? "Incident"),
    impact: String(i?.status ?? ""),
    status: String(i?.status ?? ""),
    url: i?.id ? `https://status.heroku.com/incidents/${i.id}` : undefined,
  }));
  return {
    level: worst,
    description: worst === "operational" ? "All systems operational" : (incidents[0]?.name ?? "Active incident"),
    incidents,
  };
}

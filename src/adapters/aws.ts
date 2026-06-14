import { type Incident, type Level, type ProviderStatus } from "./types";

/** AWS Health: GET https://health.aws.amazon.com/public/currentevents
 *  UTF-16LE JSON, an array of current per-service events. Event `status`:
 *  "1" informational, "2" degraded, "3" disruption. We only treat >= 2 as
 *  impact, so AWS's frequent informational notices don't read as outages. */
export async function fetchAws(url: string): Promise<ProviderStatus> {
  const res = await fetch(url, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 30, cacheEverything: true },
  });
  if (!res.ok) return { level: "unknown", description: `HTTP ${res.status}`, incidents: [] };

  let events: any[] = [];
  try {
    const u16 = new Uint16Array(await res.arrayBuffer());
    let text = "";
    for (let i = u16[0] === 0xfeff ? 1 : 0; i < u16.length; i++) {
      text += String.fromCharCode(u16[i]);
    }
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) events = parsed;
  } catch {
    return { level: "unknown", description: "parse error", incidents: [] };
  }

  const impactful = events.filter((e) => Number(e?.status) >= 2);
  if (impactful.length === 0) {
    return { level: "operational", description: "Service is operating normally", incidents: [] };
  }

  let worst: Level = "degraded";
  for (const e of impactful) {
    if (Number(e?.status) >= 3) worst = "major_outage";
  }
  const incidents: Incident[] = impactful.map((e) => ({
    name: `${String(e?.service_name ?? "AWS")} (${String(e?.region_name ?? "")}): ${String(e?.summary ?? "Issue")}`,
    impact: String(e?.status ?? ""),
    status: "ongoing",
    url: "https://health.aws.amazon.com/health/status",
  }));
  return { level: worst, description: incidents[0]?.name ?? "Service issue", incidents };
}

import { type Provider } from "./catalog";

/** A recent incident from a provider's own status feed (authoritative). */
export interface IncidentRecord {
  name: string;
  level: string;   // mapped from Statuspage impact, for the pill color/label
  at: number;      // ms (resolved_at if resolved, else created_at)
  resolved: boolean;
  url?: string;
}

// Statuspage impact -> our level. Keeps the four severities distinct.
const IMPACT_LEVEL: Record<string, string> = {
  critical: "major_outage",
  major: "partial_outage",
  minor: "degraded",
  maintenance: "maintenance",
  none: "maintenance",
};

/** Recent incidents (resolved + ongoing) from the provider's published history.
 *  Only Statuspage exposes a clean history feed (`/api/v2/incidents.json`);
 *  Instatus and the custom vendor adapters don't, so they return [] and the
 *  page falls back to our recorded transitions. Edge-cached for an hour so this
 *  costs ~one shared subrequest regardless of page traffic. */
export async function fetchRecentIncidents(provider: Provider, max = 5): Promise<IncidentRecord[]> {
  if (provider.adapter !== "statuspage") return [];
  try {
    const res = await fetch(`${provider.url}/api/v2/incidents.json`, {
      headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
      cf: { cacheTtl: 3600, cacheEverything: true },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json<any>();
    const incidents: any[] = Array.isArray(data?.incidents) ? data.incidents : [];
    return incidents.slice(0, max).map((i) => {
      const resolved = Boolean(i?.resolved_at);
      const at = Date.parse(String(i?.resolved_at ?? i?.created_at ?? "")) || Date.now();
      return {
        name: String(i?.name ?? "Incident"),
        level: IMPACT_LEVEL[String(i?.impact ?? "none")] ?? "degraded",
        at,
        resolved,
        // Only keep https links — a malicious/compromised feed could otherwise
        // supply a `javascript:` shortlink that we'd render as a clickable href.
        url: /^https:\/\//i.test(String(i?.shortlink ?? "")) ? String(i.shortlink) : undefined,
      };
    });
  } catch {
    return [];
  }
}

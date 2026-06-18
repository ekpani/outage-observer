import { type Provider } from "./catalog";

/** A recent incident from a provider's own status feed (authoritative). */
export interface IncidentRecord {
  name: string;
  level: string;   // mapped from the provider's impact/severity, for the pill
  at: number;      // ms (resolved_at if resolved, else created_at)
  resolved: boolean;
  url?: string;
}

// Statuspage impact -> our level. Keeps the four severities distinct.
const STATUSPAGE_LEVEL: Record<string, string> = {
  critical: "major_outage",
  major: "partial_outage",
  minor: "degraded",
  maintenance: "maintenance",
  none: "maintenance",
};

// GCP severity -> our level (mirrors the gcp status adapter).
const GCP_LEVEL: Record<string, string> = {
  high: "major_outage",
  medium: "partial_outage",
  low: "degraded",
};

/** Recent incidents (resolved + ongoing) from a provider's published history.
 *  Statuspage and Google Cloud both expose a clean incident feed; other custom
 *  adapters (Instatus, AWS, Azure, etc.) don't yet, so they return [] and the
 *  page falls back to our recorded transitions. Edge-cached for an hour, so this
 *  costs ~one shared subrequest regardless of page traffic. */
export async function fetchRecentIncidents(provider: Provider, max = 5): Promise<IncidentRecord[]> {
  try {
    if (provider.adapter === "statuspage") return await statuspageIncidents(provider, max);
    if (provider.adapter === "gcp") return await gcpIncidents(provider, max);
    if (provider.adapter === "x") return await xIncidents(provider, max);
    if (provider.adapter === "slack") return await slackIncidents(provider, max);
    return [];
  } catch {
    return [];
  }
}

/** Level for an X incident, inferred from its title (no structured impact). */
function xLevel(title: string): string {
  const t = title.toLowerCase();
  if (/major|site-wide/.test(t)) return "major_outage";
  if (/outage|503|down/.test(t)) return "partial_outage";
  return "degraded";
}

async function xIncidents(provider: Provider, max: number): Promise<IncidentRecord[]> {
  const res = await fetch(provider.url, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 3600, cacheEverything: true },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const md = await res.text();
  const out: IncidentRecord[] = [];
  // Walk "### Month YYYY" sections (the year lives in the header, the day in the
  // step body) and parse each <Step>.
  for (const sec of md.matchAll(/###\s+([A-Za-z]+)\s+(\d{4})([\s\S]*?)(?=###\s+[A-Za-z]+\s+\d{4}|$)/g)) {
    const year = sec[2];
    for (const st of sec[3].matchAll(/<Step\s+title="([^"]+)"[^>]*>([\s\S]*?)<\/Step>/gi)) {
      const name = st[1].trim();
      const body = st[2];
      const resolved = /resolved/i.test(body) && !/ongoing|current/i.test(body);
      const dm = /\*\*([A-Za-z]+\s+\d{1,2}),?\s+([\d:]+)\s*UTC/.exec(body);
      let at = Date.now();
      if (dm) { const p = Date.parse(`${dm[1]} ${year} ${dm[2]} UTC`); if (!Number.isNaN(p)) at = p; }
      out.push({ name, level: xLevel(name), at, resolved });
      if (out.length >= max) return out;
    }
  }
  return out;
}

// Slack incident type -> our level (mirrors the slack status adapter).
const SLACK_LEVEL: Record<string, string> = {
  outage: "major_outage",
  incident: "partial_outage",
  maintenance: "maintenance",
  notice: "degraded",
};

/** Slack's status API (slack-status.com): the catalog `url` is the `/current`
 *  endpoint (active incidents); `/history` holds recent resolved ones. We merge
 *  active-first so an ongoing incident shows even when it isn't in history yet. */
async function slackIncidents(provider: Provider, max: number): Promise<IncidentRecord[]> {
  const historyUrl = provider.url.replace(/\/current(\.json)?$/, "/history");
  const [current, history] = await Promise.all([
    fetchFeed(provider.url).catch(() => ({})),
    fetchFeed(historyUrl).catch(() => []),
  ]);
  const active: any[] = Array.isArray(current?.active_incidents) ? current.active_incidents : [];
  const past: any[] = Array.isArray(history) ? history : [];

  const out: IncidentRecord[] = [];
  const seen = new Set<number>();
  for (const i of [...active, ...past]) {
    const id = Number(i?.id);
    if (Number.isFinite(id)) { if (seen.has(id)) continue; seen.add(id); }
    const resolved = String(i?.status ?? "") !== "active";
    const at = Date.parse(String((resolved ? i?.date_updated : i?.date_created) ?? i?.date_created ?? "")) || Date.now();
    out.push({
      name: String(i?.title ?? "Incident"),
      level: SLACK_LEVEL[String(i?.type ?? "")] ?? "degraded",
      at,
      resolved,
      url: safeUrl(i?.url),
    });
    if (out.length >= max) break;
  }
  return out;
}

async function fetchFeed(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 3600, cacheEverything: true },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json<any>();
}

// Only keep https links — a malicious/compromised feed could otherwise supply a
// `javascript:` URL that we'd render as a clickable href.
function safeUrl(u: unknown): string | undefined {
  return /^https:\/\//i.test(String(u ?? "")) ? String(u) : undefined;
}

async function statuspageIncidents(provider: Provider, max: number): Promise<IncidentRecord[]> {
  const data = await fetchFeed(`${provider.url}/api/v2/incidents.json`);
  const incidents: any[] = Array.isArray(data?.incidents) ? data.incidents : [];
  return incidents.slice(0, max).map((i) => {
    const resolved = Boolean(i?.resolved_at);
    const at = Date.parse(String(i?.resolved_at ?? i?.created_at ?? "")) || Date.now();
    return {
      name: String(i?.name ?? "Incident"),
      level: STATUSPAGE_LEVEL[String(i?.impact ?? "none")] ?? "degraded",
      at,
      resolved,
      url: safeUrl(i?.shortlink),
    };
  });
}

async function gcpIncidents(provider: Provider, max: number): Promise<IncidentRecord[]> {
  // The catalog `url` for the gcp adapter IS the incidents.json endpoint.
  const data = await fetchFeed(provider.url);
  const incidents: any[] = Array.isArray(data) ? data : [];
  return incidents
    .slice()
    .sort((a, b) => (Date.parse(b?.begin ?? "") || 0) - (Date.parse(a?.begin ?? "") || 0))
    .slice(0, max)
    .map((i) => {
      const resolved = Boolean(i?.end);
      const at = Date.parse(String(i?.end ?? i?.begin ?? "")) || Date.now();
      return {
        name: String(i?.external_desc ?? "Incident"),
        level: GCP_LEVEL[String(i?.severity ?? "")] ?? "degraded",
        at,
        resolved,
        url: safeUrl(i?.uri ? `https://status.cloud.google.com/${String(i.uri).replace(/^\//, "")}` : undefined),
      };
    });
}

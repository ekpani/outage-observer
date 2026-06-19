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
 *  Statuspage, Google Cloud, Slack, Heroku and Instatus all expose a clean,
 *  structured history feed; the remaining adapters (AWS, Azure, etc.) don't yet,
 *  so they return [] and the page falls back to our recorded transitions.
 *  Edge-cached for an hour, so this costs ~one shared subrequest regardless of
 *  page traffic. */
export async function fetchRecentIncidents(provider: Provider, max = 5): Promise<IncidentRecord[]> {
  try {
    if (provider.adapter === "statuspage") return await statuspageIncidents(provider, max);
    if (provider.adapter === "gcp") return await gcpIncidents(provider, max);
    if (provider.adapter === "x") return await xIncidents(provider, max);
    if (provider.adapter === "slack") return await slackIncidents(provider, max);
    if (provider.adapter === "heroku") return await herokuIncidents(provider, max);
    if (provider.adapter === "instatus") return await instatusIncidents(provider, max);
    if (provider.adapter === "statusio") return await statusioIncidents(provider, max);
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

/** Heroku status API: the catalog url is .../api/v4/current-status; recent
 *  incidents (resolved + ongoing) live at .../api/v4/incidents as a flat array. */
async function herokuIncidents(provider: Provider, max: number): Promise<IncidentRecord[]> {
  const data = await fetchFeed(provider.url.replace(/current-status\/?$/, "incidents"));
  const arr: any[] = Array.isArray(data) ? data : (Array.isArray(data?.incidents) ? data.incidents : []);
  return arr.slice(0, max).map((i) => {
    const resolved = Boolean(i?.resolved);
    const at = Date.parse(String((resolved ? i?.resolved_at : i?.created_at) ?? i?.created_at ?? "")) || Date.now();
    return {
      name: String(i?.title ?? "Incident"),
      level: "degraded",
      at,
      resolved,
      url: safeUrl(i?.full_url ?? i?.href),
    };
  });
}

/** Instatus' summary.json carries only the current status (no incident
 *  history), and the status page itself is a Next.js RSC payload that's
 *  fragile to scrape. But every Instatus page also publishes a clean,
 *  structured Atom incident-history feed at `${origin}/history.atom` — that's
 *  the authoritative, stable source, so we parse that. Each <entry> is one
 *  incident: <title> is the name, <published> the start time, and the CDATA
 *  <content> carries the update timeline (a "Resolved"/"Completed" line means
 *  it's closed). If the feed is ever missing or malformed we just return []. */
async function instatusIncidents(provider: Provider, max: number): Promise<IncidentRecord[]> {
  const res = await fetch(`${provider.url}/history.atom`, {
    headers: {
      "user-agent": "OutageObserver/0.1 (+https://outage.observer)",
      accept: "application/atom+xml",
    },
    cf: { cacheTtl: 3600, cacheEverything: true },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const out: IncidentRecord[] = [];
  for (const e of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = e[1];
    const title = decodeXml((/<title>([\s\S]*?)<\/title>/.exec(body)?.[1] ?? "").trim());
    if (!title) continue;
    const published = /<published>([^<]+)<\/published>/.exec(body)?.[1] ?? "";
    const content = /<content[^>]*>([\s\S]*?)<\/content>/.exec(body)?.[1] ?? "";
    const isMaintenance = /<strong>\s*Type:\s*<\/strong>\s*Maintenance/i.test(content);
    const resolved = /<strong>\s*(?:Resolved|Completed)\s*<\/strong>/i.test(content);
    out.push({
      name: title,
      level: isMaintenance ? "maintenance" : "degraded",
      at: Date.parse(published) || Date.now(),
      resolved,
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Status.io publishes an incident-history RSS feed at
 *  https://status.io/pages/<pageId>/rss. The catalog url is the API status
 *  endpoint (.../1.0/status/<pageId>), so we reuse that id for the feed. Each
 *  <item> is one incident: <title> is the name, <pubDate> the latest update
 *  time, and the CDATA <description> carries the state timeline (a
 *  "Resolved"/"Completed" line means it's closed). */
async function statusioIncidents(provider: Provider, max: number): Promise<IncidentRecord[]> {
  const id = /\/status\/([a-z0-9]+)/i.exec(provider.url)?.[1];
  if (!id) return [];
  const res = await fetch(`https://status.io/pages/${id}/rss`, {
    headers: {
      "user-agent": "OutageObserver/0.1 (+https://outage.observer)",
      accept: "application/rss+xml",
    },
    cf: { cacheTtl: 3600, cacheEverything: true },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const out: IncidentRecord[] = [];
  for (const it of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = it[1];
    const title = decodeXml(stripCdata((/<title>([\s\S]*?)<\/title>/.exec(body)?.[1] ?? "")).trim());
    if (!title) continue;
    const desc = stripCdata(/<description>([\s\S]*?)<\/description>/.exec(body)?.[1] ?? "");
    const pub = /<pubDate>([^<]+)<\/pubDate>/.exec(body)?.[1] ?? "";
    const maintenance = /<b>\s*Completed\s*<\/b>/i.test(desc) || /scheduled maintenance/i.test(title);
    const resolved = /<b>\s*(?:Resolved|Completed)\s*<\/b>/i.test(desc);
    out.push({
      name: title,
      level: maintenance ? "maintenance" : "degraded",
      at: Date.parse(pub) || Date.now(),
      resolved,
    });
    if (out.length >= max) break;
  }
  return out;
}

// Unwrap a CDATA section if present, else return the string unchanged.
function stripCdata(s: string): string {
  const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
  return m ? m[1] : s;
}

// Minimal XML entity decode for feed text (titles). The five predefined
// entities plus numeric refs cover everything Instatus emits.
function decodeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_, ent) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    }
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    return named[ent] ?? _;
  });
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

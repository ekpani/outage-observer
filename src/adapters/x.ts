import { SEVERITY, type Incident, type Level, type ProviderStatus } from "./types";

/** X (Twitter) Developer Platform status. X retired its Statuspage; the only
 *  official machine-readable source is the docs status page served as markdown
 *  (docs.x.com/status.md) — a Mintlify page with <Card> components, each holding
 *  a <Tooltip tip="..."> with the component's current status, plus a "## Incident
 *  history" section of <Step>s.
 *
 *  This is the DEV PLATFORM status (API v2 / Enterprise / streaming / Console),
 *  not the consumer app — but site-wide outages surface here as API degradation.
 *  We parse defensively: map each component tooltip to a level and take the
 *  worst; an unrecognized tip is ignored (never fabricates an outage); if nothing
 *  parses, fall back to the overall "All systems are operational" banner, else
 *  return `unknown` so the poller keeps the last-known state (no fake news). */

/** Map a component tooltip / status word to a level, or undefined if unknown. */
function tipToLevel(raw: string): Level | undefined {
  const t = raw.toLowerCase();
  if (t.includes("operational") || t.includes("normal")) return "operational";
  if (t.includes("maintenance")) return "maintenance";
  if (t.includes("major")) return "major_outage";
  if (t.includes("partial")) return "partial_outage";
  if (t.includes("degrad")) return "degraded";          // degraded / degradation
  if (t.includes("outage") || t.includes("down")) return "partial_outage";
  return undefined;
}

export async function fetchX(url: string): Promise<ProviderStatus> {
  const res = await fetch(url, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 30, cacheEverything: true },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { level: "unknown", description: `HTTP ${res.status}`, incidents: [] };

  const md = await res.text();

  // Worst current component status, from each <Tooltip tip="...">.
  let worst: Level | null = null;
  for (const m of md.matchAll(/<Tooltip\s+tip="([^"]+)"/gi)) {
    const lvl = tipToLevel(m[1]);
    if (!lvl) continue;
    if (worst === null || SEVERITY[lvl] > SEVERITY[worst]) worst = lvl;
  }

  // Fallback if the component cards couldn't be read.
  if (worst === null) {
    if (/all systems are operational/i.test(md)) worst = "operational";
    else return { level: "unknown", description: "unparsed", incidents: [] };
  }

  // Surface ongoing incidents as the headline ONLY when the components actually
  // report a problem. The history's "ongoing" flags can be stale (X sometimes
  // leaves an old incident marked Current), so we never attach one while the
  // cards say operational — the cards are the authoritative current status.
  const incidents: Incident[] = [];
  if (worst !== "operational") {
    for (const s of md.matchAll(/<Step\s+title="([^"]+)"[^>]*>([\s\S]*?)<\/Step>/gi)) {
      const body = s[2];
      if (/ongoing|current/i.test(body) && !/resolved/i.test(body)) {
        incidents.push({ name: s[1].trim(), impact: "ongoing", status: "ongoing" });
      }
      if (incidents.length >= 3) break;
    }
  }

  const description = worst === "operational" ? "All systems operational" : (incidents[0]?.name ?? "Service degradation");
  return { level: worst, description, incidents };
}

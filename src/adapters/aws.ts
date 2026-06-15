import { type Incident, type Level, type ProviderStatus } from "./types";

/** AWS Health: GET https://health.aws.amazon.com/public/currentevents
 *  UTF-16 JSON (with a BOM), an array of current per-service events. Event
 *  `status`: "1" informational, "2" degraded, "3" disruption. We only treat
 *  >= 2 as impact, so AWS's frequent informational notices don't read as
 *  outages — and only events with recent activity (see below). */
export async function fetchAws(url: string): Promise<ProviderStatus> {
  const res = await fetch(url, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 30, cacheEverything: true },
  });
  if (!res.ok) return { level: "unknown", description: `HTTP ${res.status}`, incidents: [] };

  let events: any[] = [];
  try {
    const buf = new Uint8Array(await res.arrayBuffer());
    // The feed is UTF-16 with a byte-order mark. Honor it: AWS emits
    // big-endian (BOM FE FF). Reading it as little-endian (e.g. via a raw
    // Uint16Array, which is native-endian = LE on Workers) byte-swaps every
    // character into garbage and the parse fails — which is exactly how AWS
    // went "unknown".
    const be = buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff;
    const text = new TextDecoder(be ? "utf-16be" : "utf-16le").decode(buf).replace(/^﻿/, "");
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) events = parsed;
  } catch {
    return { level: "unknown", description: "parse error", incidents: [] };
  }

  // Only count events that are actually current. AWS's feed retains
  // long-standing regional advisories (e.g. a region physically damaged months
  // ago) that are still flagged "ongoing" but are not a live outage. Surfacing
  // those as a fresh major outage would be false, so require activity (event
  // start or latest log update) within the last 48 hours.
  const FRESH_MS = 48 * 60 * 60 * 1000;
  const now = Date.now();
  const lastActivityMs = (e: any): number => {
    let log = e?.event_log;
    if (typeof log === "string") {
      try { log = JSON.parse(log); } catch { log = []; }
    }
    let latest = Number(e?.date) * 1000; // `date` is seconds since epoch
    if (Array.isArray(log)) {
      for (const x of log) {
        const t = Number(x?.timestamp) * 1000;
        if (Number.isFinite(t) && t > latest) latest = t;
      }
    }
    return latest;
  };

  const impactful = events.filter(
    (e) => Number(e?.status) >= 2 && now - lastActivityMs(e) <= FRESH_MS,
  );
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

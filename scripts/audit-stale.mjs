// One-off audit: find providers whose feed is stale/migrated/broken.
// Flags: cross-host redirect (migration), non-2xx, parse-empty/unknown live
// status, and frozen pages (operational but newest incident very old).
import fs from "node:fs";

const UA = "OutageObserver/0.1 (+https://outage.observer)";
const NOW = Date.now();
const STALE_MS = 1000 * 60 * 60 * 24 * 270; // ~9 months

const src = fs.readFileSync(new URL("../src/catalog.ts", import.meta.url), "utf8");
const re = /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*category:\s*"([^"]+)",\s*adapter:\s*"([^"]+)",\s*url:\s*"([^"]+)"(?:,\s*link:\s*"([^"]+)")?\s*\}/g;
const providers = [];
let m;
while ((m = re.exec(src))) providers.push({ id: m[1], name: m[2], adapter: m[4], url: m[5], link: m[6] });
console.error(`parsed ${providers.length} providers`);

const reg = (h) => h.split(".").slice(-2).join(".");
async function get(url, accept) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": UA, ...(accept ? { accept } : {}) },
    signal: AbortSignal.timeout(14000),
  });
  return res;
}
const dateMs = (s) => { const t = Date.parse(s ?? ""); return Number.isFinite(t) ? t : 0; };

async function probe(p) {
  const flags = [];
  let live = "?", newest = 0, finalHost = "", note = "";
  try {
    if (p.adapter === "statuspage") {
      const r = await get(`${p.url}/api/v2/summary.json`, "application/json");
      finalHost = new URL(r.url).hostname;
      if (!r.ok) { flags.push(`summary HTTP ${r.status}`); }
      else {
        const d = await r.json();
        live = d?.status?.indicator ?? "?";
        note = d?.page?.name ?? "";
        // freshness from incidents.json
        const ri = await get(`${p.url}/api/v2/incidents.json`, "application/json").catch(() => null);
        if (ri?.ok) { const di = await ri.json(); const inc = di?.incidents?.[0]; newest = dateMs(inc?.resolved_at ?? inc?.created_at); }
      }
    } else if (p.adapter === "instatus") {
      const r = await get(`${p.url}/summary.json`, "application/json");
      finalHost = new URL(r.url).hostname;
      if (!r.ok) flags.push(`summary HTTP ${r.status}`);
      else { const d = await r.json(); live = d?.page?.status ?? "?"; }
      const ra = await get(`${p.url}/history.atom`, "application/atom+xml").catch(() => null);
      if (ra?.ok) { const x = await ra.text(); const mm = x.match(/<published>([^<]+)<\/published>/); newest = dateMs(mm?.[1]); if (!/<entry>/.test(x)) note = "atom: 0 entries"; }
      else flags.push("history.atom unreachable");
    } else if (p.adapter === "statusio") {
      const r = await get(p.url, "application/json");
      finalHost = new URL(r.url).hostname;
      if (!r.ok) flags.push(`status HTTP ${r.status}`);
      else { const d = await r.json(); live = d?.result?.status_overall?.status ?? "?"; }
    } else {
      // slack/heroku/gcp/azure/aws/x — just reachability + redirect
      const r = await get(p.url);
      finalHost = new URL(r.url).hostname;
      if (!r.ok) flags.push(`HTTP ${r.status}`);
      live = r.ok ? "ok" : "?";
    }
  } catch (e) {
    flags.push(`fetch error: ${String(e?.name || e).slice(0, 40)}`);
  }

  const origHost = new URL(p.adapter === "statusio" ? p.url : p.url).hostname;
  if (finalHost && reg(finalHost) !== reg(origHost)) flags.push(`REDIRECT ${origHost} -> ${finalHost}`);
  if (live === "?") flags.push("live status unparsed");
  const operationalish = ["none", "UP", "Operational", "ok"].includes(live);
  if (operationalish && newest && NOW - newest > STALE_MS) flags.push(`newest incident ${new Date(newest).toISOString().slice(0, 10)} (frozen?)`);

  return { ...p, live, newest: newest ? new Date(newest).toISOString().slice(0, 10) : "-", finalHost, note, flags };
}

const out = [];
const CONC = 8;
for (let i = 0; i < providers.length; i += CONC) {
  out.push(...await Promise.all(providers.slice(i, i + CONC).map(probe)));
  process.stderr.write(".");
}
console.error("");

const flagged = out.filter((r) => r.flags.length);
console.log(`\n=== FLAGGED (${flagged.length}/${out.length}) ===`);
for (const r of flagged) console.log(`[${r.adapter}] ${r.id.padEnd(16)} live=${String(r.live).padEnd(12)} newest=${r.newest}  ${r.note ? "("+r.note+") " : ""}${r.flags.join("; ")}`);

console.log(`\n=== clean providers with NO incident history (statuspage/instatus/statusio only) ===`);
for (const r of out.filter((r) => !r.flags.length && ["statuspage","instatus","statusio"].includes(r.adapter) && r.newest === "-"))
  console.log(`[${r.adapter}] ${r.id.padEnd(16)} live=${r.live}`);

// Build-time icon generator: ONE PNG per provider at public/icons/<id>.png, so
// the board never falls back to a letter and never depends on a third-party CDN
// at render time. Source order:
//   1. Simple Icons (crisp brand SVG) rendered in the brand's own colour.
//   2. For the ~43 providers Simple Icons doesn't carry (many removed on
//      trademark request: AWS, Slack, OpenAI, Twilio, ...), the brand's favicon
//      via Google's favicon service, which resolves one for any domain.
// Run: npx tsx scripts/gen-icons.ts  (then commit public/icons/).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import * as si from "simple-icons";
import { CATALOG, type Provider } from "../src/catalog";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

const SIZE = 128;

// Provider id -> Simple Icons slug, only where they differ (mirrors app.js).
const SLUGS: Record<string, string> = {
  gcp: "googlecloud", aws: "amazonwebservices", azure: "microsoftazure",
  fly: "flydotio", travis: "travisci", cockroach: "cockroachlabs",
  onepassword: "1password", monday: "mondaydotcom", getstream: "stream",
  wikimedia: "wikipedia", proton: "protonmail", epicgames: "epicgames",
};

// Brand-domain overrides for favicon lookup where the heuristic guesses wrong.
const DOMAINS: Record<string, string> = {
  aws: "aws.amazon.com",
};

// Index every Simple Icon by its slug.
const bySlug: Record<string, { svg: string; hex: string }> = {};
for (const k of Object.keys(si)) {
  const ic = (si as Record<string, any>)[k];
  if (ic && ic.slug && ic.svg) bySlug[ic.slug] = ic;
}

// Brand-coloured silhouette on a transparent background, with a little breathing
// room (viewBox padded from 24 to 28).
function renderSimpleIcon(ic: { svg: string; hex: string }): Buffer {
  const inner = ic.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const svg = `<svg viewBox="-2 -2 28 28" xmlns="http://www.w3.org/2000/svg" fill="#${ic.hex}">${inner}</svg>`;
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: SIZE } }).render().asPng());
}

function brandDomain(p: Provider): string {
  if (DOMAINS[p.id]) return DOMAINS[p.id];
  let h: string;
  try { h = new URL(p.link || p.url).hostname; } catch { return p.id; }
  h = h.replace(/^www\./, "").replace(/^status\./, "");
  // <brand>status.<tld> / <brand>-status.<tld>  ->  <brand>.<tld>
  h = h.replace(/-?status\.(com|io|dev|net|org|so|me|app|ai)$/, ".$1");
  return h;
}

async function fetchFavicon(p: Provider): Promise<Buffer | null> {
  const domain = brandDomain(p);
  const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${SIZE}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 120 ? buf : null;   // s2 returns a tiny default for unknown domains
  } catch { return null; }
}

let simple = 0, fav = 0;
const missing: string[] = [];
for (const p of CATALOG) {
  const ic = bySlug[SLUGS[p.id] || p.id];
  let png: Buffer | null = null;
  if (ic) { png = renderSimpleIcon(ic); simple++; }
  else {
    png = await fetchFavicon(p);
    if (png) { fav++; } else { missing.push(`${p.id} (${brandDomain(p)})`); continue; }
  }
  writeFileSync(join(OUT, `${p.id}.png`), png);
}
console.log(`icons: ${simple} brand SVGs + ${fav} favicons = ${simple + fav}/${CATALOG.length}`);
if (missing.length) console.log("MISSING (need a domain override):", missing.join(", "));

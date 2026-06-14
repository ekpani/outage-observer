// Build-time OG card generator. Renders 1200×630 social cards with satori
// (HTML/CSS → SVG) + resvg (SVG → PNG), on brand (dark, Departure Mono, aperture
// mark). Run locally and commit the PNGs — they're served as static assets, so
// there's zero runtime cost (and no stale live-status verdict baked in).
//
//   npx tsx scripts/gen-og.ts            # all providers + default
//   npx tsx scripts/gen-og.ts stripe     # just stripe (+ default) for a preview
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { html } from "satori-html";
import { Resvg } from "@resvg/resvg-js";
import { CATALOG } from "../src/catalog";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const OUT = join(ROOT, "public", "og");
const font = readFileSync(join(here, "DepartureMono-Regular.otf"));

const APERTURE = `<svg width="48" height="48" viewBox="0 0 64 64" fill="none">
  <circle cx="32" cy="32" r="25" stroke="#ECEEF0" stroke-width="3"/>
  <circle cx="32" cy="32" r="14" stroke="#ECEEF0" stroke-width="3" opacity="0.4"/>
  <circle cx="32" cy="32" r="6" fill="#3FCF5E"/>
</svg>`;

const RINGS = `<svg width="640" height="640" viewBox="0 0 640 640" style="position:absolute; right:-150px; bottom:-200px;">
  <circle cx="320" cy="320" r="300" fill="none" stroke="#3FCF5E" stroke-width="2" opacity="0.06"/>
  <circle cx="320" cy="320" r="230" fill="none" stroke="#3FCF5E" stroke-width="2" opacity="0.09"/>
  <circle cx="320" cy="320" r="160" fill="none" stroke="#3FCF5E" stroke-width="2" opacity="0.13"/>
  <circle cx="320" cy="320" r="90" fill="none" stroke="#3FCF5E" stroke-width="2" opacity="0.18"/>
  <circle cx="320" cy="320" r="34" fill="#3FCF5E" opacity="0.22"/>
</svg>`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function card(title: string, subtitle: string, footer: string): string {
  const titleSize = title.length > 16 ? 84 : title.length > 11 ? 100 : 116;
  return `<div style="display:flex; flex-direction:column; width:1200px; height:630px; background:#070809; color:#ECEEF0; font-family:'Departure Mono'; padding:76px; position:relative;">
    ${RINGS}
    <div style="display:flex; align-items:center;">
      ${APERTURE}
      <div style="display:flex; margin-left:18px; font-size:32px; color:#9AA0A6; letter-spacing:1px;">
        <span>outage</span><span style="color:#5C636B;">.</span><span>observer</span>
      </div>
    </div>
    <div style="display:flex; flex-direction:column; flex-grow:1; justify-content:center;">
      <div style="display:flex; font-size:${titleSize}px; letter-spacing:-2px; line-height:1.05; color:#ECEEF0;">${esc(title)}</div>
      <div style="display:flex; font-size:38px; color:#9AA0A6; margin-top:20px; letter-spacing:0.5px;">${esc(subtitle)}</div>
    </div>
    <div style="display:flex; align-items:center; font-size:26px; color:#5C636B; letter-spacing:1px;">
      <span style="display:flex; width:16px; height:16px; border-radius:50%; background:#3FCF5E; margin-right:16px;"></span>
      <span>${esc(footer)}</span>
    </div>
  </div>`;
}

async function render(name: string, markup: string): Promise<void> {
  const svg = await satori(html(markup) as any, {
    width: 1200,
    height: 630,
    fonts: [{ name: "Departure Mono", data: font, weight: 400, style: "normal" }],
  });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
  writeFileSync(join(OUT, name + ".png"), png);
  console.log("wrote", name + ".png", `(${(png.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);

  // Default / directory card.
  if (!only.length || only.includes("default")) {
    await render("default", card("Is your stack up?", "Live status of the infra & AI providers you run on", "outage.observer · 106 providers"));
  }

  const targets = only.length ? CATALOG.filter((p) => only.includes(p.id)) : CATALOG;
  for (const p of targets) {
    await render(p.id, card(p.name, "Live status & recent incidents", `${p.category} · checked every minute`));
  }
  console.log(`done: ${targets.length} provider card(s)${(!only.length || only.includes("default")) ? " + default" : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

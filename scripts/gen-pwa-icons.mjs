// Render the Outage Observer reticle as FULL-BLEED square PWA icons. Full-bleed
// (not the pre-rounded macOS squircle) because iOS/Android apply their own
// rounding/masking — a pre-rounded source would get double-rounded with bad
// corners. The reticle sits well inside the maskable safe zone (inner 80%).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");

const tick = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ECEEF0" stroke-width="20" stroke-linecap="round"/>`;
const SVG = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14181D"/><stop offset="1" stop-color="#090B0E"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <g transform="translate(512,512)">
    <circle r="255" fill="none" stroke="#3FCF5E" stroke-width="3" opacity="0.10"/>
    <circle r="205" fill="none" stroke="#ECEEF0" stroke-width="22"/>
    <circle r="118" fill="none" stroke="#ECEEF0" stroke-width="22" opacity="0.4"/>
    <circle r="52" fill="#3FCF5E"/>
    ${tick(0, -228, 0, -180)}${tick(0, 180, 0, 228)}${tick(-228, 0, -180, 0)}${tick(180, 0, 228, 0)}
  </g>
</svg>`;

const OUT = { "icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180 };
for (const [name, size] of Object.entries(OUT)) {
  const png = new Resvg(SVG, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(join(pub, name), png);
  console.log("wrote", name, `(${size}px)`);
}

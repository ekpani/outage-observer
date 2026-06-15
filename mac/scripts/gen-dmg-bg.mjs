// Render the branded DMG background (660x400) the installer window shows: the
// aperture + wordmark up top, and a hint arrow from the app icon toward the
// Applications drop. Output: mac/assets/dmg.png.  node mac/scripts/gen-dmg-bg.mjs
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fontPath = join(here, "..", "..", "scripts", "DepartureMono-Regular.otf");
const out = join(here, "..", "assets", "dmg.png");
const W = 660, H = 400;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#0b0e13"/><stop offset="1" stop-color="#070809"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${[1, 2, 3, 4].map((i) => `<circle cx="${W - 40}" cy="40" r="${i * 70}" fill="none" stroke="#3FCF5E" stroke-width="1" opacity="${0.06 - i * 0.008}"/>`).join("")}
  <g transform="translate(${W / 2}, 64)">
    <g transform="translate(-92,-12)">
      <circle cx="0" cy="0" r="11" fill="none" stroke="#ECEEF0" stroke-width="2.4"/>
      <circle cx="0" cy="0" r="6" fill="none" stroke="#ECEEF0" stroke-width="2.4" opacity="0.4"/>
      <circle cx="0" cy="0" r="3" fill="#3FCF5E"/>
    </g>
    <text x="-72" y="6" font-family="Departure Mono" font-size="22" fill="#ECEEF0">outage<tspan fill="#5C636B">.</tspan>observer</text>
  </g>
  <!-- hint arrow from the app icon (165,185) toward Applications (495,185) -->
  <g transform="translate(0,185)" opacity="0.5">
    <line x1="250" y1="0" x2="408" y2="0" stroke="#5C636B" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>
    <path d="M404 -7 L416 0 L404 7" fill="none" stroke="#9AA0A6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="${W / 2}" y="330" text-anchor="middle" font-family="Departure Mono" font-size="14" fill="#5C636B">drag to Applications to install</text>
</svg>`;

mkdirSync(dirname(out), { recursive: true });
const png = new Resvg(svg, { font: { fontFiles: [fontPath], defaultFontFamily: "Departure Mono", loadSystemFonts: false } }).render().asPng();
writeFileSync(out, png);
console.log("wrote", out);

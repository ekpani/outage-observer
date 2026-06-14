// Render the Outage Observer app icon (aperture/reticle on a dark squircle) at
// all macOS iconset sizes, then `iconutil` packs them into AppIcon.icns.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ICONSET = join(here, "..", "mac", "AppIcon.iconset");

const tick = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ECEEF0" stroke-width="20" stroke-linecap="round"/>`;
const SVG = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14181D"/><stop offset="1" stop-color="#090B0E"/>
    </linearGradient>
  </defs>
  <rect x="96" y="96" width="832" height="832" rx="186" fill="url(#bg)" stroke="#262B31" stroke-width="4"/>
  <g transform="translate(512,512)">
    <circle r="255" fill="none" stroke="#3FCF5E" stroke-width="3" opacity="0.10"/>
    <circle r="205" fill="none" stroke="#ECEEF0" stroke-width="22"/>
    <circle r="118" fill="none" stroke="#ECEEF0" stroke-width="22" opacity="0.4"/>
    <circle r="52" fill="#3FCF5E"/>
    ${tick(0, -228, 0, -180)}${tick(0, 180, 0, 228)}${tick(-228, 0, -180, 0)}${tick(180, 0, 228, 0)}
  </g>
</svg>`;

// iconset size -> filenames
const MAP = {
  16: ["icon_16x16.png"],
  32: ["icon_16x16@2x.png", "icon_32x32.png"],
  64: ["icon_32x32@2x.png"],
  128: ["icon_128x128.png"],
  256: ["icon_128x128@2x.png", "icon_256x256.png"],
  512: ["icon_256x256@2x.png", "icon_512x512.png"],
  1024: ["icon_512x512@2x.png"],
};

mkdirSync(ICONSET, { recursive: true });
for (const [size, names] of Object.entries(MAP)) {
  const png = new Resvg(SVG, { fitTo: { mode: "width", value: Number(size) } }).render().asPng();
  for (const name of names) writeFileSync(join(ICONSET, name), png);
}
console.log("wrote", ICONSET);

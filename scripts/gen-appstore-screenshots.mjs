// App Store screenshots for the Mac app, rendered headlessly (SVG -> PNG via
// resvg) so they're pixel-faithful to the app's design tokens + Departure Mono.
// 2560x1600 (a valid Mac App Store size). Output: mac/screenshots/*.png
//
//   node scripts/gen-appstore-screenshots.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "mac", "screenshots");
const fontPath = join(here, "DepartureMono-Regular.otf");
const W = 2560, H = 1600;
const f = (n) => Number(n).toFixed(2);

const DARK = {
  surface: "#0C0E11", elevated: "#15181C", sunken: "#070809",
  border: "#1E2329", borderStrong: "#2A3036",
  primary: "#ECEEF0", secondary: "#9AA0A6", muted: "#5C636B", accent: "#3FCF5E",
  operational: "#3FCF5E", maintenance: "#5BA8FF", degraded: "#E5B647",
  partial_outage: "#F0883E", major_outage: "#F0726A", unknown: "#8A93A0",
  bg0: "#0a0d12", bg1: "#06080a", onBg: "#ECEEF0", onBgMuted: "#9AA0A6",
  bar: "rgba(20,24,30,0.55)", barIcon: "#ECEEF0",
};
const LIGHT = {
  surface: "#FFFFFF", elevated: "#FFFFFF", sunken: "#F1F0ED",
  border: "#E6E7E9", borderStrong: "#D5D7DA",
  primary: "#16181B", secondary: "#5B636E", muted: "#8A929C", accent: "#1A7F37",
  operational: "#1A7F37", maintenance: "#1F6FEB", degraded: "#946400",
  partial_outage: "#B14A00", major_outage: "#C0362C", unknown: "#5B636E",
  bg0: "#ECEBE7", bg1: "#DCDAD3", onBg: "#16181B", onBgMuted: "#5B636E",
  bar: "rgba(255,255,255,0.55)", barIcon: "#16181B",
};
let C = DARK;

const LABEL = {
  operational: "Operational", maintenance: "Maintenance", degraded: "Degraded",
  partial_outage: "Partial outage", major_outage: "Major outage", unknown: "Unknown",
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mono = "Departure Mono";

function aperture(cx, cy, r, pupil = C.accent, ring = C.primary) {
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ring}" stroke-width="${r * 0.13}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.56}" fill="none" stroke="${ring}" stroke-width="${r * 0.13}" opacity="0.4"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.26}" fill="${pupil}"/>
  </g>`;
}

// --- Header action icons, drawn as vectors (Departure Mono lacks ↻/⚙). ---
function iconRefresh(cx, cy, s, col) {
  const r = s * 0.5;
  // ~300° arc with a small arrowhead at the opening (top-right).
  const a0 = -0.5, a1 = Math.PI * 1.6;
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const ah = s * 0.28;
  return `<path d="M ${f(x0)} ${f(y0)} A ${f(r)} ${f(r)} 0 1 1 ${f(x1)} ${f(y1)}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M ${f(x0 - ah)} ${f(y0)} L ${f(x0)} ${f(y0)} L ${f(x0)} ${f(y0 - ah)}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function iconPlus(cx, cy, s, col) {
  const r = s * 0.5;
  return `<path d="M ${f(cx)} ${f(cy - r)} L ${f(cx)} ${f(cy + r)} M ${f(cx - r)} ${f(cy)} L ${f(cx + r)} ${f(cy)}" stroke="${col}" stroke-width="2.4" stroke-linecap="round"/>`;
}
function iconGear(cx, cy, s, col) {
  const teeth = 8, outer = s * 0.5, inner = outer * 0.66;
  let d = "";
  for (let i = 0; i < teeth * 2; i++) {
    const ang = (Math.PI / teeth) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? outer : inner;
    d += (i === 0 ? "M" : "L") + f(cx + Math.cos(ang) * rad) + " " + f(cy + Math.sin(ang) * rad) + " ";
  }
  d += "Z";
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${cx}" cy="${cy}" r="${f(outer * 0.34)}" fill="none" stroke="${col}" stroke-width="2"/>`;
}

function rowEl(p, x, y, w, pad) {
  const col = C[p.level];
  return `<g transform="translate(${x},${y})">
    <circle cx="${pad + 8}" cy="0" r="8" fill="${col}"/>
    <text x="${pad + 32}" y="7" font-family="${mono}" font-size="28" fill="${C.primary}">${esc(p.name)}</text>
    <text x="${w - pad}" y="7" text-anchor="end" font-family="${mono}" font-size="24" fill="${col}">${LABEL[p.level]}</text>
  </g>`;
}

// The board popover. Returns { svg, h }. `arrowX` (absolute) draws the stem.
function boardPopover(x, y, w, rows, arrowX) {
  const PAD = 30, rowH = 64, headH = 76, statusH = 64, footH = 60, topGap = 42;
  const bodyH = rows.length * rowH;
  const h = headH + statusH + bodyH + topGap + footH;
  const bad = rows.filter((r) => r.level !== "operational" && r.level !== "unknown");
  const worst = bad.find((r) => r.level === "major_outage")?.level
    || bad.find((r) => r.level === "partial_outage")?.level
    || bad.find((r) => r.level === "degraded")?.level
    || bad.find((r) => r.level === "maintenance")?.level || "operational";

  let stem = "";
  if (arrowX != null) {
    const ax = arrowX - x;
    stem = `<path d="M ${f(ax - 18)} 0 L ${f(ax)} -16 L ${f(ax + 18)} 0 Z" fill="${C.surface}" stroke="${C.borderStrong}" stroke-width="1.5"/>
      <rect x="${f(ax - 18)}" y="-1" width="36" height="3" fill="${C.surface}"/>`;
  }

  let s = `<g transform="translate(${x},${y})">
    <rect x="0" y="0" width="${w}" height="${h}" rx="22" fill="${C.surface}" stroke="${C.borderStrong}" stroke-width="1.5"/>
    ${stem}
    ${aperture(PAD + 14, headH / 2, 17)}
    <text x="${PAD + 44}" y="${headH / 2 + 8}" font-family="${mono}" font-size="26" fill="${C.secondary}">outage<tspan fill="${C.muted}">.</tspan>observer</text>
    ${iconRefresh(w - PAD - 92, headH / 2, 26, C.muted)}
    ${iconPlus(w - PAD - 46, headH / 2, 24, C.muted)}
    ${iconGear(w - PAD - 2, headH / 2, 26, C.muted)}
    <line x1="0" y1="${headH}" x2="${w}" y2="${headH}" stroke="${C.border}"/>`;

  const sy = headH + statusH / 2;
  const statusText = bad.length ? `${bad.length} need${bad.length === 1 ? "s" : ""} attention` : "All clear";
  s += `<circle cx="${PAD + 8}" cy="${sy}" r="7" fill="${C[worst]}"/>
    <text x="${PAD + 30}" y="${sy + 7}" font-family="${mono}" font-size="24" fill="${bad.length ? C[worst] : C.secondary}">${statusText}</text>
    <text x="${w - PAD}" y="${sy + 6}" text-anchor="end" font-family="${mono}" font-size="20" fill="${C.muted}">checked 12:41 UTC</text>
    <line x1="0" y1="${headH + statusH}" x2="${w}" y2="${headH + statusH}" stroke="${C.border}"/>`;

  let ry = headH + statusH + topGap;
  for (const p of rows) { s += rowEl(p, 0, ry, w, PAD); ry += rowH; }

  const fy = h - footH / 2;
  s += `<line x1="0" y1="${h - footH}" x2="${w}" y2="${h - footH}" stroke="${C.border}"/>
    <text x="${w - PAD}" y="${fy + 6}" text-anchor="end" font-family="${mono}" font-size="22" fill="${C.muted}">Quit</text>
  </g>`;
  return { svg: s, h };
}

// --- A realistic macOS menu bar with the OO reticle among system icons. ---
function menuBar(reticleX, active = true) {
  const barH = 56, cy = barH / 2;
  const ic = C.barIcon;
  // system glyphs near the right: control center, wifi, battery, clock
  const clock = `<text x="${W - 44}" y="${cy + 8}" text-anchor="end" font-family="${mono}" font-size="24" fill="${ic}">Mon 12:41</text>`;
  const battX = W - 250;
  const battery = `<rect x="${battX}" y="${cy - 9}" width="34" height="18" rx="4" fill="none" stroke="${ic}" stroke-width="1.6"/>
    <rect x="${battX + 3}" y="${cy - 6}" width="22" height="12" rx="2" fill="${ic}"/>
    <rect x="${battX + 35}" y="${cy - 4}" width="3" height="8" rx="1.5" fill="${ic}"/>`;
  const wifiX = W - 320, wifiY = cy + 7;
  const wifi = [13, 9, 5].map((r, i) =>
    `<path d="M ${f(wifiX - r)} ${f(wifiY - r * 0.5)} A ${r} ${r} 0 0 1 ${f(wifiX + r)} ${f(wifiY - r * 0.5)}" fill="none" stroke="${ic}" stroke-width="1.6"/>`,
  ).join("") + `<circle cx="${wifiX}" cy="${wifiY}" r="1.8" fill="${ic}"/>`;
  const ccX = W - 385;
  const cc = `<rect x="${ccX}" y="${cy - 9}" width="8" height="18" rx="4" fill="none" stroke="${ic}" stroke-width="1.6"/>
    <rect x="${ccX + 11}" y="${cy - 9}" width="8" height="18" rx="4" fill="none" stroke="${ic}" stroke-width="1.6"/>`;
  // OO reticle (third-party, left of the system icons; highlighted when the
  // popover is "open" on this screen).
  const hl = active ? `<rect x="${reticleX - 22}" y="4" width="44" height="${barH - 8}" rx="8" fill="${C.accent}" opacity="0.14"/>` : "";
  const reticle = aperture(reticleX, cy, 13, C.accent, ic);

  return `<rect x="0" y="0" width="${W}" height="${barH}" fill="${C.bar}"/>
    <line x1="0" y1="${barH}" x2="${W}" y2="${barH}" stroke="${C.borderStrong}" stroke-width="1" opacity="0.5"/>
    ${clock}${battery}${wifi}${cc}${hl}${reticle}`;
}

function backdrop() {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${C.bg0}"/><stop offset="1" stop-color="${C.bg1}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.72" cy="0.34" r="0.55">
      <stop offset="0" stop-color="${C.accent}" stop-opacity="0.14"/>
      <stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>`;
}

function headline(title, sub, x, y) {
  const lines = title.split("\n");
  let t = lines.map((l, i) => `<text x="${x}" y="${y + i * 96}" font-family="${mono}" font-size="80" fill="${C.onBg}" letter-spacing="-1">${esc(l)}</text>`).join("");
  t += `<text x="${x}" y="${y + lines.length * 96 + 32}" font-family="${mono}" font-size="34" fill="${C.onBgMuted}">${esc(sub)}</text>`;
  return t;
}

function screen(name, { title, sub, rows, extra, theme }) {
  C = theme === "light" ? LIGHT : DARK;
  const barH = 56;
  const popW = 800;
  const reticleX = Math.round(W * 0.72);
  const popX = reticleX - Math.round(popW * 0.62);   // arrow sits ~62% across
  const popY = barH + 30;
  const hasPop = !!rows;
  const pop = hasPop ? boardPopover(popX, popY, popW, rows, reticleX) : { svg: "" };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${backdrop()}
    ${menuBar(reticleX, hasPop)}
    ${headline(title, sub, 170, Math.round(H * 0.6))}
    ${pop.svg}
    ${extra ? extra(popX, popY) : ""}
  </svg>`;
  const png = new Resvg(svg, { font: { fontFiles: [fontPath], defaultFontFamily: mono, loadSystemFonts: false } }).render().asPng();
  writeFileSync(join(OUT, name + ".png"), png);
  console.log("wrote", name + ".png");
}

function notifBanner(x, y) {
  const w = 760, h = 150, bx = x, by = y;
  return `<g transform="translate(${bx},${by})">
    <rect x="0" y="0" width="${w}" height="${h}" rx="26" fill="${C.elevated}" stroke="${C.borderStrong}" stroke-width="1.5"/>
    <rect x="26" y="30" width="90" height="90" rx="20" fill="${C.sunken}" stroke="${C.border}"/>
    ${aperture(71, 75, 26)}
    <text x="140" y="62" font-family="${mono}" font-size="28" fill="${C.primary}">Stripe: Degraded</text>
    <text x="140" y="100" font-family="${mono}" font-size="22" fill="${C.secondary}">Elevated API error rates</text>
    <text x="${w - 28}" y="46" text-anchor="end" font-family="${mono}" font-size="18" fill="${C.muted}">now</text>
  </g>`;
}

mkdirSync(OUT, { recursive: true });

screen("01-board", {
  title: "Your stack's status,\nin your menu bar",
  sub: "Every provider you depend on, live.",
  rows: [
    { name: "Stripe", level: "degraded" },
    { name: "Amazon Web Services", level: "operational" },
    { name: "Cloudflare", level: "operational" },
    { name: "OpenAI", level: "operational" },
    { name: "GitHub", level: "operational" },
    { name: "Vercel", level: "operational" },
  ],
});

screen("02-alerts", {
  title: "Know the second\nit breaks",
  sub: "A native alert the moment a service changes state.",
  // No popover here — the macOS notification is the hero, where they appear.
  extra: () => notifBanner(W - 760 - 64, 56 + 28),
});

screen("03-focused", {
  title: "Watch only what\nyou run on",
  sub: "Pick your services. Skip the rest of the internet.",
  rows: [
    { name: "Anthropic", level: "operational" },
    { name: "OpenAI", level: "operational" },
    { name: "Cloudflare", level: "operational" },
    { name: "Supabase", level: "maintenance" },
  ],
});

screen("04-light", {
  theme: "light",
  title: "Light or dark.\nFollows your Mac.",
  sub: "Native, fast, and private — no account, no tracking.",
  rows: [
    { name: "Amazon Web Services", level: "operational" },
    { name: "Cloudflare", level: "operational" },
    { name: "OpenAI", level: "operational" },
    { name: "Stripe", level: "operational" },
    { name: "GitHub", level: "operational" },
  ],
});

console.log("done");

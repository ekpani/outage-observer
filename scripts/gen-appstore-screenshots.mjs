// App Store screenshots for the Mac app, rendered headlessly (SVG -> PNG via
// resvg) so they're pixel-faithful to the app's design tokens + Departure Mono.
// 2560x1600 (a valid Mac App Store size). Output: mac/screenshots/*.png
//
//   npx tsx ../scripts/... ; or: node scripts/gen-appstore-screenshots.mjs
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "mac", "screenshots");
const fontPath = join(here, "DepartureMono-Regular.otf");

const W = 2560, H = 1600;

// Theme tokens (from tokens.css). `C` is swapped per screen (dark default).
const DARK = {
  surface: "#0C0E11", elevated: "#15181C", sunken: "#070809",
  border: "#1E2329", borderStrong: "#2A3036",
  primary: "#ECEEF0", secondary: "#9AA0A6", muted: "#5C636B", accent: "#3FCF5E",
  operational: "#3FCF5E", maintenance: "#5BA8FF", degraded: "#E5B647",
  partial_outage: "#F0883E", major_outage: "#F0726A", unknown: "#8A93A0",
  bg0: "#0a0d12", bg1: "#06080a", onBg: "#ECEEF0", onBgMuted: "#9AA0A6",
};
const LIGHT = {
  surface: "#FFFFFF", elevated: "#FFFFFF", sunken: "#F1F0ED",
  border: "#E6E7E9", borderStrong: "#D5D7DA",
  primary: "#16181B", secondary: "#5B636E", muted: "#8A929C", accent: "#1A7F37",
  operational: "#1A7F37", maintenance: "#1F6FEB", degraded: "#946400",
  partial_outage: "#B14A00", major_outage: "#C0362C", unknown: "#5B636E",
  bg0: "#ECEBE7", bg1: "#DFDDD7", onBg: "#16181B", onBgMuted: "#5B636E",
};
let C = DARK;
const LABEL = {
  operational: "Operational", maintenance: "Maintenance", degraded: "Degraded",
  partial_outage: "Partial outage", major_outage: "Major outage", unknown: "Unknown",
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mono = "Departure Mono";

// Aperture brand mark at (cx,cy), radius r.
function aperture(cx, cy, r) {
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.primary}" stroke-width="${r * 0.13}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.56}" fill="none" stroke="${C.primary}" stroke-width="${r * 0.13}" opacity="0.4"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.26}" fill="${C.accent}"/>
  </g>`;
}

// One board row.
function row(p, x, y, w) {
  const col = C[p.level];
  return `<g transform="translate(${x},${y})">
    <circle cx="14" cy="0" r="7" fill="${col}"/>
    <text x="40" y="6" font-family="${mono}" font-size="26" fill="${C.primary}">${esc(p.name)}</text>
    <text x="${w - 24}" y="6" text-anchor="end" font-family="${mono}" font-size="22" fill="${col}">${LABEL[p.level]}</text>
  </g>`;
}

// The board popover, drawn at (x,y) with width w. `attention` is the count line.
function boardPopover(x, y, w, rows) {
  const bad = rows.filter((r) => r.level !== "operational" && r.level !== "unknown").length;
  const rowH = 58, headH = 64, statusH = 56, footH = 52;
  const bodyH = rows.length * rowH;
  const h = headH + statusH + bodyH + footH + 24;
  const worst = bad ? (rows.find((r) => r.level === "major_outage") ? "major_outage"
    : rows.find((r) => r.level === "partial_outage") ? "partial_outage"
    : rows.find((r) => r.level === "degraded") ? "degraded" : "maintenance") : "operational";

  let body = `<g transform="translate(${x},${y})">
    <rect x="0" y="0" width="${w}" height="${h}" rx="20" fill="${C.surface}" stroke="${C.borderStrong}" stroke-width="1.5"/>
    ${aperture(34, headH / 2, 16)}
    <text x="62" y="${headH / 2 + 7}" font-family="${mono}" font-size="24" fill="${C.secondary}">outage<tspan fill="${C.muted}">.</tspan>observer</text>
    <text x="${w - 96}" y="${headH / 2 + 6}" font-family="${mono}" font-size="22" fill="${C.muted}">↻</text>
    <text x="${w - 60}" y="${headH / 2 + 6}" font-family="${mono}" font-size="22" fill="${C.muted}">+</text>
    <text x="${w - 28}" y="${headH / 2 + 6}" font-family="${mono}" font-size="22" fill="${C.muted}">⚙</text>
    <line x1="0" y1="${headH}" x2="${w}" y2="${headH}" stroke="${C.border}"/>`;

  // status line
  const sy = headH + statusH / 2;
  const statusText = bad ? `${bad} need${bad === 1 ? "s" : ""} attention` : "All clear";
  body += `<circle cx="28" cy="${sy}" r="6" fill="${C[worst]}"/>
    <text x="48" y="${sy + 6}" font-family="${mono}" font-size="22" fill="${bad ? C[worst] : C.secondary}">${statusText}</text>
    <text x="${w - 24}" y="${sy + 5}" text-anchor="end" font-family="${mono}" font-size="18" fill="${C.muted}">checked 12:41 UTC</text>
    <line x1="0" y1="${headH + statusH}" x2="${w}" y2="${headH + statusH}" stroke="${C.border}"/>`;

  // rows
  let ry = headH + statusH + 34;
  for (const p of rows) { body += row(p, 0, ry, w); ry += rowH; }

  // footer
  const fy = h - footH / 2;
  body += `<line x1="0" y1="${h - footH}" x2="${w}" y2="${h - footH}" stroke="${C.border}"/>
    <text x="${w - 24}" y="${fy + 5}" text-anchor="end" font-family="${mono}" font-size="20" fill="${C.muted}">Quit</text>
  </g>`;
  return { svg: body, h };
}

function backdrop(glowX, glowY) {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${C.bg0}"/><stop offset="1" stop-color="${C.bg1}"/>
    </linearGradient>
    <radialGradient id="glow" cx="${glowX}" cy="${glowY}" r="0.5">
      <stop offset="0" stop-color="${C.accent}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${[1, 2, 3, 4, 5].map((i) => `<circle cx="${W * 0.82}" cy="${H * 0.5}" r="${i * 150}" fill="none" stroke="${C.accent}" stroke-width="1.5" opacity="${0.05 - i * 0.006}"/>`).join("")}`;
}

function headline(title, sub, x, y) {
  const lines = title.split("\n");
  let t = lines.map((l, i) => `<text x="${x}" y="${y + i * 92}" font-family="${mono}" font-size="76" fill="${C.onBg}" letter-spacing="-1">${esc(l)}</text>`).join("");
  t += `<text x="${x}" y="${y + lines.length * 92 + 28}" font-family="${mono}" font-size="34" fill="${C.onBgMuted}">${esc(sub)}</text>`;
  return t;
}

function screen(name, { title, sub, rows, extra, theme }) {
  C = theme === "light" ? LIGHT : DARK;
  const popW = 760;
  const popX = W - popW - 220;
  const tmp = boardPopover(popX, 0, popW, rows || []);
  const popY = (H - tmp.h) / 2;
  const pop = boardPopover(popX, popY, popW, rows || []);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${backdrop(0.78, 0.5)}
    ${headline(title, sub, 200, H / 2 - 70)}
    ${rows ? pop.svg : ""}
    ${extra || ""}
  </svg>`;
  const png = new Resvg(svg, { font: { fontFiles: [fontPath], defaultFontFamily: mono, loadSystemFonts: false } }).render().asPng();
  writeFileSync(join(OUT, name + ".png"), png);
  console.log("wrote", name + ".png");
}

// A macOS-style notification banner (for the alerts screen).
function notifBanner(x, y) {
  const w = 720, h = 150;
  return `<g transform="translate(${x},${y})">
    <rect x="0" y="0" width="${w}" height="${h}" rx="26" fill="${C.elevated}" stroke="${C.borderStrong}" stroke-width="1.5"/>
    <rect x="26" y="30" width="90" height="90" rx="20" fill="#0a0d12" stroke="${C.border}"/>
    ${aperture(71, 75, 26)}
    <text x="140" y="58" font-family="${mono}" font-size="26" fill="${C.primary}">Stripe: Degraded</text>
    <text x="140" y="96" font-family="${mono}" font-size="22" fill="${C.secondary}">Elevated API error rates</text>
    <text x="${w - 28}" y="44" text-anchor="end" font-family="${mono}" font-size="18" fill="${C.muted}">now</text>
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
  rows: [
    { name: "Stripe", level: "degraded" },
    { name: "Anthropic", level: "operational" },
    { name: "Slack", level: "operational" },
    { name: "MongoDB", level: "operational" },
  ],
  extra: notifBanner(W - 760 - 220, 150),
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

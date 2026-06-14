// Outage Observer — board renderer. Fetches the Worker's /api/status snapshot
// and renders the categorized board. "My Stack" is localStorage-only (no auth).

const CATEGORY_ORDER = [
  "Cloud & hosting", "Dev & CI", "Data & backend", "Payments", "Comms",
  "Auth & identity", "AI & model providers", "Collaboration", "CDN & edge",
  "Monitoring", "Commerce & CMS", "Analytics",
];

const LABELS = {
  operational: "Operational", maintenance: "Maintenance", degraded: "Degraded",
  partial_outage: "Partial outage", major_outage: "Major outage", unknown: "Unknown",
};
const SEV = { operational: 0, maintenance: 1, degraded: 2, partial_outage: 3, major_outage: 4, unknown: -1 };

// Glyph set from the design system (16x16, currentColor inherits the status fg).
const GLYPHS = {
  operational: '<circle cx="8" cy="8" r="4.5" fill="currentColor"/>',
  maintenance: '<path d="M8 3 L13 8 L8 13 L3 8 Z" fill="currentColor"/>',
  degraded: '<rect x="2.5" y="6.4" width="11" height="3.2" rx="1.6" fill="currentColor"/>',
  partial_outage: '<circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 3.5 A4.5 4.5 0 0 1 8 12.5 Z" fill="currentColor"/>',
  major_outage: '<path d="M4.6 4.6 L11.4 11.4 M11.4 4.6 L4.6 11.4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  unknown: '<circle cx="8" cy="8" r="4.3" fill="none" stroke="currentColor" stroke-width="2"/>',
};
const STAR = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.7l1.8 3.9 4.2.4-3.1 2.9.9 4.2L8 11.9 4.2 13.9l.9-4.2L2 6.8l4.2-.4z" fill="currentColor"/></svg>';

const STACK_KEY = "oo-stack";
const THEME_KEY = "oo-theme";

let BOARD = null;

function getStack() {
  try { return new Set(JSON.parse(localStorage.getItem(STACK_KEY) || "[]")); } catch { return new Set(); }
}
function saveStack(set) {
  try { localStorage.setItem(STACK_KEY, JSON.stringify([...set])); } catch {}
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function hhmm(d) {
  return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
}
function glyph(level, size) {
  return `<svg class="glyph" viewBox="0 0 16 16" width="${size || 11}" height="${size || 11}" aria-hidden="true">${GLYPHS[level] || GLYPHS.unknown}</svg>`;
}
function badge(level) {
  return `<span class="status-badge status-${level}">${glyph(level)}<span>${LABELS[level] || "Unknown"}</span></span>`;
}

function rowHtml(p, stack) {
  const pinned = stack.has(p.id);
  const initial = (p.name[0] || "?").toUpperCase();
  const incident = p.incident && p.incident.name
    ? `<span class="incident" title="${esc(p.incident.name)}">${esc(p.incident.name)}</span>`
    : '<span class="incident"></span>';
  const href = p.home ? esc(p.home) : "#";
  return `<div class="row" data-name="${esc(p.name.toLowerCase())}">`
    + `<a class="row-main" href="${href}" target="_blank" rel="noopener noreferrer">`
    + `<span class="logo">${esc(initial)}</span>`
    + `<span class="name">${esc(p.name)}</span>`
    + badge(p.level)
    + incident
    + `</a>`
    + `<button class="pin ${pinned ? "pinned" : ""}" data-id="${esc(p.id)}" aria-pressed="${pinned}" aria-label="${pinned ? "Remove from" : "Add to"} My Stack" title="${pinned ? "Remove from" : "Add to"} My Stack">${STAR}</button>`
    + `</div>`;
}

function summaryHtml(providers, updated) {
  const total = providers.length;
  const time = updated ? hhmm(updated) + " UTC" : "—";
  const bad = providers.filter((p) => p.level !== "operational" && p.level !== "unknown");
  if (!bad.length) {
    return '<div class="summary">'
      + `<div class="tile status-operational">${glyph("operational", 18)}</div>`
      + `<div><div class="s-title">All systems normal</div><div class="s-sub">${total} services · checked ${time}</div></div>`
      + '<span class="pulse-dot"></span></div>';
  }
  let worst = "operational";
  const counts = {};
  for (const p of bad) { if (SEV[p.level] > SEV[worst]) worst = p.level; counts[p.level] = (counts[p.level] || 0) + 1; }
  const parts = [];
  for (const k of ["major_outage", "partial_outage", "degraded", "maintenance"]) {
    if (counts[k]) parts.push(counts[k] + " " + LABELS[k].toLowerCase());
  }
  return `<div class="summary loud" style="--summary-fg:var(--oo-status-${worst}-fg)">`
    + `<div class="tile status-${worst}">${glyph(worst, 18)}</div>`
    + `<div><div class="s-title">${bad.length} service${bad.length > 1 ? "s" : ""} need attention</div>`
    + `<div class="s-sub">${parts.join(" · ")} · ${time}</div></div></div>`;
}

function noData() {
  return '<div class="empty">'
    + `<svg class="glyph-lg" viewBox="0 0 16 16" width="32" height="32" aria-hidden="true">${GLYPHS.unknown}</svg>`
    + '<div class="e-title">No data yet</div>'
    + '<div class="e-line">The first check runs within ~60 seconds; services read as <span class="mono">unknown</span> until then.</div>'
    + '</div>';
}

function skeleton() {
  let rows = "";
  for (let i = 0; i < 8; i++) {
    rows += '<div class="row skel"><div class="logo sk"></div><div class="sk-bar" style="width:120px"></div><div class="sk-bar" style="width:84px"></div></div>';
  }
  return '<div class="summary"><div class="tile sk" style="width:42px;height:42px;border-radius:11px"></div>'
    + '<div><div class="sk-bar" style="width:150px;height:14px"></div><div class="sk-bar" style="width:210px;height:10px;margin-top:8px"></div></div></div>' + rows;
}

function render() {
  const body = document.getElementById("board-body");
  const updEl = document.getElementById("updated");
  if (!BOARD) { body.innerHTML = skeleton(); return; }

  const providers = BOARD.providers || [];
  const updated = BOARD.updatedAt ? new Date(BOARD.updatedAt) : null;
  updEl.textContent = updated ? "updated " + hhmm(updated) + " UTC" : "";

  if (!providers.length) { body.innerHTML = noData(); return; }

  const stack = getStack();
  let html = summaryHtml(providers, updated);

  // My Stack (pinned, localStorage)
  const mine = providers.filter((p) => stack.has(p.id));
  html += `<div class="cat mystack"><span class="star">${STAR}</span><span class="label">My Stack</span><span class="chip">saved locally</span><span class="rule"></span></div>`;
  html += mine.length
    ? mine.map((p) => rowHtml(p, stack)).join("")
    : '<div class="hint mono">Star a service to pin it here.</div>';

  // Categories
  for (const cat of CATEGORY_ORDER) {
    const inCat = providers.filter((p) => p.category === cat);
    if (!inCat.length) continue;
    html += `<div class="cat"><span class="label">${esc(cat)}</span><span class="count mono">${inCat.length}</span><span class="rule"></span></div>`;
    html += inCat.map((p) => rowHtml(p, stack)).join("");
  }

  body.innerHTML = html;
  applyFilter();
}

function applyFilter() {
  const q = (document.getElementById("filter").value || "").trim().toLowerCase();
  document.querySelectorAll(".row").forEach((r) => {
    r.style.display = !q || (r.dataset.name || "").includes(q) ? "" : "none";
  });
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem(THEME_KEY, next); } catch {}
}

document.addEventListener("click", (e) => {
  const pin = e.target.closest(".pin");
  if (pin) {
    const id = pin.dataset.id;
    const stack = getStack();
    if (stack.has(id)) stack.delete(id); else stack.add(id);
    saveStack(stack);
    render();
    return;
  }
  if (e.target.closest("#theme")) toggleTheme();
});
document.getElementById("filter").addEventListener("input", applyFilter);

async function load() {
  try {
    const res = await fetch("/api/status", { headers: { accept: "application/json" } });
    BOARD = await res.json();
  } catch {
    if (!BOARD) BOARD = { updatedAt: null, providers: [] };
  }
  render();
}

render();          // skeleton
load();            // first fetch
setInterval(load, 60000);

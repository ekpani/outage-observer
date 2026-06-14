// Outage Observer — board renderer. Fetches the Worker's /api/status snapshot
// and renders a personal board. "My Stack" is localStorage-only (no auth):
// pick the services you depend on, the top banner is scoped to just those, and
// the full catalog stays one tap away for adding more or browsing.

const CATEGORY_ORDER = [
  "Cloud & hosting", "Dev & CI", "Data & backend", "Payments", "Comms",
  "Auth & identity", "AI & model providers", "Collaboration", "CDN & edge",
  "Monitoring", "Commerce & CMS", "Analytics",
];

const LABELS = {
  operational: "Operational", maintenance: "Maintenance", degraded: "Degraded",
  partial_outage: "Partial outage", major_outage: "Major outage", unknown: "Unknown",
};
// How a single service reads in a sentence ("Stripe is down"). No em-dashes.
const PHRASE = {
  operational: "back to normal", maintenance: "in maintenance", degraded: "degraded",
  partial_outage: "partly down", major_outage: "down", unknown: "not reporting",
};
const SEV = { operational: 0, maintenance: 1, degraded: 2, partial_outage: 3, major_outage: 4, unknown: -1 };

// A few commonly-watched services offered as INDIVIDUAL quick-adds to break the
// blank page (tap one at a time). Mirrors POPULAR_IDS in the Worker. Not a bulk
// "add all" and not a blessed "essentials" set — we don't decide what you need.
const POPULAR = ["cloudflare", "aws", "github", "vercel", "openai", "anthropic", "stripe", "slack"];

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
const PLUS = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3 V13 M3 8 H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const X = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
const ARROW = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 8 H12 M8.5 4.5 L12 8 L8.5 11.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Provider id -> Simple Icons slug, only where they differ. Everything else
// uses the id as-is; a missing icon 404s and app.js drops the <img> (onerror),
// leaving the monogram fallback.
const SLUGS = {
  gcp: "googlecloud", aws: "amazonwebservices", azure: "microsoftazure",
  fly: "flydotio", travis: "travisci", cockroach: "cockroachlabs",
  onepassword: "1password", monday: "mondaydotcom", getstream: "stream",
};

const STACK_KEY = "oo-stack";
const THEME_KEY = "oo-theme";

let BOARD = null;
let VIEW = null;   // 'board' | 'browse'; null = decide from stack on first render

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
// A service needs attention if it is actively unhealthy. Unknown (not yet
// fetched / a failed fetch) is neutral and never alarms — the no-fake-news rule.
function needsAttention(p) {
  return p.level !== "operational" && p.level !== "unknown";
}
function logoTile(p) {
  const initial = (p.name[0] || "?").toUpperCase();
  const slug = SLUGS[p.id] || p.id;
  return `<span class="logo">${esc(initial)}<img src="https://cdn.simpleicons.org/${esc(slug)}/9aa0a6" alt="" loading="lazy" onerror="this.remove()"></span>`;
}

function rowHtml(p, stack, mode) {
  const pinned = stack.has(p.id);
  const incident = p.incident && p.incident.name
    ? `<span class="incident" title="${esc(p.incident.name)}">${esc(p.incident.name)}</span>`
    : '<span class="incident"></span>';
  const href = p.home ? esc(p.home) : "#";
  // On the board, every row is yours, so the control is an explicit Remove (×).
  // In the picker it's an add / added toggle.
  const control = mode === "board"
    ? `<button class="pin remove" data-id="${esc(p.id)}" aria-label="Remove ${esc(p.name)} from your board" title="Remove from board">${X}</button>`
    : `<button class="pin ${pinned ? "pinned" : ""}" data-id="${esc(p.id)}" aria-pressed="${pinned}" aria-label="${pinned ? "Remove from" : "Add to"} board" title="${pinned ? "Remove from" : "Add to"} board">${pinned ? STAR : PLUS}</button>`;
  return `<div class="row ${pinned ? "added" : ""}" data-name="${esc(p.name.toLowerCase())}">`
    + `<a class="row-main" href="${href}" target="_blank" rel="noopener noreferrer">`
    + logoTile(p)
    + `<span class="name">${esc(p.name)}</span>`
    + badge(p.level)
    + incident
    + `</a>`
    + control
    + `</div>`;
}

// ---- Scoped summary: answers "is anything *I* depend on broken?" ----
function chip(p) {
  const href = p.home ? esc(p.home) : "#";
  return `<a class="chip-status status-${p.level}" href="${href}" target="_blank" rel="noopener noreferrer">`
    + glyph(p.level) + `<span>${esc(p.name)}</span></a>`;
}

function scopedSummary(tracked, checked) {
  const time = checked ? hhmm(checked) + " UTC" : "—";
  const bad = tracked.filter(needsAttention).sort((a, b) => SEV[b.level] - SEV[a.level]);
  const known = tracked.filter((p) => p.level !== "unknown");

  if (!bad.length) {
    const sub = known.length
      ? `${tracked.length} service${tracked.length > 1 ? "s" : ""} watched · checked ${time}`
      : `checking your stack · ${time}`;
    const title = known.length ? "All clear" : "Getting first reading";
    return '<div class="summary">'
      + `<div class="tile status-operational">${glyph("operational", 18)}</div>`
      + `<div><div class="s-title">${title}</div><div class="s-sub">${sub}</div></div>`
      + '<span class="pulse-dot"></span></div>';
  }

  const worst = bad[0].level;
  const title = bad.length === 1
    ? `${esc(bad[0].name)} is ${PHRASE[bad[0].level]}`
    : `${bad.length} of your services need attention`;
  return `<div class="summary loud" style="--summary-fg:var(--oo-status-${worst}-fg)">`
    + `<div class="tile status-${worst}">${glyph(worst, 18)}</div>`
    + `<div class="s-body"><div class="s-title">${title}</div>`
    + `<div class="s-sub">checked ${time}</div>`
    + `<div class="affected">${bad.map(chip).join("")}</div></div></div>`;
}

// ---- Board view: your stack only, problems first ----
function boardHtml(providers, stack, checked) {
  const tracked = providers
    .filter((p) => stack.has(p.id))
    .sort((a, b) => SEV[b.level] - SEV[a.level] || a.name.localeCompare(b.name));

  let html = scopedSummary(tracked, checked);
  html += `<div class="cat mystack"><span class="star">${STAR}</span><span class="label">My Stack</span><span class="count mono">${tracked.length}</span><span class="rule"></span></div>`;
  html += tracked.map((p) => rowHtml(p, stack, "board")).join("");

  const elsewhere = providers.filter((p) => !stack.has(p.id) && needsAttention(p)).length;
  const note = elsewhere
    ? `<span class="ml">${elsewhere} with incidents elsewhere</span>`
    : `<span class="ml">${providers.length - tracked.length} more</span>`;
  html += `<button class="browse-cta" data-act="browse">${PLUS}<span>Add or browse all services</span>${note}</button>`;
  return html;
}

// ---- Browse / onboarding view: the full catalog as a tap-to-add picker ----
function browseHtml(providers, stack, checked) {
  const onboarding = stack.size === 0;
  const incidents = providers.filter(needsAttention).length;

  let head = '<div class="pick-head">';
  if (onboarding) {
    head += '<div class="ph-title">Build your board</div>'
      + '<div class="ph-sub">Search for the services your product depends on, or tap a popular one to start. Outage Observer watches just those and stays quiet about the rest.</div>';
  } else {
    head += '<div class="ph-title">Add services</div>'
      + '<div class="ph-sub">Search by name, or tap to add. Your picks stay on this device.</div>'
      + '<div class="ph-actions">'
      + `<button class="btn btn-primary" data-act="board">View my board (${stack.size}) ${ARROW}</button>`
      + '</div>';
  }
  // Individual popular quick-adds (only the ones not already on your board).
  const pop = POPULAR.map((id) => providers.find((p) => p.id === id)).filter((p) => p && !stack.has(p.id));
  if (pop.length) {
    head += '<div class="popular"><span class="pl-label mono">Popular</span>'
      + pop.map((p) => `<button class="qa-chip" data-add="${esc(p.id)}" title="Add ${esc(p.name)}">${PLUS}<span>${esc(p.name)}</span></button>`).join("")
      + '</div>';
  }
  head += '</div>';

  const strip = `<div class="browse-stat mono">`
    + (incidents
      ? `${glyph("degraded")}<span>${incidents} service${incidents > 1 ? "s" : ""} reporting incidents right now</span>`
      : `${glyph("operational")}<span>all ${providers.length} services operational</span>`)
    + (checked ? `<span class="bs-time">checked ${hhmm(checked)} UTC</span>` : "")
    + `</div>`;

  let html = head + strip;
  for (const cat of CATEGORY_ORDER) {
    const inCat = providers.filter((p) => p.category === cat);
    if (!inCat.length) continue;
    const picked = inCat.filter((p) => stack.has(p.id)).length;
    html += `<div class="cat"><span class="label">${esc(cat)}</span>`
      + `<span class="count mono">${picked ? picked + "/" : ""}${inCat.length}</span><span class="rule"></span></div>`;
    html += inCat.map((p) => rowHtml(p, stack, "browse")).join("");
  }
  return html;
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
  const checked = BOARD.checkedAt ? new Date(BOARD.checkedAt) : (BOARD.updatedAt ? new Date(BOARD.updatedAt) : null);
  updEl.textContent = checked ? "checked " + hhmm(checked) + " UTC" : "";

  if (!providers.length) { body.innerHTML = noData(); return; }

  const stack = getStack();
  const rss = document.getElementById("rss-link");
  if (rss) rss.href = stack.size ? "/feed.xml?ids=" + [...stack].join(",") : "/feed.xml";
  if (VIEW === null) VIEW = stack.size ? "board" : "browse";
  if (stack.size === 0) VIEW = "browse";   // no stack -> always the picker

  body.innerHTML = VIEW === "browse"
    ? browseHtml(providers, stack, checked)
    : boardHtml(providers, stack, checked);

  document.body.dataset.view = VIEW;
  applyFilter();
}

function setView(v) { VIEW = v; render(); }

function applyFilter() {
  const q = (document.getElementById("filter").value || "").trim().toLowerCase();
  // While searching, collapse category/section chrome to a flat result list.
  document.body.dataset.searching = q ? "1" : "0";
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
  const act = e.target.closest("[data-act]");
  if (act) {
    const a = act.dataset.act;
    if (a === "browse") return setView("browse");
    if (a === "board") return setView("board");
  }
  const addBtn = e.target.closest("[data-add]");
  if (addBtn) {
    const stack = getStack();
    stack.add(addBtn.dataset.add);
    saveStack(stack);
    render();           // stay in the picker so you can add several
    return;
  }
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

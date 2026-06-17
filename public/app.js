// Outage Observer — board renderer. Fetches the Worker's /api/status snapshot
// and renders a personal board. "Observing" (the services you track) is localStorage-only (no auth):
// pick the services you depend on, the top banner is scoped to just those, and
// the full catalog stays one tap away for adding more or browsing.

const CATEGORY_ORDER = [
  "Cloud & hosting", "AI & model providers", "Dev & CI", "Data & backend",
  "Payments", "Comms", "CDN & edge", "Auth & identity", "Collaboration",
  "Monitoring", "Commerce & CMS", "Analytics",
  "Social & community", "Gaming & streaming", "Finance & crypto", "Consumer & lifestyle",
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
  wikimedia: "wikipedia", proton: "protonmail", epicgames: "epicgames",
};


const STACK_KEY = "oo-stack";
const THEME_KEY = "oo-theme";
const PUSH_ON_KEY = "oo-push-on";
const PUSH_TOKEN_KEY = "oo-push-token";
const NOTIFY_DISMISS_KEY = "oo-notify-dismissed";

let BOARD = null;
let VIEW = null;   // 'board' | 'browse'; null = decide from stack on first render
let SUGGESTIONS = [];   // most-requested services (crowd-sourced)
let REQ_DRAFT = "";     // preserve the request input across re-renders

async function loadSuggestions() {
  try {
    const r = await fetch("/api/suggest", { cache: "no-store" });
    SUGGESTIONS = (await r.json()).suggestions || [];
  } catch (e) { /* leave as-is */ }
}

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
  // Row links to the provider's Outage Observer page (which itself links out to
  // the vendor's official status page). Internal nav, same tab.
  const href = "/status/" + encodeURIComponent(p.id);
  // On the board, every row is yours, so the control is an explicit Remove (×).
  // In the picker it's an add / added toggle.
  const control = mode === "board"
    ? `<button class="pin remove" data-id="${esc(p.id)}" aria-label="Stop observing ${esc(p.name)}" title="Stop observing">${X}</button>`
    : `<button class="pin ${pinned ? "pinned" : ""}" data-id="${esc(p.id)}" aria-pressed="${pinned}" aria-label="${pinned ? "Stop observing" : "Observe"} ${esc(p.name)}" title="${pinned ? "Stop observing" : "Observe"}">${pinned ? STAR : PLUS}</button>`;
  return `<div class="row ${pinned ? "added" : ""}" data-name="${esc(p.name.toLowerCase())}">`
    + `<a class="row-main" href="${href}">`
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
  const href = "/status/" + encodeURIComponent(p.id);
  return `<a class="chip-status status-${p.level}" href="${href}">`
    + glyph(p.level) + `<span>${esc(p.name)}</span></a>`;
}

function scopedSummary(tracked, checked, boardWideDown) {
  const time = checked ? hhmm(checked) + " UTC" : "—";
  const bad = tracked.filter(needsAttention).sort((a, b) => SEV[b.level] - SEV[a.level]);
  const known = tracked.filter((p) => p.level !== "unknown");

  if (!bad.length) {
    const sub = known.length
      ? `observing ${tracked.length} service${tracked.length > 1 ? "s" : ""} · checked ${time}`
      : `observing ${tracked.length} service${tracked.length > 1 ? "s" : ""} · checking…`;
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
  // "Is it just me?" — when several of your services break at once it's almost
  // never your setup; if the whole board is lit up, it's a wide outage.
  let corr = "";
  if (bad.length >= 2) {
    corr = (boardWideDown >= 5)
      ? '<div class="s-corr">⚡ A wide outage is hitting many providers right now, likely not your setup.</div>'
      : '<div class="s-corr">Several of your services are down at once, likely a broader incident rather than your setup.</div>';
  }
  return `<div class="summary loud" style="--summary-fg:var(--oo-status-${worst}-fg)">`
    + `<div class="tile status-${worst}">${glyph(worst, 18)}</div>`
    + `<div class="s-body"><div class="s-title">${title}</div>`
    + `<div class="s-sub">checked ${time}</div>${corr}`
    + `<div class="affected">${bad.map(chip).join("")}</div></div></div>`;
}

// ---- Board view: your stack only, problems first ----
function boardHtml(providers, stack, checked) {
  const tracked = providers
    .filter((p) => stack.has(p.id))
    .sort((a, b) => SEV[b.level] - SEV[a.level] || a.name.localeCompare(b.name));

  let html = scopedSummary(tracked, checked, providers.filter(needsAttention).length);
  html += `<div class="cat mystack"><span class="star">${STAR}</span><span class="label">Observing</span><span class="count mono">${tracked.length}</span><span class="rule"></span></div>`;
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
    head += '<div class="ph-title">Start observing</div>'
      + '<div class="ph-sub">Search for the services your product depends on, or tap a popular one to start. Outage Observer watches just those and stays quiet about the rest.</div>';
  } else {
    head += '<div class="ph-title">Add services</div>'
      + '<div class="ph-sub">Search by name, or tap to add. Your picks stay on this device.</div>'
      + '<div class="ph-actions">'
      + `<button class="btn btn-primary" data-act="board">View board (${stack.size}) ${ARROW}</button>`
      + '</div>';
  }
  // Individual popular quick-adds (only the ones not already observed).
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
  // Crowd-sourced requests: ask for what's missing; we add the popular ones.
  const top = SUGGESTIONS.length
    ? '<div class="req-top">Most requested: '
      + SUGGESTIONS.slice(0, 6).map((s) => `<span class="req-chip">${esc(s.name)} <b>${s.votes}</b></span>`).join("")
      + '</div>'
    : "";
  html += '<div class="req-box">'
    + '<div class="req-title">Don’t see a service you depend on?</div>'
    + `<div class="req-row"><input id="req-name" class="req-input" placeholder="Name a service to request…" maxlength="60" value="${esc(REQ_DRAFT)}" />`
    + `<button class="btn btn-primary" data-act="suggest">Request</button></div>`
    + '<div class="req-state" id="req-state"></div>'
    + top
    + '</div>';
  return html;
}

async function submitSuggestion() {
  const input = document.getElementById("req-name");
  const state = document.getElementById("req-state");
  const name = (input && input.value || "").trim();
  if (name.length < 2) { if (state) state.textContent = "Type a service name first."; return; }
  if (state) state.textContent = "Sending…";
  try {
    const r = await fetch("/api/suggest", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name }),
    });
    const d = await r.json().catch(() => ({}));
    if (d.already) { if (state) state.textContent = `${d.name} is already tracked — search for it above.`; }
    else if (r.ok && d.ok) {
      REQ_DRAFT = "";
      if (state) state.textContent = `Thanks — ${d.name} now has ${d.votes} request${d.votes === 1 ? "" : "s"}.`;
      await loadSuggestions();
      render();
    } else { if (state) state.textContent = (d.error || "Could not send — try again."); }
  } catch (e) { if (state) state.textContent = "Network error — try again."; }
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

function staleBanner(min) {
  const age = min === Infinity ? "an unknown age" : (min >= 120 ? Math.round(min / 60) + " hours" : Math.round(min) + " min");
  return '<div class="stale-banner">'
    + '<strong>⚠ This board may be out of date.</strong> '
    + 'The last status check was ' + age + ' ago. Treat these as stale until it refreshes.'
    + '</div>';
}

function render() {
  const body = document.getElementById("board-body");
  const updEl = document.getElementById("updated");
  if (!BOARD) { body.innerHTML = skeleton(); return; }

  const providers = BOARD.providers || [];
  const checked = BOARD.checkedAt ? new Date(BOARD.checkedAt) : (BOARD.updatedAt ? new Date(BOARD.updatedAt) : null);
  // Staleness guard: the board must NEVER quietly show old statuses as if live.
  // If the checked time is too old (the poller stalled), say so loudly.
  const staleMin = checked ? (Date.now() - checked.getTime()) / 60000 : Infinity;
  const stale = staleMin > 10;
  updEl.textContent = checked ? (stale ? "⚠ stale · " : "checked ") + hhmm(checked) + " UTC" : "";
  updEl.classList.toggle("stale", stale);

  if (!providers.length) { body.innerHTML = noData(); return; }

  const stack = getStack();
  const rssHref = stack.size ? "/feed.xml?ids=" + [...stack].join(",") : "/feed.xml";
  const rss = document.getElementById("rss-link");
  if (rss) rss.href = rssHref;
  const rss2 = document.getElementById("rss-link2");
  if (rss2) rss2.href = rssHref;
  const notify = document.getElementById("notify");
  // Show once you have a stack, unless you've dismissed it (footer "alerts" brings it back).
  if (notify) notify.hidden = stack.size === 0 || localStorage.getItem(NOTIFY_DISMISS_KEY) === "1";
  if (VIEW === null) VIEW = stack.size ? "board" : "browse";
  if (stack.size === 0) VIEW = "browse";   // no stack -> always the picker

  let html = VIEW === "browse"
    ? browseHtml(providers, stack, checked)
    : boardHtml(providers, stack, checked);
  if (stale) html = staleBanner(staleMin) + html;
  body.innerHTML = html;

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
    if (a === "suggest") return submitSuggestion();
  }
  const addBtn = e.target.closest("[data-add]");
  if (addBtn) {
    const stack = getStack();
    stack.add(addBtn.dataset.add);
    saveStack(stack);
    render();           // stay in the picker so you can add several
    syncPushIfEnabled();
    maybeAutoPromptPush();   // first board -> offer browser alerts (this click is the gesture)
    return;
  }
  const pin = e.target.closest(".pin");
  if (pin) {
    const id = pin.dataset.id;
    const stack = getStack();
    const added = !stack.has(id);
    if (added) stack.add(id); else stack.delete(id);
    saveStack(stack);
    render();
    syncPushIfEnabled();
    if (added) maybeAutoPromptPush();
    return;
  }
  if (e.target.closest("#theme")) toggleTheme();
});
document.addEventListener("input", (e) => { if (e.target && e.target.id === "req-name") REQ_DRAFT = e.target.value; });
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target && e.target.id === "req-name") { e.preventDefault(); submitSuggestion(); } });
document.getElementById("filter").addEventListener("input", applyFilter);

// Connect a Slack/Discord incoming webhook to the services you're observing.
async function connectWebhook() {
  const input = document.getElementById("hook-url");
  const msg = document.getElementById("hook-msg");
  const btn = document.getElementById("hook-connect");
  const url = (input.value || "").trim();
  const providers = [...getStack()];
  const setMsg = (t, cls) => { msg.textContent = t; msg.className = "notify-msg" + (cls ? " " + cls : ""); };
  if (!url) return setMsg("Paste a Slack or Discord webhook URL first.", "err");
  if (!providers.length) return setMsg("Start observing some services first.", "err");
  setMsg("Connecting…");
  btn.disabled = true;
  try {
    const res = await fetch("/api/webhook/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, providers }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      setMsg(`Connected to ${data.kind}. Watching ${data.count} service${data.count > 1 ? "s" : ""} — check the channel for a confirmation.`, "ok");
      input.value = "";
    } else {
      setMsg(data.error || "Could not connect. Check the URL and try again.", "err");
    }
  } catch {
    setMsg("Network error. Try again.", "err");
  }
  btn.disabled = false;
}
const hookBtn = document.getElementById("hook-connect");
if (hookBtn) hookBtn.addEventListener("click", connectWebhook);

// ---- Web Push ----
function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
// First time someone builds a board, offer browser alerts (once). Called from a
// click handler so the permission prompt counts as a user gesture. Only fires
// when permission hasn't been decided yet, so it's never naggy.
const PUSH_PROMPTED_KEY = "oo-push-prompted";
function maybeAutoPromptPush() {
  try {
    if (localStorage.getItem(PUSH_PROMPTED_KEY)) return;
    if (!pushSupported() || typeof Notification === "undefined") return;
    if (getStack().size < 1) return;
    localStorage.setItem(PUSH_PROMPTED_KEY, "1");   // only ever once
    if (Notification.permission !== "default") return;   // already granted/denied
    if (localStorage.getItem(PUSH_ON_KEY) === "1") return;
    enablePush();
  } catch {}
}
function urlB64ToU8(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function refreshPushUI() {
  const row = document.getElementById("push-row");
  const btn = document.getElementById("push-toggle");
  const state = document.getElementById("push-state");
  if (!row || !btn) return;
  if (!pushSupported()) { row.hidden = true; return; }
  row.hidden = false;
  const on = localStorage.getItem(PUSH_ON_KEY) === "1";
  btn.textContent = on ? "🔔 Browser alerts on" : "🔔 Enable browser alerts";
  btn.classList.toggle("on", on);
  if (state) state.textContent = on ? "tap to turn off" : "";
}
async function enablePush() {
  const state = document.getElementById("push-state");
  const set = (t) => { if (state) state.textContent = t; };
  const providers = [...getStack()];
  if (!providers.length) return set("start observing some services first");

  // iOS/iPadOS only allow web push from a Home-Screen web app, not a Safari tab.
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  if (isApple && !standalone) {
    return set("on iPhone/iPad: Share → Add to Home Screen, then open it from there and tap the bell (Safari tabs can't do push)");
  }

  try {
    // Already denied: the browser won't re-prompt — it must be reset in site settings.
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      return set("blocked in your browser. Open site settings (the lock/⋮ icon in the address bar → Notifications) → Allow, then tap the bell again");
    }
    const perm = await Notification.requestPermission();
    if (perm === "denied") return set("you chose Block. Reset it in site settings (lock icon → Notifications → Allow), then tap again");
    if (perm !== "granted") return set("permission dismissed — tap the bell again and choose Allow");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const { key } = await (await fetch("/api/push/key")).json();
    if (!key) return set("push not available right now");
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(key) });
    const res = await fetch("/api/push/subscribe", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), providers }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      localStorage.setItem(PUSH_TOKEN_KEY, data.token);
      localStorage.setItem(PUSH_ON_KEY, "1");
      refreshPushUI();
    } else { set(data.error || "could not enable"); }
  } catch (e) {
    // Surface the real reason instead of a generic failure (helps debugging).
    set("couldn't enable: " + ((e && (e.message || e.name)) || "unknown error"));
  }
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) await sub.unsubscribe();
  } catch {}
  const token = localStorage.getItem(PUSH_TOKEN_KEY);
  if (token) {
    try { await fetch("/api/push/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }); } catch {}
  }
  localStorage.removeItem(PUSH_ON_KEY);
  localStorage.removeItem(PUSH_TOKEN_KEY);
  refreshPushUI();
}
// Keep the server's provider set in sync with what you're observing when push is on.
async function syncPushIfEnabled() {
  if (localStorage.getItem(PUSH_ON_KEY) !== "1" || !pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (!sub) return;
    const providers = [...getStack()];
    if (!providers.length) return disablePush();
    await fetch("/api/push/subscribe", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), providers }),
    });
  } catch {}
}
const pushBtn = document.getElementById("push-toggle");
if (pushBtn) pushBtn.addEventListener("click", () => {
  if (localStorage.getItem(PUSH_ON_KEY) === "1") disablePush(); else enablePush();
});
refreshPushUI();

// ---- Dismissable alerts panel ----
const notifyClose = document.getElementById("notify-close");
if (notifyClose) notifyClose.addEventListener("click", () => {
  try { localStorage.setItem(NOTIFY_DISMISS_KEY, "1"); } catch {}
  const n = document.getElementById("notify");
  if (n) n.hidden = true;
});
const alertsLink = document.getElementById("alerts-link");
if (alertsLink) alertsLink.addEventListener("click", (e) => {
  e.preventDefault();
  try { localStorage.removeItem(NOTIFY_DISMISS_KEY); } catch {}
  render();
  const n = document.getElementById("notify");
  if (n && !n.hidden) n.scrollIntoView({ behavior: "smooth", block: "center" });
});

// ---- Responsive header search placeholder ----
function setFilterPlaceholder() {
  const f = document.getElementById("filter");
  if (f) f.placeholder = window.innerWidth <= 560 ? "Search" : "Search services…";
}
setFilterPlaceholder();
window.addEventListener("resize", setFilterPlaceholder);

// ---- Command palette (⌘K) + keyboard shortcuts ----
const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || "") || /Mac/.test(navigator.userAgent);
let palItems = [];
let palSel = 0;

function paletteEl() { return document.getElementById("palette"); }
function paletteOpen() { const p = paletteEl(); return p && !p.hidden; }

function commandList() {
  return [
    { kind: "cmd", label: "Browse all services", hint: "catalog", run: () => { closePalette(); setView("browse"); } },
    { kind: "cmd", label: "My board", hint: "your stack", run: () => { closePalette(); setView("board"); } },
    { kind: "cmd", label: "Enable browser alerts", hint: "web push", run: () => { closePalette(); enablePush(); } },
    { kind: "cmd", label: "Toggle light / dark", hint: "theme", run: () => { toggleTheme(); } },
    { kind: "cmd", label: "All providers", hint: "status directory", run: () => { location.href = "/status"; } },
    { kind: "cmd", label: "Open RSS feed", hint: "atom", run: () => { const s = getStack(); location.href = s.size ? "/feed.xml?ids=" + [...s].join(",") : "/feed.xml"; } },
  ];
}

function buildPaletteItems(query) {
  const q = query.trim().toLowerCase();
  const cmds = commandList();
  if (!q) return cmds;
  const cmdMatch = cmds.filter((c) => c.label.toLowerCase().includes(q));
  const provs = (BOARD && BOARD.providers) || [];
  const pMatch = provs
    .filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q))
    .sort((a, b) => (b.name.toLowerCase().startsWith(q) || b.id.startsWith(q) ? 0 : 1) - (a.name.toLowerCase().startsWith(q) || a.id.startsWith(q) ? 0 : 1) || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((p) => ({ kind: "prov", label: p.name, level: p.level, hint: LABELS[p.level] || "", run: () => { location.href = "/status/" + encodeURIComponent(p.id); } }));
  return [...cmdMatch, ...pMatch];
}

function renderPalette() {
  const box = document.getElementById("palette-results");
  if (!box) return;
  if (!palItems.length) { box.innerHTML = '<div class="pal-empty">No matches.</div>'; return; }
  palSel = Math.max(0, Math.min(palItems.length - 1, palSel));
  box.innerHTML = palItems.map((it, i) => {
    const icon = it.kind === "prov"
      ? `<span class="pal-icon" style="color:var(--oo-status-${it.level}-fg)"><span class="pal-dot"></span></span>`
      : '<span class="pal-icon">›</span>';
    return `<div class="pal-item${i === palSel ? " pal-sel" : ""}" role="option" data-i="${i}" aria-selected="${i === palSel}">`
      + icon + `<span class="pal-label">${esc(it.label)}</span><span class="pal-hint">${esc(it.hint || "")}</span></div>`;
  }).join("");
  const sel = box.querySelector(".pal-sel");
  if (sel) sel.scrollIntoView({ block: "nearest" });
}

function openPalette() {
  const p = paletteEl();
  if (!p) return;
  p.hidden = false;
  const input = document.getElementById("palette-input");
  input.value = "";
  palItems = buildPaletteItems("");
  palSel = 0;
  renderPalette();
  input.focus();
}
function closePalette() { const p = paletteEl(); if (p) p.hidden = true; }
function togglePalette() { paletteOpen() ? closePalette() : openPalette(); }
function moveSel(d) { palSel = Math.max(0, Math.min(palItems.length - 1, palSel + d)); renderPalette(); }
function runSel() { const it = palItems[palSel]; if (it) it.run(); }

const palInput = document.getElementById("palette-input");
if (palInput) palInput.addEventListener("input", () => { palItems = buildPaletteItems(palInput.value); palSel = 0; renderPalette(); });
const palResults = document.getElementById("palette-results");
if (palResults) {
  palResults.addEventListener("mousemove", (e) => { const it = e.target.closest(".pal-item"); if (it && +it.dataset.i !== palSel) { palSel = +it.dataset.i; renderPalette(); } });
  palResults.addEventListener("click", (e) => { const it = e.target.closest(".pal-item"); if (it) { palSel = +it.dataset.i; runSel(); } });
}
const palOverlay = paletteEl();
if (palOverlay) palOverlay.addEventListener("mousedown", (e) => { if (e.target === palOverlay) closePalette(); });
const cmdkBtn = document.getElementById("cmdk");
if (cmdkBtn) { if (!IS_MAC) { const k = cmdkBtn.querySelector("kbd"); if (k) k.textContent = "Ctrl K"; } cmdkBtn.addEventListener("click", openPalette); }

function isTyping(el) {
  if (!el) return false;
  const t = el.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || el.isContentEditable;
}
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); togglePalette(); return; }
  if (paletteOpen()) {
    if (e.key === "Escape") { e.preventDefault(); closePalette(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveSel(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSel(-1); }
    else if (e.key === "Enter") { e.preventDefault(); runSel(); }
    return;
  }
  if (isTyping(e.target)) { if (e.key === "Escape") e.target.blur(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "/") { e.preventDefault(); const f = document.getElementById("filter"); if (f) f.focus(); }
  else if (e.key === "t" || e.key === "T") { toggleTheme(); }
  else if (e.key === "?") { e.preventDefault(); openPalette(); }
});

async function load() {
  try {
    // no-store: this is live status. The zone applies a long browser-cache TTL,
    // which would otherwise make every refresh (and the 60s auto-refresh) re-read
    // a stale cached copy instead of the edge. Always go to the network.
    const res = await fetch("/api/status", { headers: { accept: "application/json" }, cache: "no-store" });
    BOARD = await res.json();
  } catch {
    if (!BOARD) BOARD = { updatedAt: null, providers: [] };
  }
  render();
}

render();          // skeleton
load();            // first fetch
loadSuggestions().then(() => { if (VIEW === "browse") render(); });
setInterval(load, 60000);

// ---- PWA: register the service worker + a light, dismissible install nudge ----
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

(function installAffordance() {
  const KEY = "oo-install-dismissed";
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone || localStorage.getItem(KEY) === "1") return;
  let deferred = null;

  function bar(inner) {
    const el = document.createElement("div");
    el.className = "install-bar";
    el.innerHTML = inner + '<button class="install-x" aria-label="Dismiss">✕</button>';
    el.querySelector(".install-x").addEventListener("click", () => { el.remove(); try { localStorage.setItem(KEY, "1"); } catch (e) {} });
    document.body.appendChild(el);
    return el;
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferred = e;
    const el = bar('<span>Install Outage Observer for one-tap status and alerts.</span><button class="install-go">Install</button>');
    el.querySelector(".install-go").addEventListener("click", () => { el.remove(); if (deferred) deferred.prompt(); });
  });
  // iOS Safari has no install prompt API, and Web Push needs a Home-Screen install.
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    bar('<span>📲 Add to Home Screen (tap Share, then “Add to Home Screen”) to get outage alerts on iPhone.</span>');
  }
})();

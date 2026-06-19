import { CATALOG, CATEGORY_ORDER, ALIASES, type Provider } from "./catalog";
import { POINTERS, POINTER_BY_ID, type Pointer } from "./pointers";
import { COMPETITORS, COMPARE_BY_SLUG, COMPARE_GROUPS, OO_EDGE, type Competitor } from "./compare";
import { LABEL } from "./labels";
import { getBoard, getCheckedAt, getHistory, getProviderStats, type BoardEntry } from "./store";
import { type Env } from "./telegram";
import { type Level } from "./adapters";
import { fetchRecentIncidents } from "./incidents";
import { regionLabel, GEOS, GEO_LABEL } from "./regions";

const SITE = "https://outage.observer";
const BY_ID = new Map(CATALOG.map((p) => [p.id, p] as const));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function hm(d: Date): string {
  return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
}
function stamp(ms: number): string {
  const d = new Date(ms);
  return `${hm(d)} UTC · ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// A short, accurate answer sentence. Never claims up/down on "unknown".
function answerSentence(name: string, level: Level, incident?: string): string {
  const tail = incident ? ` ${esc(incident)}.` : "";
  switch (level) {
    case "operational": return `<strong>${esc(name)} is operational.</strong> No incidents reported.`;
    case "maintenance": return `<strong>${esc(name)} is under maintenance.</strong>${tail}`;
    case "degraded": return `<strong>${esc(name)} is reporting degraded performance.</strong>${tail}`;
    case "partial_outage": return `<strong>${esc(name)} is experiencing a partial outage.</strong>${tail}`;
    case "major_outage": return `<strong>${esc(name)} is down.</strong>${tail}`;
    default: return `The status of <strong>${esc(name)}</strong> is being checked.`;
  }
}
function plainAnswer(name: string, level: Level): string {
  switch (level) {
    case "operational": return `${name} is operational. No incidents reported.`;
    case "maintenance": return `${name} is under maintenance.`;
    case "degraded": return `${name} is reporting degraded performance.`;
    case "partial_outage": return `${name} is experiencing a partial outage.`;
    case "major_outage": return `${name} is down.`;
    default: return `The status of ${name} is being checked.`;
  }
}

function statusPill(level: Level): string {
  return `<span class="pill pill-${level}"><span class="dot"></span>${LABEL[level]}</span>`;
}

// ---- Page shell (dark-first, on brand, no app JS) ----
function shell(opts: { title: string; description: string; canonical: string; jsonld: object[]; body: string; image?: string; script?: string }): string {
  // Escape the JSON-LD for the <script> context. JSON.stringify does NOT escape
  // `<`/`>`, so an upstream incident title containing `</script>…` would break
  // out of the element and execute (stored XSS). \u-escaping these keeps the
  // JSON valid for schema.org consumers while making `</script>` impossible.
  const ld = opts.jsonld.map((o) =>
    `<script type="application/ld+json">${
      JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    }</script>`,
  ).join("\n");
  const image = opts.image ?? SITE + "/og.png";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}" />
<link rel="canonical" href="${esc(opts.canonical)}" />
<meta property="og:title" content="${esc(opts.title)}" />
<meta property="og:description" content="${esc(opts.description)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${esc(opts.canonical)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${esc(image)}" />
<meta name="theme-color" content="#ECEBE7" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#070809" media="(prefers-color-scheme: dark)" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-title" content="Observer" />
<link rel="alternate" type="application/atom+xml" title="Outage Observer" href="/feed.xml" />
<link rel="preload" href="/fonts/DepartureMono-Regular.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="/tokens.css" />
<link rel="stylesheet" href="/status.css" />
<script>(function(){try{var t=localStorage.getItem("oo-theme");if(t)document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>
${ld}
</head>
<body>
<div class="radar" aria-hidden="true"><div class="radar-sweep"></div></div>
<div class="sp-wrap">
<header class="sp-head">
  <a class="sp-brand" href="/">
    <svg viewBox="0 0 64 64" width="22" height="22" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="25" stroke="currentColor" stroke-width="3"/>
      <circle cx="32" cy="32" r="14" stroke="currentColor" stroke-width="3" opacity=".4"/>
      <circle cx="32" cy="32" r="6" fill="#3FCF5E"/>
    </svg>
    <span class="sp-word">outage<span class="dotsep">.</span>observer</span>
  </a>
  <a class="sp-boardlink" href="/">Live board →</a>
</header>
${opts.body}
<footer class="sp-foot">
  <a href="/about">about</a> · <a href="/compare">compare</a> · <a href="/mac">mac</a> · <a href="/alerts">alerts</a> · <a href="/privacy">privacy</a> · <a href="/terms">terms</a><br/>
  <a href="https://ekpani.com" target="_blank" rel="noopener noreferrer">an ekpani tool</a>
</footer>
</div>
${opts.script ? `<script src="${esc(opts.script)}" defer></script>` : ""}
</body>
</html>`;
}

function levelOf(board: BoardEntry | undefined): Level {
  return (board?.level as Level) ?? "unknown";
}

// Contextual "add our bot" card, shown only on the Slack and Discord provider
// pages — visitors there demonstrably use that platform. Gated on the bot being
// configured; Discord shows a coming-soon note until its app id is set.
function botCta(id: string, env: Env): string {
  // "others" excludes the page's own provider only when it's a tracked one.
  const others = CATALOG.some((p) => p.id === id) ? CATALOG.length - 1 : CATALOG.length;
  if (id === "slack") {
    if (!env.SLACK_CLIENT_ID) return "";
    return `<section class="sp-bot">
    <h2>Outage alerts in Slack</h2>
    <p>Add Outage Observer to your workspace for alerts on Slack and ${others} other providers, right in your channels with <code>/outage</code>.</p>
    <p><a class="sp-cta" href="/slack/install">Add to Slack →</a></p>
  </section>`;
  }
  if (id === "discord") {
    if (!env.DISCORD_APP_ID) {
      return `<section class="sp-bot">
    <h2>Outage alerts in Discord</h2>
    <p>An Outage Observer Discord bot is coming soon: alerts on Discord and ${others} other providers, right in your server.</p>
  </section>`;
    }
    return `<section class="sp-bot">
    <h2>Outage alerts in Discord</h2>
    <p>Add Outage Observer to your server for alerts on Discord and ${others} other providers, right in your channels with <code>/outage</code>.</p>
    <p><a class="sp-cta" href="/discord/install">Add to Discord →</a></p>
  </section>`;
  }
  if (id === "telegram") {
    return `<section class="sp-bot">
    <h2>Outage alerts on Telegram</h2>
    <p>Outage Observer is a Telegram bot. Start it for alerts on any of the ${others} providers it tracks, right here in Telegram.</p>
    <p><a class="sp-cta" href="https://t.me/outageobserverbot" target="_blank" rel="noopener noreferrer">Open @outageobserverbot →</a></p>
  </section>`;
  }
  return "";
}

/** A small branded message page (OAuth callbacks, bot-install gates). Reuses the
 *  full site shell so these match the rest of Outage Observer, not a bare page. */
export function renderNotice(opts: { title: string; body: string; cta?: { href: string; label: string } }): string {
  const cta = opts.cta ? `<p><a class="sp-cta" href="${esc(opts.cta.href)}">${esc(opts.cta.label)} →</a></p>` : "";
  return shell({
    title: `${opts.title} · Outage Observer`,
    description: opts.body,
    canonical: SITE + "/",
    jsonld: [],
    body: `<main class="sp-main sp-notice">
  <h1>${esc(opts.title)}</h1>
  <p class="sp-answer">${esc(opts.body)}</p>
  ${cta}
</main>`,
  });
}

// ---- /status/<id> : a single provider's "is X down?" page ----
export async function renderProviderPage(env: Env, provider: Provider): Promise<string> {
  const [board, checkedAt, history, stats] = await Promise.all([
    getBoard(env),
    getCheckedAt(env),
    getHistory(env, [provider.id], 20),
    getProviderStats(env, provider.id),
  ]);
  const recentIncidents = await fetchRecentIncidents(provider, 5);
  const entry = (board?.providers ?? []).find((e) => e.id === provider.id);
  const level = levelOf(entry);
  const incident = entry?.incident?.name;
  const ongoing = entry?.ongoing;   // open incident under an operational headline
  const official = provider.link ?? provider.url;
  // Don't assert a confident live verdict over a frozen feed (same 10-min
  // threshold as the web board). If the poller stalled, the data may be stale.
  const stale = checkedAt != null && Date.now() - checkedAt > 10 * 60 * 1000;
  const asOf = checkedAt
    ? (stale ? `Last checked ${stamp(checkedAt)} (may be out of date): ` : `As of ${stamp(checkedAt)}, `)
    : "";
  const canonical = `${SITE}/status/${provider.id}`;

  // Affected region(s) for a region-specific incident (GCP/AWS); blank when the
  // scope is global or unknown.
  const regions = entry?.regions ?? [];
  const regionScope = regions.length && !regions.includes("global") ? regionLabel(regions) : "";

  // Observed reliability (only when we have recorded history — honest about the
  // short tracking window; omitted for providers we've never seen change).
  const reliability = stats.since ? (() => {
    const days = Math.max(1, Math.round(stats.days));
    const up = stats.uptimePct != null ? (stats.uptimePct >= 99.95 ? stats.uptimePct.toFixed(2) : stats.uptimePct.toFixed(1)) : null;
    const last = stats.lastIncidentAt ? esc(stamp(stats.lastIncidentAt)) : null;
    return `<section>
    <h2>Reliability</h2>
    <p class="sp-stats">${up != null ? `<span><strong>${up}%</strong> observed uptime</span>` : ""}<span><strong>${stats.incidents}</strong> incident${stats.incidents === 1 ? "" : "s"} recorded</span>${last ? `<span>last incident ${last}</span>` : ""}</p>
    <p class="sp-muted">Since Outage Observer began tracking ${esc(provider.name)}, about ${days} day${days === 1 ? "" : "s"} ago. Reflects only what we've observed, not the provider's full history.</p>
  </section>`;
  })() : "";

  const related = CATALOG.filter((p) => p.category === provider.category && p.id !== provider.id).slice(0, 8);

  // Prefer the provider's own recent incidents (real history); fall back to the
  // transitions we've recorded since we started watching; then an empty note.
  let historyTitle = "Recent incidents";
  let historyRows: string;
  if (recentIncidents.length) {
    historyRows = `<ul class="sp-history">` + recentIncidents.map((i) => {
      const name = i.url
        ? `<a class="inc-name" href="${esc(i.url)}" target="_blank" rel="noopener nofollow">${esc(i.name)}</a>`
        : `<span class="inc-name">${esc(i.name)}</span>`;
      const tag = i.resolved ? "resolved" : "ongoing";
      return `<li>${statusPill(i.level as Level)}${name}<time datetime="${new Date(i.at).toISOString()}">${stamp(i.at)} · ${tag}</time></li>`;
    }).join("") + `</ul>`;
  } else if (history.length) {
    historyTitle = "Recent status changes";
    historyRows = `<ul class="sp-history">` + history.map((h) =>
      `<li>${statusPill(h.level)}<time datetime="${new Date(h.at).toISOString()}">${stamp(h.at)}</time></li>`,
    ).join("") + `</ul>`;
  } else {
    historyRows = `<p class="sp-muted">No recent incidents reported.</p>`;
  }

  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/status">Status</a> / <span>${esc(provider.name)}</span></nav>
<main class="sp-main">
  <div class="sp-titlerow">
    <h1>Is ${esc(provider.name)} down?</h1>
    ${statusPill(level)}
  </div>
  <p class="sp-answer">${asOf}${level === "operational" && ongoing ? `<strong>${esc(provider.name)} is operational.</strong> One ongoing incident affecting part of the service.` : answerSentence(provider.name, level, incident)}</p>
  ${ongoing ? `<p class="sp-region">Ongoing: <strong>${esc(ongoing)}</strong></p>` : ""}
  ${regionScope ? `<p class="sp-region">Affected regions: <strong>${esc(regionScope)}</strong></p>` : ""}
  <p class="sp-meta">${esc(provider.category)} · <a href="${esc(official)}" target="_blank" rel="noopener nofollow">Official status page →</a></p>
  ${botCta(provider.id, env)}
  ${reliability}
  <section>
    <h2>${historyTitle}</h2>
    ${historyRows}
  </section>

  <section>
    <h2>About this page</h2>
    <p>Outage Observer checks ${esc(provider.name)}'s official status source every minute and records when it changes state. This page reflects the latest known status; for the authoritative source see ${esc(provider.name)}'s <a href="${esc(official)}" target="_blank" rel="noopener nofollow">own status page</a>. Get notified of changes via the <a href="/">live board</a>, the <a href="https://t.me/outageobserverbot" target="_blank" rel="noopener noreferrer">Telegram bot</a>, or this provider's <a href="/feed/${provider.id}.xml">RSS feed</a>.</p>
  </section>

  ${related.length ? `<section>
    <h2>Related ${esc(provider.category)} services</h2>
    <ul class="sp-related">${related.map((p) => `<li><a href="/status/${p.id}">${esc(p.name)}</a></li>`).join("")}</ul>
  </section>` : ""}
</main>`;

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [{
      "@type": "Question",
      name: `Is ${provider.name} down right now?`,
      acceptedAnswer: { "@type": "Answer", text: `${asOf}${plainAnswer(provider.name, level)}` },
    }],
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Status", item: SITE + "/status" },
      { "@type": "ListItem", position: 3, name: provider.name, item: canonical },
    ],
  };
  const jsonld: object[] = [breadcrumb, faq];
  // Only announce a disruption when there genuinely is one AND the feed is fresh
  // (no-fake-news — don't broadcast a structured disruption from stale data).
  if (!stale && level !== "operational" && level !== "unknown" && level !== "maintenance") {
    jsonld.push({
      "@context": "https://schema.org",
      "@type": "SpecialAnnouncement",
      name: `${provider.name}: ${LABEL[level]}`,
      text: incident ? `${provider.name}: ${incident}` : plainAnswer(provider.name, level),
      datePosted: checkedAt ? new Date(checkedAt).toISOString() : new Date(0).toISOString(),
      category: "https://www.wikidata.org/wiki/Q749754",
      url: canonical,
    });
  }

  const upDown = level === "operational" ? "operational" : (level === "unknown" ? "status" : LABEL[level].toLowerCase());
  return shell({
    title: `Is ${provider.name} down? ${provider.name} status & incidents · Outage Observer`,
    description: `Check if ${provider.name} is down right now. Live ${provider.name} status (${stale ? "last reported" : "currently"} ${upDown}), recent incidents and status changes — updated every minute by Outage Observer.`,
    canonical,
    jsonld,
    body,
    image: `${SITE}/og/${provider.id}.png`,
  });
}

// ---- /status/<id> for a provider with no live feed (honest pointer page) ----
// Answers the same "is X down?" query, but instead of a status it explains there
// is no machine-readable feed and sends the visitor to the official source. No
// status pill claim, no SpecialAnnouncement — it can never imply up or down.
export function renderPointerPage(pointer: Pointer, env: Env): string {
  const canonical = `${SITE}/status/${pointer.id}`;
  const related = CATALOG.filter((p) => p.category === pointer.category).slice(0, 8);

  // Opt-in embed: rendered as a click-to-load card so X's SDK never runs on page
  // load (privacy promise stays intact). The link below is always the fallback.
  const officialSection = pointer.embed
    ? `<section>
    <h2>Latest from @${esc(pointer.embed.handle)}</h2>
    <div class="sp-embed" id="x-embed" data-handle="${esc(pointer.embed.handle)}">
      <button type="button" class="sp-embed-load" id="x-embed-load" aria-label="Load the latest posts from @${esc(pointer.embed.handle)} on X">
        <svg class="sp-embed-x" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        <span class="sp-embed-cta">Show latest @${esc(pointer.embed.handle)} posts</span>
        <span class="sp-embed-note">Loads from x.com. May set X cookies.</span>
      </button>
    </div>
    <p class="sp-meta"><a class="sp-cta" href="${esc(pointer.link)}" target="_blank" rel="noopener nofollow">Open ${esc(pointer.linkLabel)} →</a></p>
  </section>
  <script>
  (function(){
    var btn=document.getElementById('x-embed-load'); if(!btn) return;
    btn.addEventListener('click', function(){
      var box=document.getElementById('x-embed'); if(!box) return;
      var h=box.getAttribute('data-handle');
      if(!h||!/^[A-Za-z0-9_]{1,15}$/.test(h)) return; // valid X handle only; never inject arbitrary markup
      var dark=(document.documentElement.getAttribute('data-theme')||'')==='dark'||(!document.documentElement.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme: dark)').matches);
      box.innerHTML='<a class="twitter-timeline" data-theme="'+(dark?'dark':'light')+'" data-chrome="noheader nofooter transparent" data-tweet-limit="5" data-height="560" href="https://twitter.com/'+h+'?ref_src=twsrc%5Etfw">Posts from @'+h+'</a>';
      var s=document.createElement('script');s.src='https://platform.twitter.com/widgets.js';s.async=true;s.charset='utf-8';document.body.appendChild(s);
    },{once:true});
  })();
  </script>`
    : `<section>
    <h2>Official ${esc(pointer.name)} status</h2>
    <p><a class="sp-cta" href="${esc(pointer.link)}" target="_blank" rel="noopener nofollow">${esc(pointer.linkLabel)} →</a></p>
  </section>`;

  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/status">Status</a> / <span>${esc(pointer.name)}</span></nav>
<main class="sp-main">
  <div class="sp-titlerow">
    <h1>Is ${esc(pointer.name)} down?</h1>
    <span class="pill pill-unknown"><span class="dot"></span>No live feed</span>
  </div>
  <p class="sp-answer">Outage Observer can't confirm ${esc(pointer.name)}'s status live. ${esc(pointer.note)}</p>
  <p class="sp-meta">${esc(pointer.category)} · check the official source below for the real-time answer.</p>
  ${officialSection}
  ${botCta(pointer.id, env)}
  <section>
    <h2>Why isn't ${esc(pointer.name)} tracked live?</h2>
    <p>Outage Observer only reports a status when a provider publishes an official, machine-readable feed it can check every minute. ${esc(pointer.name)} doesn't, so rather than guess — or trust an unattended page that could show green during a real outage — we point you to where ${esc(pointer.name)} actually announces incidents. If ${esc(pointer.name)} ever ships a real status feed, we'll add full tracking and alerts.</p>
  </section>
  ${related.length ? `<section>
    <h2>${esc(pointer.category)} services we track live</h2>
    <ul class="sp-related">${related.map((p) => `<li><a href="/status/${p.id}">${esc(p.name)}</a></li>`).join("")}</ul>
  </section>` : ""}
  <section>
    <h2>Track the services that do publish status</h2>
    <p>Outage Observer watches ${CATALOG.length} providers with official feeds and pings you the moment one changes state. <a href="/status">Browse the directory</a> or <a href="/">open the live board</a>.</p>
  </section>
</main>`;

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [{
      "@type": "Question",
      name: `Is ${pointer.name} down right now?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `Outage Observer can't confirm — ${pointer.name} doesn't publish a machine-readable status feed. For official outage updates, check ${pointer.linkLabel} (${pointer.link}).`,
      },
    }],
  };
  const breadcrumb = crumbLd([
    { name: "Home", path: "/" },
    { name: "Status", path: "/status" },
    { name: pointer.name, path: `/status/${pointer.id}` },
  ]);

  return shell({
    title: `Is ${pointer.name} down? ${pointer.name} status · Outage Observer`,
    description: `Is ${pointer.name} down? ${pointer.name} doesn't publish a live status feed — see where it posts official outage updates, and track the providers that do with Outage Observer.`,
    canonical,
    jsonld: [breadcrumb, faq],
    body,
    image: `${SITE}/og/default.png`,
  });
}

// ---- /status : the directory of all providers ----
export async function renderDirectory(env: Env): Promise<string> {
  const [board, checkedAt] = await Promise.all([getBoard(env), getCheckedAt(env)]);
  const byId = new Map((board?.providers ?? []).map((e) => [e.id, e] as const));
  const asOf = checkedAt ? `Updated ${stamp(checkedAt)}.` : "Updating every minute.";

  let sections = "";
  for (const cat of CATEGORY_ORDER) {
    const inCat = CATALOG.filter((p) => p.category === cat);
    if (!inCat.length) continue;
    sections += `<section class="sp-cat"><h2><a href="/status/category/${catSlug(cat)}">${esc(cat)}</a></h2><ul class="sp-dir">`;
    for (const p of inCat) {
      const level = levelOf(byId.get(p.id));
      sections += `<li><a href="/status/${p.id}"><span class="sp-dir-name">${esc(p.name)}</span>${statusPill(level)}</a></li>`;
    }
    sections += `</ul></section>`;
  }

  // Providers people search for that we deliberately don't track live (no feed).
  const notTracked = POINTERS.length
    ? `<section class="sp-cat"><h2>Not tracked live</h2>
    <p class="sp-muted">These don't publish an official status feed, so we point you to where they post outages instead.</p>
    <ul class="sp-dir">${POINTERS.map((p) =>
      `<li><a href="/status/${p.id}"><span class="sp-dir-name">${esc(p.name)}</span><span class="pill pill-unknown"><span class="dot"></span>No feed</span></a></li>`,
    ).join("")}</ul></section>`
    : "";

  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Status</span></nav>
<main class="sp-main">
  <h1>Service status directory</h1>
  <p class="sp-answer">Live status of ${CATALOG.length} infrastructure and AI providers that Outage Observer monitors. ${asOf}</p>
  <p class="sp-meta">Looking for one service? Try <a href="/status/aws">AWS</a>, <a href="/status/cloudflare">Cloudflare</a>, <a href="/status/openai">OpenAI</a>, or <a href="/status/stripe">Stripe</a>.</p>
  ${sections}
  ${notTracked}
</main>`;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Status", item: SITE + "/status" },
    ],
  };
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Service status directory",
    url: SITE + "/status",
    isPartOf: { "@type": "WebSite", name: "Outage Observer", url: SITE + "/" },
    about: CATALOG.map((p) => ({ "@type": "Thing", name: p.name, url: `${SITE}/status/${p.id}` })),
  };
  return shell({
    title: `Service status directory — ${CATALOG.length} providers · Outage Observer`,
    description: `Live status for ${CATALOG.length} infrastructure and AI providers — AWS, Cloudflare, OpenAI, Stripe and more. See what's up or down right now, updated every minute.`,
    canonical: SITE + "/status",
    jsonld: [breadcrumb, collection],
    body,
    image: `${SITE}/og/default.png`,
  });
}

// ---- /sitemap.xml ----
export async function renderSitemap(env: Env): Promise<string> {
  const board = await getBoard(env);
  const lastmod = board?.updatedAt ?? new Date(0).toISOString();
  const urls = [
    { loc: SITE + "/", priority: "1.0", freq: "always" },
    { loc: SITE + "/status", priority: "0.9", freq: "hourly" },
    { loc: SITE + "/alerts", priority: "0.7", freq: "monthly" },
    { loc: SITE + "/mac", priority: "0.7", freq: "monthly" },
    { loc: SITE + "/about", priority: "0.5", freq: "monthly" },
    { loc: SITE + "/support", priority: "0.6", freq: "monthly" },
    { loc: SITE + "/privacy", priority: "0.3", freq: "yearly" },
    { loc: SITE + "/terms", priority: "0.3", freq: "yearly" },
    { loc: SITE + "/subprocessors", priority: "0.2", freq: "yearly" },
    { loc: SITE + "/security", priority: "0.3", freq: "yearly" },
    { loc: SITE + "/compare", priority: "0.6", freq: "monthly" },
    ...COMPETITORS.map((c) => ({ loc: `${SITE}/compare/${c.slug}`, priority: "0.6", freq: "monthly" })),
    ...CATEGORY_ORDER.filter((c) => CATALOG.some((p) => p.category === c)).map((c) => ({ loc: `${SITE}/status/category/${catSlug(c)}`, priority: "0.6", freq: "daily" })),
    ...CATALOG.map((p) => ({ loc: `${SITE}/status/${p.id}`, priority: "0.7", freq: "hourly" })),
    ...POINTERS.map((p) => ({ loc: `${SITE}/status/${p.id}`, priority: "0.4", freq: "weekly" })),
  ];
  const body = urls.map((u) =>
    `  <url><loc>${u.loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// ---- /llms.txt (AEO: a clean markdown index for LLMs/answer engines) ----
export async function renderLlms(env: Env): Promise<string> {
  const board = await getBoard(env);
  const byId = new Map((board?.providers ?? []).map((e) => [e.id, e] as const));
  const lines: string[] = [];
  lines.push("# Outage Observer");
  lines.push("");
  lines.push("> Live status of the infrastructure and AI providers in your stack. Outage Observer aggregates the official status pages of " + CATALOG.length + " providers and reports the moment one changes state. Free, no account, no tracking. It reads only official status feeds — never synthetic checks or crowd reports — so it never raises a false alarm.");
  lines.push("");
  lines.push("Outage Observer works as a public web board, an installable web app (PWA), a native macOS menu-bar app, a Telegram bot, Slack and Discord apps, Slack/Discord incoming webhooks, browser push, and RSS/Atom feeds. Each provider has a page answering \"is X down?\" with its current status and recent incidents.");
  lines.push("");
  lines.push("## Provider status pages");
  for (const cat of CATEGORY_ORDER) {
    const inCat = CATALOG.filter((p) => p.category === cat);
    if (!inCat.length) continue;
    for (const p of inCat) {
      const level = levelOf(byId.get(p.id));
      lines.push(`- [Is ${p.name} down?](${SITE}/status/${p.id}): ${p.name} (${cat}) — currently ${LABEL[level].toLowerCase()}`);
    }
  }
  if (POINTERS.length) {
    lines.push("");
    lines.push("## Not tracked live (no official feed)");
    for (const p of POINTERS) {
      lines.push(`- [Is ${p.name} down?](${SITE}/status/${p.id}): ${p.name} (${p.category}) — no machine-readable status feed; official outage updates at ${p.link}`);
    }
  }
  lines.push("");
  lines.push("## Status by category");
  for (const cat of CATEGORY_ORDER) {
    if (!CATALOG.some((p) => p.category === cat)) continue;
    lines.push(`- [${cat} status](${SITE}/status/category/${catSlug(cat)}): live status of the ${cat.toLowerCase()} providers we track`);
  }
  lines.push("");
  lines.push("## How Outage Observer compares");
  lines.push(`- [Compare](${SITE}/compare): honest comparisons with the closest tools. Outage Observer is free, needs no account, reads only official status feeds (no synthetic checks or crowd reports, so no false alarms), and alerts on web, Telegram, Slack, Discord, push, RSS, a native Mac app, and an installable web app.`);
  for (const c of COMPETITORS) {
    lines.push(`- [Outage Observer vs ${c.name}](${SITE}/compare/${c.slug}): ${c.name} is ${c.what}.`);
  }
  lines.push("");
  lines.push("## Apps and integrations");
  lines.push(`- [Web board](${SITE}/): pick the services you depend on; updates every minute. Free, no account.`);
  lines.push("- Installable web app (PWA): add the board to your home screen for an app-like experience with web push, including on iOS 16.4+.");
  lines.push(`- [Mac app](${SITE}/mac): a native macOS menu-bar app with notifications and Sparkle auto-update. Free, no account.`);
  lines.push("- [Telegram bot](https://t.me/outageobserverbot): pick services and get alerts in Telegram; supports commands and region filtering.");
  lines.push(`- Slack app: the /outage slash command (status, watch, list, stop, test) posts alerts to your channels. Install at ${SITE}/slack/install`);
  lines.push("- Discord bot: /outage slash commands and per-channel alerts.");
  lines.push("- Slack and Discord incoming webhooks: paste a channel webhook URL on the board to receive alerts there.");
  lines.push("- Browser push (Web Push): notifications from the web board or the installed PWA.");
  lines.push("- Region-aware alerting: for providers that report a region (AWS, Google Cloud), filter alerts to the regions you choose.");
  lines.push("");
  lines.push("## Feeds");
  lines.push(`- [Atom feed of all changes](${SITE}/feed.xml)`);
  lines.push(`- Per-provider feed: ${SITE}/feed/<id>.xml (for example ${SITE}/feed/stripe.xml)`);
  lines.push(`- Just your stack: ${SITE}/feed.xml?ids=aws,stripe,openai`);
  lines.push("");
  lines.push("## Pages");
  lines.push(`- [Service status directory](${SITE}/status): live status of all ${CATALOG.length} providers`);
  lines.push(`- [About](${SITE}/about): what it is and how it works`);
  lines.push(`- [Compare](${SITE}/compare): how Outage Observer compares to other tools`);
  lines.push(`- [Get alerts](${SITE}/alerts): every way to get notified`);
  lines.push(`- [Mac app](${SITE}/mac) · [Support & FAQ](${SITE}/support)`);
  lines.push(`- [Privacy](${SITE}/privacy) · [Terms](${SITE}/terms) · [Security](${SITE}/security) · [Sub-processors](${SITE}/subprocessors)`);
  lines.push("");
  return lines.join("\n");
}

/** Route SEO/AEO paths. Returns a Response or null if not an SEO path. */
export async function handleSeo(env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const html = (s: string) => new Response(s, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=60" },
  });

  if (path === "/status" || path === "/status/") {
    return html(await renderDirectory(env));
  }
  if (path.startsWith("/status/category/")) {
    let slug: string;
    try { slug = decodeURIComponent(path.slice("/status/category/".length).replace(/\/$/, "")); }
    catch { return new Response(notFoundPage(), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }); }
    const cat = CATEGORY_BY_SLUG.get(slug);
    if (cat) return html(await renderCategoryPage(env, cat));
    return new Response(notFoundPage(), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (path.startsWith("/status/")) {
    let id: string;
    try { id = decodeURIComponent(path.slice("/status/".length).replace(/\/$/, "")); }
    catch { return new Response(notFoundPage(), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }); }
    const provider = BY_ID.get(id);
    if (provider) return html(await renderProviderPage(env, provider));
    // Providers we acknowledge but don't poll (no machine-readable feed).
    const pointer = POINTER_BY_ID.get(id);
    if (pointer) return html(renderPointerPage(pointer, env));
    // Common-name alias (e.g. /status/twitter -> /status/x), else 404.
    const alias = ALIASES[id];
    if (alias && BY_ID.has(alias)) return Response.redirect(`${SITE}/status/${alias}`, 301);
    return new Response(notFoundPage(), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (path === "/sitemap.xml") {
    return new Response(await renderSitemap(env), {
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600" },
    });
  }
  if (path === "/llms.txt") {
    return new Response(await renderLlms(env), {
      headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600" },
    });
  }
  if (path === "/privacy") return html(renderPrivacy());
  if (path === "/terms") return html(renderTerms());
  if (path === "/subprocessors") return html(renderSubprocessors());
  if (path === "/security") return html(renderSecurity());
  if (path === "/compare" || path === "/compare/") return html(renderCompareHub());
  if (path.startsWith("/compare/")) {
    let slug: string;
    try { slug = decodeURIComponent(path.slice("/compare/".length).replace(/\/$/, "")); }
    catch { return new Response(notFoundPage(), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }); }
    const c = COMPARE_BY_SLUG.get(slug);
    if (c) return html(renderComparePage(c));
    return new Response(notFoundPage(), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (path === "/about") return html(renderAbout());
  if (path === "/support") return html(renderSupport());
  if (path === "/mac") return html(renderMac());
  if (path === "/alerts") return html(renderAlerts());
  return null;
}

const EKPANI = "https://ekpani.com";
const REPO = "https://github.com/ekpani/outage-observer";
const RELEASES = REPO + "/releases";
// Fixed URL the release workflow keeps pointed at the newest notarized build.
const MAC_DMG = REPO + "/releases/download/mac-latest/Outage-Observer.dmg";

function crumbLd(trail: { name: string; path: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem", position: i + 1, name: t.name, item: SITE + t.path,
    })),
  };
}

// ---- /about ----
function renderAbout(): string {
  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>About</span></nav>
<main class="sp-main">
  <h1>About Outage Observer</h1>
  <p class="sp-answer">A calm pane of glass for the services your product runs on, and a ping the moment one of them breaks.</p>
  <section>
    <h2>The idea</h2>
    <p>Modern software leans on dozens of providers: cloud, AI, payments, auth, CDNs. Each publishes its own status page, and nobody has time to keep ${CATALOG.length} tabs open. Outage Observer watches them all in one place, lets you pick the handful you actually depend on, and tells you the instant one changes state. It stays quiet the rest of the time.</p>
  </section>
  <section>
    <h2>How it's built</h2>
    <p>One small service checks each provider's official status source every minute and reacts only to real changes. Failed checks keep the last known status rather than inventing a scare, so it never cries wolf. It's free, needs no account, and stores your chosen services on your own device. The whole thing runs at the edge.</p>
  </section>
  <section>
    <h2>How we're different</h2>
    <p>Outage Observer is free, needs no account, and reads only providers' official status feeds, so it never invents an outage or sends a false alarm. It isn't an uptime monitor for your own site and it doesn't host your status page; it does one thing and tells you wherever you already are. See <a href="/compare">how it compares</a> to the closest tools.</p>
  </section>
  <section>
    <h2>Who makes it</h2>
    <p>Outage Observer is built by <a href="${EKPANI}" target="_blank" rel="noopener noreferrer">Ekpani</a>, a small studio. The source is <a href="${REPO}" target="_blank" rel="noopener noreferrer">on GitHub</a>.</p>
  </section>
  <section>
    <h2>More</h2>
    <ul class="sp-related">
      <li><a href="/alerts">Get alerts</a></li>
      <li><a href="/mac">Mac app</a></li>
      <li><a href="/compare">Compare</a></li>
      <li><a href="/support">Support &amp; FAQ</a></li>
      <li><a href="/status">All ${CATALOG.length} providers</a></li>
      <li><a href="/privacy">Privacy</a></li>
    </ul>
  </section>
</main>`;
  return shell({
    title: "About · Outage Observer",
    description: `Outage Observer watches the official status pages of ${CATALOG.length}+ infrastructure and AI providers and alerts you the moment one you depend on changes state. Free, no login. Built by Ekpani.`,
    canonical: SITE + "/about",
    jsonld: [
      crumbLd([{ name: "Home", path: "/" }, { name: "About", path: "/about" }]),
      {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        name: "About Outage Observer",
        url: SITE + "/about",
        publisher: { "@type": "Organization", name: "Ekpani", url: EKPANI },
      },
    ],
    body,
  });
}

// ---- /support (FAQPage — strong for AEO) ----
const FAQS: { q: string; a: string }[] = [
  { q: "Is Outage Observer free?", a: "Yes. The web board, the Telegram bot, browser push, Slack/Discord, and RSS are all free, with no account required." },
  { q: "How fast are alerts?", a: "Outage Observer checks each provider's official status source about once a minute and notifies you on the next change, so alerts typically arrive within a minute or two of a provider updating its own status page." },
  { q: "Does it work for the services I use?", a: `It watches ${CATALOG.length}+ providers across cloud, AI, dev tools, data, payments, comms, auth, CDNs, and more. Browse the full list on the status directory and pick the ones you depend on.` },
  { q: "Will I get false alarms?", a: "It's designed not to. A failed check keeps the last known status rather than reporting a scare, routine maintenance noise is filtered, and alerts only fire on real state changes from the provider's own feed." },
  { q: "How do I get notified?", a: "Pick a channel on the alerts page: browser push, the Telegram bot, a Slack or Discord webhook, or an RSS feed. The Mac app adds a menu-bar indicator and native notifications." },
  { q: "Do you collect my data?", a: "No. There are no accounts and no tracking. Your chosen services are stored on your own device. See the privacy page for details." },
  { q: "Is there a Mac app?", a: "Yes — a native menu-bar app with notifications. See the Mac page to download it." },
  { q: "How do I add a service that isn't listed?", a: "Email hi@ekpani.com with the provider and its status page URL and we'll look at adding it." },
];

function renderSupport(): string {
  const faqHtml = FAQS.map((f) =>
    `<section><h2>${esc(f.q)}</h2><p>${esc(f.a)}</p></section>`,
  ).join("\n");
  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Support</span></nav>
<main class="sp-main">
  <h1>Support</h1>
  <p class="sp-answer">Questions, requests, or a provider we should add? Email <a href="mailto:hi@ekpani.com">hi@ekpani.com</a>.</p>
  ${faqHtml}
  <section>
    <h2>Still stuck?</h2>
    <p>Reach us at <a href="mailto:hi@ekpani.com">hi@ekpani.com</a> or open an issue <a href="${REPO}/issues" target="_blank" rel="noopener noreferrer">on GitHub</a>.</p>
  </section>
</main>`;
  return shell({
    title: "Support & FAQ · Outage Observer",
    description: "Answers to common questions about Outage Observer: pricing, alert speed, supported providers, privacy, the Mac app, and how to request a service. Email hi@ekpani.com.",
    canonical: SITE + "/support",
    jsonld: [
      crumbLd([{ name: "Home", path: "/" }, { name: "Support", path: "/support" }]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    body,
  });
}

// A faithful CSS mockup of the menu-bar popover (not a screenshot), grounded in
// how the app actually renders: aperture + wordmark + action icons, a scoped
// status line, observed rows worst-first, and Quit.
function macMock(): string {
  const col = (l: Level) => `var(--oo-status-${l}-fg)`;
  const row = (name: string, level: Level) =>
    `<div class="mk-row"><span class="mk-dot" style="background:${col(level)}"></span>` +
    `<span class="mk-name">${esc(name)}</span>` +
    `<span class="mk-stat" style="color:${col(level)}">${LABEL[level]}</span></div>`;
  return `<div class="mac-mock" role="img" aria-label="The Outage Observer menu-bar popover showing watched services">
    <div class="mk-head">
      <span class="mk-aperture"></span>
      <span class="mk-word">outage<span class="mk-dotsep">.</span>observer</span>
      <span class="mk-icons" aria-hidden="true"></span>
    </div>
    <div class="mk-status"><span class="mk-dot" style="background:${col("maintenance")}"></span><span style="color:${col("maintenance")}">1 needs attention</span><span class="mk-checked">checked 12:41 UTC</span></div>
    ${row("Cloudflare", "maintenance")}
    ${row("Amazon Web Services", "operational")}
    ${row("OpenAI", "operational")}
    ${row("Stripe", "operational")}
    ${row("GitHub", "operational")}
    <div class="mk-foot">Quit</div>
  </div>`;
}

// ---- /mac ----
function renderMac(): string {
  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Mac app</span></nav>
<main class="sp-main">
  <h1>Outage Observer for Mac</h1>
  <p class="sp-answer">A native menu-bar app. A quiet reticle that glows when something you watch has trouble, and a notification the moment it does.</p>
  <p class="sp-meta"><a class="sp-download" href="${MAC_DMG}">Download for macOS →</a> · free · macOS 14+ · notarized</p>

  ${macMock()}

  <section>
    <h2>What it does</h2>
    <ul class="sp-related sp-stack">
      <li><strong>Lives in your menu bar.</strong> A reticle that's black or white to match your bar, with a colored pupil when a service you watch needs attention.</li>
      <li><strong>Notifies you instantly.</strong> A native notification (with a tasteful sound) the moment a watched service changes state, and silence otherwise.</li>
      <li><strong>Your board, one click away.</strong> Click the icon to see the services you watch, problems pinned to the top.</li>
      <li><strong>Private and native.</strong> No account, no tracking; it just reads the public status feed. Light or dark, follows your Mac.</li>
    </ul>
  </section>
  <section>
    <h2>Installing</h2>
    <p>Open the <a href="${MAC_DMG}">downloaded DMG</a> and drag Outage Observer to Applications. It's a notarized Developer ID build, so it opens without any warning. A Mac App Store release is on the way; older builds are on <a href="${RELEASES}" target="_blank" rel="noopener noreferrer">GitHub releases</a>.</p>
  </section>
  <section>
    <h2>More</h2>
    <ul class="sp-related">
      <li><a href="/alerts">Other ways to get alerts</a></li>
      <li><a href="/">Live board</a></li>
      <li><a href="${REPO}" target="_blank" rel="noopener noreferrer">Source on GitHub</a></li>
    </ul>
  </section>
</main>`;
  return shell({
    title: "Mac app · Outage Observer",
    description: "Outage Observer for Mac: a native menu-bar app with notifications the moment a service you depend on changes state. Free, macOS 14+, no account.",
    canonical: SITE + "/mac",
    jsonld: [
      crumbLd([{ name: "Home", path: "/" }, { name: "Mac app", path: "/mac" }]),
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Outage Observer for Mac",
        operatingSystem: "macOS 14.0",
        applicationCategory: "DeveloperApplication",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        url: SITE + "/mac",
        downloadUrl: MAC_DMG,
        publisher: { "@type": "Organization", name: "Ekpani", url: EKPANI },
      },
    ],
    body,
  });
}

// ---- /alerts (set up every channel right here) ----
function renderAlerts(): string {
  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Alerts</span></nav>
<main class="sp-main">
  <h1>Get alerted</h1>
  <p class="sp-answer">Switch on the channels you want. Outage Observer pings you only for the services you watch, only when they change.</p>
  <p class="sp-meta" id="al-stack">Loading your services…</p>

  <section>
    <h2>🌍 Regions <span class="sp-muted">· optional</span></h2>
    <p>For providers that report a location (Google Cloud, AWS), get alerted only about the regions you depend on. Leave all unchecked to be notified everywhere; global incidents always come through. Applies to browser push and Slack/Discord below.</p>
    <div class="al-regions" id="al-regions">${GEOS.map((g) => `<label class="al-region"><input type="checkbox" class="al-region-cb" value="${g}" /> ${esc(GEO_LABEL[g])}</label>`).join("")}</div>
    <span class="al-hint" id="al-region-state"></span>
  </section>
  <section>
    <h2>🔔 Browser push</h2>
    <p>The fastest way. Notifications arrive even when the tab is closed.</p>
    <div class="al-row" id="al-push-row">
      <button class="btn-accent" id="al-push-btn">🔔 Enable browser notifications</button>
      <span class="al-hint" id="al-push-state"></span>
    </div>
    <p class="sp-muted">Chrome, Edge, Firefox, and Safari (on iPhone, add the board to your Home Screen first).</p>
  </section>
  <section>
    <h2>🖥 Mac app</h2>
    <p>A native menu-bar app with notifications and a status reticle. <a href="/mac">Get the Mac app →</a></p>
  </section>
  <section>
    <h2>💬 Telegram</h2>
    <p>Message <a href="https://t.me/outageobserverbot" target="_blank" rel="noopener noreferrer">@outageobserverbot</a>, search and pick your services, and it pings you on every change. Commands: <span class="mono">/start</span>, <span class="mono">/status</span>, <span class="mono">/stop</span>.</p>
  </section>
  <section>
    <h2>🧩 Slack &amp; Discord</h2>
    <p>Post changes into a channel. Create an incoming webhook for the channel, then paste its URL:</p>
    <div class="al-row">
      <input id="al-hook-url" class="al-input" type="url" inputmode="url" placeholder="Slack or Discord webhook URL" autocomplete="off" spellcheck="false" />
      <button class="btn-accent" id="al-hook-btn">Connect</button>
    </div>
    <span class="al-hint" id="al-hook-state"></span>
  </section>
  <section>
    <h2>📡 RSS / Atom</h2>
    <p>Wire it into your own pipeline. A feed for everything, a feed per provider, and a feed for your stack.</p>
    <ul class="sp-related sp-stack">
      <li><a href="/feed.xml">/feed.xml</a> — every recent change</li>
      <li><a href="/feed/stripe.xml">/feed/&lt;provider&gt;.xml</a> — one provider</li>
      <li><a id="al-stack-feed" href="/feed.xml"><span class="mono">/feed.xml?ids=…</span></a> — just your stack</li>
    </ul>
  </section>
  <section>
    <h2>The promise</h2>
    <p>Every channel follows the same rule: alerts fire only on real state changes from a provider's own status feed. Failed checks keep the last known status, so you'll never get a false alarm.</p>
  </section>
</main>`;
  return shell({
    title: "Get alerts · Outage Observer",
    description: "Set up notifications when a service you depend on changes state: browser push, the Mac app, Telegram, Slack/Discord webhooks, and RSS/Atom feeds. Free, no account.",
    canonical: SITE + "/alerts",
    jsonld: [
      crumbLd([{ name: "Home", path: "/" }, { name: "Alerts", path: "/alerts" }]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Get alerted with Outage Observer",
        url: SITE + "/alerts",
        isPartOf: { "@type": "WebSite", name: "Outage Observer", url: SITE + "/" },
      },
    ],
    body,
    script: "/alerts.js",
  });
}

/** Privacy policy — required for App Store Connect. Outage Observer collects no
 *  personal data; this states that plainly. */
function renderPrivacy(): string {
  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Privacy</span></nav>
<main class="sp-main">
  <h1>Privacy</h1>
  <p class="sp-answer">Outage Observer does not collect, store, sell, or share any personal data.</p>
  <section>
    <h2>What the apps do</h2>
    <p>The web board, the Mac app, and the Telegram bot read a single public status feed (<span class="mono">outage.observer/api/status</span>) that we compile from providers' official status pages. The Mac app and website keep your chosen services and preferences <strong>locally on your device</strong> (UserDefaults / localStorage); they are never sent to us.</p>
  </section>
  <section>
    <h2>What we don't do</h2>
    <p>No accounts, no analytics, no tracking, no advertising identifiers, and no third-party SDKs loaded by default. We do not build user profiles. Like any website, our server receives standard request logs (e.g. IP address) to serve traffic and stop abuse; these are not used to identify or track you and are not sold.</p>
  </section>
  <section>
    <h2>Sub-processors</h2>
    <p>The service runs on Cloudflare, our infrastructure host. It is the only sub-processor that stores or processes data on our behalf. See the full <a href="/subprocessors">sub-processors list</a>.</p>
  </section>
  <section>
    <h2>Optional embeds</h2>
    <p>A few pages cover services that announce outages on X instead of a status feed. Those pages offer an <strong>opt-in</strong> embedded timeline that loads only if you click to load it — until then, nothing from X runs and no X cookies are set. If you do load it, that content is served by X under <a href="https://x.com/en/privacy" target="_blank" rel="noopener noreferrer">its own privacy policy</a>. There is always a plain link as an alternative.</p>
  </section>
  <section>
    <h2>Notifications</h2>
    <p>Browser, Telegram, Slack/Discord, and Mac notifications are sent only for the services you choose to watch. You can turn them off at any time. Telegram subscriptions are stored only as the chat ID needed to deliver your alerts and are deleted when you stop the bot.</p>
  </section>
  <section>
    <h2>Contact</h2>
    <p>Questions: <a href="https://github.com/ekpani/outage-observer" target="_blank" rel="noopener noreferrer">github.com/ekpani/outage-observer</a>.</p>
  </section>
</main>`;
  return shell({
    title: "Privacy · Outage Observer",
    description: "Outage Observer collects no personal data. No accounts, no analytics, no tracking.",
    canonical: SITE + "/privacy",
    jsonld: [
      crumbLd([{ name: "Home", path: "/" }, { name: "Privacy", path: "/privacy" }]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Privacy",
        url: SITE + "/privacy",
        isPartOf: { "@type": "WebSite", name: "Outage Observer", url: SITE + "/" },
      },
    ],
    body,
  });
}

function renderTerms(): string {
  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Terms</span></nav>
<main class="sp-main">
  <h1>Terms of Service</h1>
  <p class="sp-answer">Outage Observer is a free service that aggregates providers' official status pages and notifies you when one changes state. By using it you agree to these terms.</p>
  <p class="sp-meta">Last updated 18 June 2026.</p>
  <section>
    <h2>The service</h2>
    <p>Outage Observer reads the public status sources that providers publish and reports what it sees, on a best-effort basis. It is provided "as is" and "as available", with no guarantee of accuracy, completeness, timeliness, or uptime. It is not a substitute for a provider's own status page, and we are not affiliated with the providers we monitor.</p>
  </section>
  <section>
    <h2>No warranty and limited liability</h2>
    <p>Alerts may be delayed, missed, duplicated, or incorrect, for example when a provider's own status source is itself late or wrong. Do not rely on Outage Observer as your sole source of truth for an outage. To the fullest extent permitted by law, Ekpani is not liable for any loss or damage arising from use of, or reliance on, the service, including missed or incorrect alerts.</p>
  </section>
  <section>
    <h2>Acceptable use</h2>
    <p>Use the service lawfully. Don't attempt to disrupt, overload, reverse-engineer, or abuse it, or use it to infringe others' rights. Keep automated access reasonable; we may rate-limit or block abuse to keep the service running for everyone.</p>
  </section>
  <section>
    <h2>Availability and changes</h2>
    <p>The service is free and needs no account. We may add, change, or discontinue any part of it at any time, and we may update these terms. Continued use after a change means you accept it.</p>
  </section>
  <section>
    <h2>Trademarks</h2>
    <p>Provider names and logos belong to their respective owners and are used only to identify the service being monitored. Their use does not imply any affiliation or endorsement.</p>
  </section>
  <section>
    <h2>Contact</h2>
    <p>Outage Observer is built by <a href="${EKPANI}" target="_blank" rel="noopener noreferrer">Ekpani</a>. Questions: <a href="${REPO}" target="_blank" rel="noopener noreferrer">github.com/ekpani/outage-observer</a>. See also our <a href="/privacy">Privacy policy</a>.</p>
  </section>
</main>`;
  return shell({
    title: "Terms of Service · Outage Observer",
    description: "Terms of Service for Outage Observer, a free, best-effort status aggregator and alerting service by Ekpani.",
    canonical: SITE + "/terms",
    jsonld: [
      crumbLd([{ name: "Home", path: "/" }, { name: "Terms", path: "/terms" }]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Terms of Service",
        url: SITE + "/terms",
        isPartOf: { "@type": "WebSite", name: "Outage Observer", url: SITE + "/" },
      },
    ],
    body,
  });
}

function renderSubprocessors(): string {
  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Sub-processors</span></nav>
<main class="sp-main">
  <h1>Sub-processors</h1>
  <p class="sp-answer">Outage Observer is operated by Ekpani. We rely on a minimal set of third-party sub-processors to run the service. This page lists them and how we manage them.</p>
  <p class="sp-meta">Last updated 18 June 2026.</p>
  <section>
    <h2>Our approach</h2>
    <p>We keep sub-processors to the minimum needed to operate. Each is bound by its own data-protection terms, and we share only the data required for it to perform its function. We update this page when the list changes.</p>
  </section>
  <section>
    <h2>Current sub-processors</h2>
    <ul class="sp-related sp-stack">
      <li><strong>Cloudflare, Inc.</strong>: hosting, edge compute, database, and network security (Cloudflare Workers, D1, and KV). Hosts all service data; the primary database region is the European Union (Western Europe). See <a href="https://www.cloudflare.com/trust-hub/" target="_blank" rel="noopener noreferrer">Cloudflare's Trust Hub</a> and its Data Processing Addendum.</li>
    </ul>
    <p class="sp-muted">This is the only sub-processor that stores or processes customer data. Outage Observer uses no analytics, advertising, or tracking processors.</p>
  </section>
  <section>
    <h2>Changes</h2>
    <p>Where practicable, we post material changes to this list here before they take effect. Questions: <a href="${REPO}" target="_blank" rel="noopener noreferrer">github.com/ekpani/outage-observer</a>. See also our <a href="/privacy">Privacy policy</a> and <a href="/terms">Terms</a>.</p>
  </section>
</main>`;
  return shell({
    title: "Sub-processors · Outage Observer",
    description: "Sub-processors used by Outage Observer. Cloudflare hosts the service; no analytics, advertising, or tracking processors are used.",
    canonical: SITE + "/subprocessors",
    jsonld: [
      crumbLd([{ name: "Home", path: "/" }, { name: "Sub-processors", path: "/subprocessors" }]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Sub-processors",
        url: SITE + "/subprocessors",
        isPartOf: { "@type": "WebSite", name: "Outage Observer", url: SITE + "/" },
      },
    ],
    body,
  });
}

function renderSecurity(): string {
  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Security</span></nav>
<main class="sp-main">
  <h1>Security &amp; vulnerability disclosure</h1>
  <p class="sp-answer">We take the security of Outage Observer seriously and welcome good-faith reports of potential vulnerabilities.</p>
  <p class="sp-meta">Last updated 18 June 2026. Machine-readable contact: <a href="/.well-known/security.txt">/.well-known/security.txt</a>.</p>
  <section>
    <h2>Reporting a vulnerability</h2>
    <p>Email <a href="mailto:hi@ekpani.com">hi@ekpani.com</a>, or open a private report via the repository's <a href="${REPO}/security" target="_blank" rel="noopener noreferrer">Security tab</a> ("Report a vulnerability"). Please include steps to reproduce and any relevant logs or proof-of-concept.</p>
  </section>
  <section>
    <h2>What to expect</h2>
    <p>We aim to acknowledge reports within three business days, keep you informed as we investigate and ship a fix, and credit you once an issue is resolved if you'd like.</p>
  </section>
  <section>
    <h2>Scope</h2>
    <p>In scope: the Outage Observer Worker and its endpoints (<span class="mono">outage.observer</span>), the Slack, Discord, and Telegram bots, and the source repository. Out of scope: the upstream providers we monitor; our hosting provider (Cloudflare, report to them directly); denial-of-service testing; and social engineering.</p>
  </section>
  <section>
    <h2>Safe harbor</h2>
    <p>We will not pursue or support legal action against researchers who act in good faith, avoid privacy violations and service disruption, and give us a reasonable chance to remediate before any public disclosure.</p>
  </section>
</main>`;
  return shell({
    title: "Security · Outage Observer",
    description: "Outage Observer security and vulnerability disclosure policy: how to report a vulnerability, scope, and safe harbor.",
    canonical: SITE + "/security",
    jsonld: [
      crumbLd([{ name: "Home", path: "/" }, { name: "Security", path: "/security" }]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Security",
        url: SITE + "/security",
        isPartOf: { "@type": "WebSite", name: "Outage Observer", url: SITE + "/" },
      },
    ],
    body,
  });
}

// ---- /compare : how Outage Observer stacks up (honest, by approach) ----
function renderCompareHub(): string {
  const groups = COMPARE_GROUPS.map((g) => {
    const items = COMPETITORS.filter((c) => c.category === g.category);
    if (!items.length) return "";
    return `<section>
    <h2>${esc(g.heading)}</h2>
    <p class="sp-muted">${esc(g.blurb)}</p>
    <ul class="sp-related sp-stack">${items.map((c) => `<li><a href="/compare/${c.slug}"><strong>Outage Observer vs ${esc(c.name)}</strong></a> <span class="sp-muted">· ${esc(c.what)}</span></li>`).join("")}</ul>
  </section>`;
  }).join("");
  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Compare</span></nav>
<main class="sp-main">
  <h1>How Outage Observer compares</h1>
  <p class="sp-answer">Status tools do different jobs. Some monitor your own websites. Some host your status page. Outage Observer watches the official status of the ${CATALOG.length} services you depend on and tells you the moment one breaks, free, with no account.</p>
  <section>
    <h2>What makes Outage Observer different</h2>
    <ul class="sp-related sp-stack">${OO_EDGE.map((e) => `<li><strong>${esc(e.title)}.</strong> ${esc(e.body)}</li>`).join("")}</ul>
  </section>
  ${groups}
  <section>
    <h2>Try it</h2>
    <p>It's free and needs no signup. <a href="/">Open the live board</a>, pick the services you depend on, and get alerts where you want them.</p>
  </section>
</main>`;
  return shell({
    title: "How Outage Observer compares · free status aggregator",
    description: "Honest comparisons of Outage Observer with status aggregators, uptime monitors, and status-page tools. Free, no account, official status feeds only, alerts everywhere you already are.",
    canonical: SITE + "/compare",
    jsonld: [
      crumbLd([{ name: "Home", path: "/" }, { name: "Compare", path: "/compare" }]),
      { "@context": "https://schema.org", "@type": "CollectionPage", name: "How Outage Observer compares", url: SITE + "/compare", isPartOf: { "@type": "WebSite", name: "Outage Observer", url: SITE + "/" }, about: COMPETITORS.map((c) => ({ "@type": "Thing", name: c.name, url: `${SITE}/compare/${c.slug}` })) },
    ],
    body,
    image: `${SITE}/og/default.png`,
  });
}

function renderComparePage(c: Competitor): string {
  const canonical = `${SITE}/compare/${c.slug}`;
  const isAlt = c.category === "aggregator" || c.category === "crowd";   // we're a real alternative vs a different tool
  const intro = isAlt
    ? `${esc(c.name)} is ${esc(c.what)}. Outage Observer is a free, no-account alternative. Here's an honest comparison.`
    : `${esc(c.name)} is ${esc(c.what)}. That's a different job from Outage Observer, which watches the services you depend on. Here's the difference, and when you'd want each.`;
  // Mobile: data-label lets the table reflow into cards instead of scrolling.
  const rows = c.table.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td data-label="Outage Observer">${esc(r.oo)}</td><td data-label="${esc(c.name)}">${esc(r.them)}</td></tr>`).join("");
  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/compare">Compare</a> / <span>${esc(c.name)}</span></nav>
<main class="sp-main">
  <h1>Outage Observer vs ${esc(c.name)}</h1>
  <p class="sp-answer">${intro}</p>
  <p class="sp-meta">Reviewed 18 June 2026 · <a href="${esc(c.site)}" target="_blank" rel="noopener nofollow">${esc(c.name)} →</a></p>
  <section>
    <h2>At a glance</h2>
    <table class="cmp"><thead><tr><td></td><th scope="col">Outage Observer</th><th scope="col">${esc(c.name)}</th></tr></thead><tbody>${rows}</tbody></table>
  </section>
  <section>
    <h2>Where ${esc(c.name)} is stronger</h2>
    <ul class="sp-related sp-stack">${c.theyAreStronger.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
  </section>
  <section>
    <h2>Where Outage Observer is different</h2>
    <ul class="sp-related sp-stack">${c.weAreDifferent.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
  </section>
  <section>
    <h2>Which should you use?</h2>
    <p>${esc(c.chooseThem)}</p>
    <p>${esc(c.chooseUs)}</p>
  </section>
  <section>
    <h2>Try Outage Observer</h2>
    <p>Free, no signup. <a href="/">Open the board</a>, or see <a href="/compare">all comparisons</a>.</p>
  </section>
</main>`;
  const faqA1 = isAlt
    ? `Outage Observer is a free, no-account status board and alerts for the services you depend on. ${c.name} is ${c.what}, a paid product that requires an account. ${c.chooseUs}`
    : `Not exactly: they do different jobs. ${c.name} is ${c.what}; Outage Observer watches the third-party services you depend on and tells you when one of them breaks. ${c.chooseUs}`;
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: `Is Outage Observer a ${c.name} alternative?`, acceptedAnswer: { "@type": "Answer", text: faqA1 } },
      { "@type": "Question", name: `What is the difference between Outage Observer and ${c.name}?`, acceptedAnswer: { "@type": "Answer", text: c.weAreDifferent.join(" ") } },
    ],
  };
  return shell({
    title: `Outage Observer vs ${c.name}: ${isAlt ? "a free, no-account alternative" : "what's the difference?"}`,
    description: isAlt
      ? `Outage Observer vs ${c.name}: a free, no-signup status board with official-source-only alerts and no false alarms. An honest comparison, including where ${c.name} is stronger.`
      : `Outage Observer vs ${c.name}: they do different jobs. ${c.name} monitors or hosts your own; Outage Observer watches the services you depend on. An honest, side-by-side comparison.`,
    canonical,
    jsonld: [crumbLd([{ name: "Home", path: "/" }, { name: "Compare", path: "/compare" }, { name: c.name, path: `/compare/${c.slug}` }]), faq],
    body,
    image: `${SITE}/og/default.png`,
  });
}

// ---- /status/category/<slug> : per-category "is X down?" landing pages ----
function catSlug(name: string): string {
  return name.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const CATEGORY_BY_SLUG = new Map(CATEGORY_ORDER.map((c) => [catSlug(c), c] as const));

async function renderCategoryPage(env: Env, category: string): Promise<string> {
  const [board, checkedAt] = await Promise.all([getBoard(env), getCheckedAt(env)]);
  const byId = new Map((board?.providers ?? []).map((e) => [e.id, e] as const));
  const inCat = CATALOG.filter((p) => p.category === category);
  const slug = catSlug(category);
  const asOf = checkedAt ? `Updated ${stamp(checkedAt)}.` : "Updating every minute.";
  const names = inCat.slice(0, 4).map((p) => p.name).join(", ");
  const down = inCat.filter((p) => { const l = levelOf(byId.get(p.id)); return l !== "operational" && l !== "unknown"; });
  const summary = down.length
    ? `${down.length} of ${inCat.length} are reporting issues right now.`
    : `All ${inCat.length} are operational right now.`;
  const list = inCat.map((p) => `<li><a href="/status/${p.id}"><span class="sp-dir-name">${esc(p.name)}</span>${statusPill(levelOf(byId.get(p.id)))}</a></li>`).join("");
  const related = CATEGORY_ORDER.filter((c) => c !== category && CATALOG.some((p) => p.category === c));

  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/status">Status</a> / <span>${esc(category)}</span></nav>
<main class="sp-main">
  <h1>${esc(category)} status</h1>
  <p class="sp-answer">Live status of the ${inCat.length} providers Outage Observer tracks in ${esc(category)}: ${esc(names)}, and more. ${summary} ${asOf}</p>
  <section class="sp-cat"><ul class="sp-dir">${list}</ul></section>
  <section>
    <h2>Get alerted</h2>
    <p>Pick the ones you depend on and Outage Observer pings you the moment one changes state, free and with no account. <a href="/">Open the board</a> or see <a href="/alerts">all the ways to get alerts</a>.</p>
  </section>
  <section>
    <h2>Other categories</h2>
    <ul class="sp-related">${related.map((c) => `<li><a href="/status/category/${catSlug(c)}">${esc(c)}</a></li>`).join("")}</ul>
  </section>
</main>`;
  return shell({
    title: `${category} status · live · Outage Observer`,
    description: `Is ${names} down? Live status of ${inCat.length} ${esc(category).toLowerCase()} providers, updated every minute. Free, no account.`,
    canonical: `${SITE}/status/category/${slug}`,
    jsonld: [
      crumbLd([{ name: "Home", path: "/" }, { name: "Status", path: "/status" }, { name: category, path: `/status/category/${slug}` }]),
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `${category} status`,
        url: `${SITE}/status/category/${slug}`,
        numberOfItems: inCat.length,
        itemListElement: inCat.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.name, url: `${SITE}/status/${p.id}` })),
      },
    ],
    body,
    image: `${SITE}/og/default.png`,
  });
}

function notFoundPage(): string {
  return shell({
    title: "Provider not found · Outage Observer",
    description: "That provider is not in the Outage Observer catalog.",
    canonical: SITE + "/status",
    jsonld: [],
    body: `<main class="sp-main"><h1>Not found</h1><p class="sp-answer">We don't track that provider yet. See the <a href="/status">full directory</a> or the <a href="/">live board</a>.</p></main>`,
  });
}

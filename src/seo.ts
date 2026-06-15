import { CATALOG, CATEGORY_ORDER, type Provider } from "./catalog";
import { LABEL } from "./labels";
import { getBoard, getCheckedAt, getHistory, type BoardEntry } from "./store";
import { type Env } from "./telegram";
import { type Level } from "./adapters";

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
function shell(opts: { title: string; description: string; canonical: string; jsonld: object[]; body: string; image?: string }): string {
  const ld = opts.jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
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
<meta name="theme-color" content="#FBFBFA" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#070809" media="(prefers-color-scheme: dark)" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="alternate" type="application/atom+xml" title="Outage Observer" href="/feed.xml" />
<link rel="preload" href="/fonts/DepartureMono-Regular.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="/tokens.css" />
<link rel="stylesheet" href="/status.css" />
<script>(function(){try{var t=localStorage.getItem("oo-theme");if(t)document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>
${ld}
</head>
<body>
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
  <a href="/status">All providers</a> · <a href="/feed.xml">RSS</a> · <a href="https://t.me/outageobserverbot" target="_blank" rel="noopener noreferrer">Telegram</a><br/>
  <a href="https://ekpani.com" target="_blank" rel="noopener noreferrer">an ekpani tool</a>
</footer>
</div>
</body>
</html>`;
}

function levelOf(board: BoardEntry | undefined): Level {
  return (board?.level as Level) ?? "unknown";
}

// ---- /status/<id> : a single provider's "is X down?" page ----
export async function renderProviderPage(env: Env, provider: Provider): Promise<string> {
  const [board, checkedAt, history] = await Promise.all([
    getBoard(env),
    getCheckedAt(env),
    getHistory(env, [provider.id], 20),
  ]);
  const entry = (board?.providers ?? []).find((e) => e.id === provider.id);
  const level = levelOf(entry);
  const incident = entry?.incident?.name;
  const official = provider.link ?? provider.url;
  const asOf = checkedAt ? `As of ${stamp(checkedAt)}, ` : "";
  const canonical = `${SITE}/status/${provider.id}`;

  const related = CATALOG.filter((p) => p.category === provider.category && p.id !== provider.id).slice(0, 8);
  const historyRows = history.length
    ? `<ul class="sp-history">` + history.map((h) =>
        `<li>${statusPill(h.level)}<time datetime="${new Date(h.at).toISOString()}">${stamp(h.at)}</time></li>`,
      ).join("") + `</ul>`
    : `<p class="sp-muted">No status changes recorded yet. Changes appear here as they happen.</p>`;

  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/status">Status</a> / <span>${esc(provider.name)}</span></nav>
<main class="sp-main">
  <div class="sp-titlerow">
    <h1>Is ${esc(provider.name)} down?</h1>
    ${statusPill(level)}
  </div>
  <p class="sp-answer">${asOf}${answerSentence(provider.name, level, incident)}</p>
  <p class="sp-meta">${esc(provider.category)} · <a href="${esc(official)}" target="_blank" rel="noopener nofollow">Official status page →</a></p>

  <section>
    <h2>Recent status changes</h2>
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
  // Only announce a disruption when there genuinely is one (no-fake-news).
  if (level !== "operational" && level !== "unknown" && level !== "maintenance") {
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
    description: `Check if ${provider.name} is down right now. Live ${provider.name} status (currently ${upDown}), recent incidents and status changes — updated every minute by Outage Observer.`,
    canonical,
    jsonld,
    body,
    image: `${SITE}/og/${provider.id}.png`,
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
    sections += `<section class="sp-cat"><h2>${esc(cat)}</h2><ul class="sp-dir">`;
    for (const p of inCat) {
      const level = levelOf(byId.get(p.id));
      sections += `<li><a href="/status/${p.id}"><span class="sp-dir-name">${esc(p.name)}</span>${statusPill(level)}</a></li>`;
    }
    sections += `</ul></section>`;
  }

  const body = `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Status</span></nav>
<main class="sp-main">
  <h1>Service status directory</h1>
  <p class="sp-answer">Live status of ${CATALOG.length} infrastructure and AI providers that Outage Observer monitors. ${asOf}</p>
  <p class="sp-meta">Looking for one service? Try <a href="/status/aws">AWS</a>, <a href="/status/cloudflare">Cloudflare</a>, <a href="/status/openai">OpenAI</a>, or <a href="/status/stripe">Stripe</a>.</p>
  ${sections}
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
    ...CATALOG.map((p) => ({ loc: `${SITE}/status/${p.id}`, priority: "0.7", freq: "hourly" })),
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
  lines.push("> Live status of the infrastructure and AI providers in your stack. Outage Observer aggregates the official status pages of " + CATALOG.length + " providers and reports the moment one changes state. Free, no login.");
  lines.push("");
  lines.push("Outage Observer offers a public web board, a Telegram bot, Slack/Discord webhooks, browser push, and RSS feeds. Each provider has a page answering \"is X down?\" with its current status and recent changes.");
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
  lines.push("");
  lines.push("## Directory & feeds");
  lines.push(`- [Service status directory](${SITE}/status): live status of all ${CATALOG.length} providers`);
  lines.push(`- [Atom feed](${SITE}/feed.xml): every recent status change`);
  lines.push("");
  lines.push("## Tools");
  lines.push(`- [Live board](${SITE}/): interactive status board for your stack`);
  lines.push("- [Telegram bot](https://t.me/outageobserverbot): alerts for the services you choose");
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
  if (path.startsWith("/status/")) {
    const id = decodeURIComponent(path.slice("/status/".length).replace(/\/$/, ""));
    const provider = BY_ID.get(id);
    if (!provider) {
      return new Response(notFoundPage(), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return html(await renderProviderPage(env, provider));
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
  return null;
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
    <p>No accounts, no analytics, no tracking, no advertising identifiers, no third-party SDKs. We do not build user profiles. Like any website, our server receives standard request logs (e.g. IP address) to serve traffic and stop abuse; these are not used to identify or track you and are not sold.</p>
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
    jsonld: [],
    body,
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

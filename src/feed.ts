import { CATALOG, type Provider } from "./catalog";
import { LABEL } from "./labels";
import { getHistory, type HistoryEvent } from "./store";
import { type Env } from "./telegram";

const SITE = "https://outage.observer";
const BY_ID = new Map(CATALOG.map((p) => [p.id, p] as const));

function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function iso(ms: number): string {
  // Atom requires RFC 3339; toISOString gives a Z-suffixed value.
  return new Date(ms).toISOString();
}

/** Human title for one transition, e.g. "Cloudflare recovered (Operational)". */
function entryTitle(p: Provider, level: string): string {
  if (level === "operational") return `${p.name} recovered`;
  return `${p.name}: ${LABEL[level as keyof typeof LABEL] ?? level}`;
}

function renderEntry(ev: HistoryEvent): string {
  const p = BY_ID.get(ev.provider_id);
  const name = p?.name ?? ev.provider_id;
  const link = p ? (p.link ?? p.url) : SITE;
  const title = p ? entryTitle(p, ev.level) : `${name}: ${ev.level}`;
  const when = iso(ev.at);
  // Stable, unique tag URI per history row (id is monotonic in D1).
  const id = `tag:outage.observer,2026:event/${ev.id}`;
  const summary = `${xml(name)} status changed to ${xml(LABEL[ev.level as keyof typeof LABEL] ?? ev.level)} at ${when}.`;
  return (
    "  <entry>\n" +
    `    <title>${xml(title)}</title>\n` +
    `    <id>${id}</id>\n` +
    `    <updated>${when}</updated>\n` +
    `    <link rel="alternate" href="${xml(link)}"/>\n` +
    `    <category term="${xml(ev.level)}"/>\n` +
    `    <summary>${summary}</summary>\n` +
    "  </entry>"
  );
}

/** Render an Atom feed of recent transitions. `scope` controls title + self
 *  link; `ids` (when given) restricts the events to those providers. */
export async function renderFeed(
  env: Env,
  scope: { title: string; selfPath: string },
  ids: string[] | null,
): Promise<string> {
  const events = await getHistory(env, ids, 50);
  const updated = events.length ? iso(events[0].at) : iso(0);
  const self = SITE + scope.selfPath;
  const entries = events.map(renderEntry).join("\n");
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<feed xmlns="http://www.w3.org/2005/Atom">\n' +
    `  <title>${xml(scope.title)}</title>\n` +
    `  <subtitle>Status changes for the providers Outage Observer watches.</subtitle>\n` +
    `  <id>${xml(self)}</id>\n` +
    `  <link rel="self" href="${xml(self)}"/>\n` +
    `  <link rel="alternate" href="${SITE}/"/>\n` +
    `  <updated>${updated}</updated>\n` +
    "  <author><name>Outage Observer</name></author>\n" +
    (entries ? entries + "\n" : "") +
    "</feed>\n"
  );
}

/** Route handler for /feed, /feed.xml, /feed/<id>, /feed/<id>.xml, with an
 *  optional ?ids=a,b,c filter on the global feed (for a "my stack" feed). */
export async function handleFeed(env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (path !== "/feed" && path !== "/feed.xml" && !path.startsWith("/feed/")) {
    return null;
  }

  let ids: string[] | null = null;
  let title = "Outage Observer";
  let selfPath = "/feed.xml";

  if (path.startsWith("/feed/")) {
    const id = path.slice("/feed/".length).replace(/\.xml$/, "");
    const p = BY_ID.get(id);
    if (!p) return new Response("Unknown provider.", { status: 404 });
    ids = [id];
    title = `Outage Observer — ${p.name}`;
    selfPath = `/feed/${id}.xml`;
  } else {
    const q = url.searchParams.get("ids");
    if (q) {
      const wanted = q.split(",").map((s) => s.trim()).filter((s) => BY_ID.has(s));
      if (wanted.length) {
        ids = wanted;
        selfPath = `/feed.xml?ids=${wanted.join(",")}`;
        title = "Outage Observer — your stack";
      }
    }
  }

  const body = await renderFeed(env, { title, selfPath }, ids);
  return new Response(body, {
    headers: {
      "content-type": "application/atom+xml; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60, s-maxage=60",
    },
  });
}

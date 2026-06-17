import { poll } from "./poller";
import { getBoard, getCheckedAt, upsertTarget, setTargetSubs, deleteTargetByToken } from "./store";
import { type Env } from "./telegram";
import { onUpdate } from "./bot";
import { handleIngest } from "./ingest";
import { handleFeed } from "./feed";
import { handleSeo } from "./seo";
import { detectWebhookKind, sendWebhookConfirmation } from "./channels";
import { CATALOG } from "./catalog";
import { isGeo } from "./regions";

// The Durable Object that runs the reliable 1-minute poll loop. Must be exported
// from the Worker entry so wrangler can bind it.
export { PollerDO } from "./poller-do";

/** Poke the singleton poller DO so it (re)arms its alarm loop. Idempotent. */
function pokePoller(env: Env): Promise<unknown> {
  const id = env.POLLER.idFromName("poller");
  return env.POLLER.get(id).fetch("https://poller.internal/ensure").catch((e) => console.error("poke poller failed", String(e)));
}

/** Validated coarse-geo list from a subscribe body (empty = all regions). */
function bodyRegions(body: { regions?: unknown }): string[] {
  return Array.isArray(body?.regions) ? (body.regions as unknown[]).map(String).filter(isGeo) : [];
}

const PROVIDER_IDS = new Set(CATALOG.map((p) => p.id));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // The DO alarm is the reliable primary poller. Cron is now just a watchdog
    // that re-arms the DO's alarm if the loop ever died — no direct poll here, so
    // no double-poll. (The free-tier cron stalls; DO alarms are guaranteed.)
    ctx.waitUntil(pokePoller(env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Public board snapshot. Edge-cached so a traffic spike (an outage is
    // exactly when everyone shows up) doesn't hammer KV.
    if (url.pathname === "/api/status" && request.method === "GET") {
      const cache = caches.default;
      const cacheKey = new Request(new URL("/api/status", url.origin).toString());
      const hit = await cache.match(cacheKey);
      if (hit) return hit;

      const board = await getBoard(env);
      const checkedAt = await getCheckedAt(env);

      // Self-heal: if the source has gone stale (cron stalled AND the heartbeat
      // hasn't caught up), refresh it in the background so any visit re-polls —
      // long before the 10-min user-facing staleness banner would ever show. The
      // edge cache (s-maxage=30) already limits this to ~one trigger per 30s; a
      // 2-min lock guards against a burst of simultaneous cache misses. Safe to
      // run concurrently with the cron now that transition detection is an atomic
      // compare-and-set (no double/lost alerts).
      if (!checkedAt || Date.now() - checkedAt > 90_000) {
        const lock = new Request("https://oo-internal/self-heal-lock");
        if (!(await cache.match(lock))) {
          ctx.waitUntil((async () => {
            await cache.put(lock, new Response("", { headers: { "cache-control": "max-age=120" } }));
            try { await poll(env, Date.now()); } catch (e) { console.error("self-heal poll failed", String(e)); }
          })());
        }
      }

      const res = new Response(
        JSON.stringify({
          updatedAt: board?.updatedAt ?? null,
          checkedAt,
          providers: board?.providers ?? [],
        }),
        {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
            "cache-control": "public, max-age=15, s-maxage=30",
          },
        },
      );
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }

    // Atom feed of recent status changes (pull, no subscription needed).
    if (request.method === "GET" && (url.pathname === "/feed" || url.pathname === "/feed.xml" || url.pathname.startsWith("/feed/"))) {
      const feed = await handleFeed(env, url);
      if (feed) return feed;
    }

    // Sparkle auto-update feed for the Mac app. We keep a branded, stable URL
    // here and redirect to the appcast asset on the rolling `mac-latest` GitHub
    // release (regenerated and re-signed by CI on every Mac release). 302 (not
    // 301) so the target can move; Sparkle follows the redirect.
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/appcast.xml") {
      // 302 (not 301): the target moves to the current mac-latest asset each
      // release. The redirect *path* is stable, so let the edge cache it briefly
      // to shed Worker invocations from update checks. HEAD is handled too (some
      // proxies / uptime checks probe with it).
      return new Response(null, {
        status: 302,
        headers: {
          location: "https://github.com/ekpani/outage-observer/releases/download/mac-latest/appcast.xml",
          "cache-control": "public, max-age=300",
        },
      });
    }

    // SEO / AEO surfaces: server-rendered provider pages, the directory,
    // sitemap, and llms.txt. Edge-cached so crawlers don't hit KV/D1 each time.
    if (request.method === "GET" && (url.pathname === "/status" || url.pathname.startsWith("/status/") || url.pathname === "/sitemap.xml" || url.pathname === "/llms.txt" || ["/privacy", "/about", "/support", "/mac", "/alerts"].includes(url.pathname))) {
      const cache = caches.default;
      // Key by path only: these pages ignore query params, so caching by full URL
      // lets `?x=1`, `?x=2`, … each spawn a distinct entry — cache dilution that
      // forces needless re-renders (and KV/subrequest cost) on junk queries.
      const cacheKey = new Request(new URL(url.pathname, url.origin).toString());
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
      const res = await handleSeo(env, url);
      if (res) {
        if (res.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
      }
    }

    // Guards for the public subscribe/unsubscribe endpoints: cap the body before
    // parsing (memory-DoS), then a per-IP rate limit (unbounded D1 growth +
    // webhook-spam amplification). The Telegram /webhook is secret-gated separately.
    if (request.method === "POST"
        && (url.pathname.startsWith("/api/push/") || url.pathname.startsWith("/api/webhook/"))) {
      if (oversized(request)) return json({ error: "Payload too large." }, 413);
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.SUBSCRIBE_LIMIT.limit({ key: ip });
      if (!success) return json({ error: "Too many requests. Try again shortly." }, 429);
    }

    // Web Push: hand the browser the VAPID public key it needs to subscribe.
    if (url.pathname === "/api/push/key" && request.method === "GET") {
      return json({ key: env.VAPID_PUBLIC ?? null });
    }

    // Register / refresh a browser push subscription against a set of providers.
    if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
      let body: { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; providers?: unknown; regions?: unknown };
      try { body = await request.json(); } catch { return json({ error: "Bad JSON." }, 400); }
      const sub = body?.subscription;
      const endpoint = String(sub?.endpoint ?? "");
      const p256dh = sub?.keys?.p256dh;
      const auth = sub?.keys?.auth;
      if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) {
        return json({ error: "Invalid push subscription." }, 400);
      }
      const valid = new Set(CATALOG.map((p) => p.id));
      const providers = Array.isArray(body?.providers) ? (body.providers as unknown[]).map(String).filter((x) => valid.has(x)) : [];
      if (!providers.length) return json({ error: "Start observing at least one service first." }, 400);
      const regions = bodyRegions(body);

      const { id, token } = await upsertTarget(env, "webpush", endpoint, JSON.stringify({ p256dh, auth }), regions.length ? regions.join(",") : null);
      await setTargetSubs(env, id, providers);
      return json({ ok: true, token, count: providers.length });
    }

    if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") {
      let body: { token?: string };
      try { body = await request.json(); } catch { return json({ error: "Bad JSON." }, 400); }
      const ok = await deleteTargetByToken(env, String(body?.token ?? ""));
      return json({ ok });
    }

    // Connect a Slack/Discord incoming webhook to a set of providers (the
    // services the caller is observing). POSTed from the board, same-origin.
    if (url.pathname === "/api/webhook/subscribe" && request.method === "POST") {
      let body: { url?: string; providers?: unknown; regions?: unknown };
      try { body = await request.json(); } catch { return json({ error: "Bad JSON." }, 400); }
      const hookUrl = String(body?.url ?? "").trim();
      const kind = detectWebhookKind(hookUrl);
      if (!kind) return json({ error: "Unrecognized URL. Paste a Slack or Discord incoming-webhook URL." }, 400);
      const valid = new Set(CATALOG.map((p) => p.id));
      const providers = Array.isArray(body?.providers) ? (body.providers as unknown[]).map(String).filter((x) => valid.has(x)) : [];
      if (!providers.length) return json({ error: "Start observing at least one service first." }, 400);
      const regions = bodyRegions(body);

      const { id, token } = await upsertTarget(env, kind, hookUrl, null, regions.length ? regions.join(",") : null);
      await setTargetSubs(env, id, providers);
      // Best-effort confirmation; if the endpoint rejects it, undo and report.
      const result = await sendWebhookConfirmation(kind, hookUrl, providers.length).catch(() => "retry" as const);
      if (result === "gone") {
        await deleteTargetByToken(env, token);
        return json({ error: `That webhook URL was rejected by ${kind}.` }, 400);
      }
      return json({ ok: true, kind, token, count: providers.length });
    }

    if (url.pathname === "/api/webhook/unsubscribe" && request.method === "POST") {
      let body: { token?: string };
      try { body = await request.json(); } catch { return json({ error: "Bad JSON." }, 400); }
      const ok = await deleteTargetByToken(env, String(body?.token ?? ""));
      return json({ ok });
    }

    // Telegram webhook
    if (url.pathname === "/webhook" && request.method === "POST") {
      const token = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
      if (!(await safeEqual(token, env.WEBHOOK_SECRET))) {
        return new Response("forbidden", { status: 403 });
      }
      try {
        const update = await request.json<any>();
        await onUpdate(env, update);
      } catch (err) {
        console.error("webhook handler failed", { error: String(err) });
      }
      // Always 200 so Telegram does not retry-storm on an internal error.
      return new Response("ok");
    }

    // Push ingest: a provider's status-page webhook POSTs here; we re-fetch + apply.
    if (url.pathname.startsWith("/ingest/")) {
      if (request.method !== "POST") {
        // Friendly note for anyone opening this in a browser (a GET).
        return new Response(
          "Outage Observer ingest endpoint. Status-page webhooks POST here; there is nothing to see via GET.",
          { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
        );
      }
      // Secret can be a path segment (/ingest/<id>/<secret> — cleanest, no query
      // string that some webhook forms reject), a ?secret= query, or a header.
      const [providerId, pathSecret] = url.pathname.slice("/ingest/".length).split("/");
      const secret = pathSecret ?? request.headers.get("x-ingest-secret") ?? url.searchParams.get("secret") ?? "";
      if (!(await safeEqual(secret, env.INGEST_SECRET))) {
        return new Response("forbidden", { status: 403 });
      }
      try {
        return await handleIngest(env, providerId ?? "");
      } catch (err) {
        console.error("ingest failed", { error: String(err) });
        return new Response("ok"); // ack so the sender does not retry-storm
      }
    }

    // Manual poll trigger (used by the GitHub Actions heartbeat backstop).
    // Accept the key via header (preferred — stays out of request logs) or the
    // legacy query param; both are checked timing-safe against DEBUG_KEY.
    if (url.pathname === "/debug/poll") {
      const provided = request.headers.get("x-debug-key") ?? url.searchParams.get("key") ?? "";
      if (await safeEqual(provided, env.DEBUG_KEY)) {
        const n = await poll(env, Date.now());
        ctx.waitUntil(pokePoller(env));   // also (re)arm the DO loop
        return new Response(`polled one shard, ${n} transition(s)`);
      }
    }

    // Short, shareable provider URLs: /stripe -> /status/stripe (301). Static
    // assets and all routes above are handled first, so this only catches a
    // single path segment that is a known provider id.
    if (request.method === "GET") {
      const seg = url.pathname.slice(1);
      if (/^[a-z0-9-]+$/.test(seg) && PROVIDER_IDS.has(seg)) {
        return Response.redirect(new URL(`/status/${seg}`, url.origin).toString(), 301);
      }
    }

    return new Response("not found", { status: 404 });
  },
};

/** Reject obviously-oversized request bodies before parsing — a cheap
 *  memory-DoS guard on the public POST routes (their JSON is always tiny). A
 *  spoofed/absent Content-Length just falls through to the normal small parse. */
function oversized(request: Request, maxBytes = 16384): boolean {
  const len = Number(request.headers.get("content-length") ?? "0");
  return Number.isFinite(len) && len > maxBytes;
}

/** Constant-time secret comparison: hash both sides to a fixed size, then
 *  use timingSafeEqual to avoid leaking length or content via timing. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ah, bh] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ah, bh);
}

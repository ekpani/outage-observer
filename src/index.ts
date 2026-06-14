import { poll } from "./poller";
import { getBoard, getCheckedAt, upsertTarget, setTargetSubs, deleteTargetByToken } from "./store";
import { type Env } from "./telegram";
import { onUpdate } from "./bot";
import { handleIngest } from "./ingest";
import { handleFeed } from "./feed";
import { detectWebhookKind, sendWebhookConfirmation } from "./channels";
import { CATALOG } from "./catalog";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await poll(env, controller.scheduledTime);
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

    // Web Push: hand the browser the VAPID public key it needs to subscribe.
    if (url.pathname === "/api/push/key" && request.method === "GET") {
      return json({ key: env.VAPID_PUBLIC ?? null });
    }

    // Register / refresh a browser push subscription against a set of providers.
    if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
      let body: { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; providers?: unknown };
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
      if (!providers.length) return json({ error: "Add at least one service to My Stack first." }, 400);

      const { id, token } = await upsertTarget(env, "webpush", endpoint, JSON.stringify({ p256dh, auth }));
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
    // caller's "My Stack"). POSTed from the board, same-origin (no CORS needed).
    if (url.pathname === "/api/webhook/subscribe" && request.method === "POST") {
      let body: { url?: string; providers?: unknown };
      try { body = await request.json(); } catch { return json({ error: "Bad JSON." }, 400); }
      const hookUrl = String(body?.url ?? "").trim();
      const kind = detectWebhookKind(hookUrl);
      if (!kind) return json({ error: "Unrecognized URL. Paste a Slack or Discord incoming-webhook URL." }, 400);
      const valid = new Set(CATALOG.map((p) => p.id));
      const providers = Array.isArray(body?.providers) ? (body.providers as unknown[]).map(String).filter((x) => valid.has(x)) : [];
      if (!providers.length) return json({ error: "Add at least one service to My Stack first." }, 400);

      const { id, token } = await upsertTarget(env, kind, hookUrl, null);
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

    // Debug routes (dev only; remove or move behind a header before launch).
    if (url.pathname === "/debug/poll" && (await safeEqual(url.searchParams.get("key") ?? "", env.DEBUG_KEY))) {
      const n = await poll(env, Date.now());
      return new Response(`polled one shard, ${n} transition(s)`);
    }

    return new Response("not found", { status: 404 });
  },
};

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

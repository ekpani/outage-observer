import { poll } from "./poller";
import { getBoard } from "./store";
import { type Env } from "./telegram";
import { onUpdate } from "./bot";
import { handleIngest } from "./ingest";

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
      const res = new Response(
        JSON.stringify(board ?? { updatedAt: null, providers: [] }),
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

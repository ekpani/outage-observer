import { CATALOG } from "./catalog";
import { fetchStatus } from "./adapters";
import { pollAll, formatAlert } from "./poller";
import { addSubscriber, removeSubscriber, getSubscribers } from "./store";
import { sendMessage, type Env } from "./telegram";
import { EMOJI } from "./labels";

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await pollAll(env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("outage-observer: ok");
    }

    // Telegram webhook
    if (url.pathname === "/webhook" && request.method === "POST") {
      const token = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
      if (!(await safeEqual(token, env.WEBHOOK_SECRET))) {
        return new Response("forbidden", { status: 403 });
      }
      try {
        const update = await request.json<any>();
        await handleUpdate(env, update);
      } catch (err) {
        console.error("webhook handler failed", { error: String(err) });
      }
      // Always 200 so Telegram does not retry-storm on an internal error.
      return new Response("ok");
    }

    // Debug routes (dev only; remove or move behind a header before launch).
    if (url.pathname === "/debug/poll" && (await safeEqual(url.searchParams.get("key") ?? "", env.DEBUG_KEY))) {
      const n = await pollAll(env);
      return new Response(`polled, ${n} transition(s)`);
    }

    // Debug: push a sample alert so you can confirm delivery + formatting
    if (url.pathname === "/debug/alert" && (await safeEqual(url.searchParams.get("key") ?? "", env.DEBUG_KEY))) {
      const text = formatAlert("OpenAI", "operational", "major_outage", {
        level: "major_outage",
        description: "Elevated error rates",
        incidents: [
          {
            name: "Elevated errors on the API",
            impact: "major",
            status: "investigating",
            url: "https://status.openai.com",
          },
        ],
      });
      const subs = await getSubscribers(env);
      for (const chatId of subs) await sendMessage(env, chatId, text);
      return new Response(`sent sample alert to ${subs.length} subscriber(s)`);
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

async function handleUpdate(env: Env, update: any): Promise<void> {
  const message = update?.message;
  if (!message?.text) return;

  const chatId: number = message.chat.id;
  const command = String(message.text).trim().split(/\s+/)[0].toLowerCase();

  switch (command) {
    case "/start":
      await addSubscriber(env, chatId);
      await sendMessage(
        env,
        chatId,
        "🟢 <b>Outage Observer</b>\nYou're subscribed. I'll ping you the moment something in your stack changes state.\n\nSend /status to check now, /test for a sample alert, or /stop to unsubscribe.",
      );
      break;
    case "/stop":
      await removeSubscriber(env, chatId);
      await sendMessage(env, chatId, "Unsubscribed. Send /start to resume.");
      break;
    case "/status":
      await sendMessage(env, chatId, await currentStatus(env));
      break;
    case "/test":
      await sendMessage(
        env,
        chatId,
        formatAlert("OpenAI", "operational", "major_outage", {
          level: "major_outage",
          description: "Sample alert",
          incidents: [
            { name: "This is a test incident", impact: "major", status: "investigating" },
          ],
        }),
      );
      break;
    default:
      await sendMessage(env, chatId, "Commands: /start /status /test /stop");
  }
}

async function currentStatus(env: Env): Promise<string> {
  const results = await Promise.allSettled(
    CATALOG.map(async (provider) => ({ provider, status: await fetchStatus(provider) })),
  );
  const lines = ["<b>Your stack</b>"];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { provider, status } = result.value;
    lines.push(`${EMOJI[status.level]} ${provider.name}`);
  }
  return lines.join("\n");
}

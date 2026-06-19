export interface Env {
  STATUS_KV: KVNamespace;
  DB: D1Database;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  DEBUG_KEY: string;
  INGEST_SECRET: string;
  // Web Push (VAPID). Set via `wrangler secret put`. VAPID_PUBLIC is the
  // base64url raw public key (also handed to browsers); VAPID_JWK is the private
  // key JWK (JSON) for signing; VAPID_SUBJECT is a mailto: contact.
  VAPID_PUBLIC: string;
  VAPID_JWK: string;
  VAPID_SUBJECT: string;
  // Per-IP rate limiter for the public subscribe endpoints (Workers Rate
  // Limiting binding; see wrangler.jsonc `ratelimits`).
  SUBSCRIBE_LIMIT: RateLimit;
  // Per-user throttle on bot commands (Telegram/Slack/Discord).
  CMD_LIMIT: RateLimit;
  // Cloudflare Turnstile (bot check on the public write endpoints). Both set via
  // `wrangler secret put`; optional, so the endpoints run unguarded until set.
  // TURNSTILE_SITEKEY is the public widget key (handed to the browser);
  // TURNSTILE_SECRET signs the server-side siteverify call.
  TURNSTILE_SITEKEY?: string;
  TURNSTILE_SECRET?: string;
  // Durable Object that runs the reliable 1-minute poll loop via alarms.
  POLLER: DurableObjectNamespace;
  // Discord bot (HTTP interactions endpoint). All set via `wrangler secret put`;
  // optional so the Worker runs before the app is configured (routes 503 until set).
  DISCORD_PUBLIC_KEY?: string;   // hex — verifies Ed25519-signed interactions
  DISCORD_BOT_TOKEN?: string;    // Bot token — creates per-channel webhooks
  DISCORD_APP_ID?: string;       // Application id — for deferred follow-up edits
  // Slack bot (slash command). Set via `wrangler secret put`.
  SLACK_SIGNING_SECRET?: string; // verifies request signatures (HMAC-SHA256), app-wide
  // Slack OAuth (multi-workspace install). From the app's Basic Information.
  // Per-workspace bot tokens come from the OAuth install (slack_teams), not a secret.
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
}

/** Workers Rate Limiting binding (open beta). `limit({ key })` → { success }. */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface InlineButton {
  text: string;
  callback_data: string;
}
export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

const API = "https://api.telegram.org";

export async function tg(env: Env, method: string, body: unknown): Promise<any> {
  const res = await fetch(`${API}/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json<any>();
}

export function sendMessage(
  env: Env,
  chatId: number | string,
  text: string,
  replyMarkup?: InlineKeyboard,
): Promise<any> {
  return tg(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function editMessageText(
  env: Env,
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboard,
): Promise<any> {
  return tg(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function answerCallback(env: Env, callbackQueryId: string, text?: string): Promise<any> {
  return tg(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

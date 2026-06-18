import { LABEL, EMOJI } from "./labels";
import { type Env } from "./telegram";
import { type Level } from "./adapters";
import { sendWebPush } from "./webpush";
import { regionLabel } from "./regions";

// Neutral event payload stored in target_outbox; each channel formats its own.
export interface AlertEvent {
  id: string;
  name: string;
  level: Level;
  from: Level;
  url: string;
  incident?: string;
  /** Coarse geos affected (GCP/AWS); empty or ["global"] = no region note. */
  regions?: string[];
}

/** A " · Europe, Asia-Pacific" scope note, omitted for global/unknown scope. */
function regionNote(e: AlertEvent): string {
  const r = e.regions ?? [];
  if (!r.length || r.includes("global")) return "";
  return `\nRegions: ${regionLabel(r)}`;
}

// Status palette (mirrors tokens.css) for Slack attachment colors / Discord embeds.
export const HEX: Record<Level, string> = {
  operational: "#3FCF5E",
  maintenance: "#5B9DF9",
  degraded: "#E5B84B",
  partial_outage: "#E8853A",
  major_outage: "#E5484D",
  unknown: "#8A8F98",
};

export type DeliverResult = "ok" | "retry" | "gone";

/** Identify an incoming-webhook URL by host. Returns null if unrecognized. */
export function detectWebhookKind(raw: string): "slack" | "discord" | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "hooks.slack.com") return "slack";
  if ((h === "discord.com" || h === "discordapp.com" || h.endsWith(".discord.com")) && u.pathname.includes("/api/webhooks/")) {
    return "discord";
  }
  return null;
}

function headline(e: AlertEvent): string {
  return e.level === "operational" ? `${e.name} recovered` : `${e.name}: ${LABEL[e.level]}`;
}

function slackBody(e: AlertEvent): unknown {
  const detail = `<${e.url}|${e.name}> — ${LABEL[e.level]}` + (e.incident ? `\n${e.incident}` : "") + regionNote(e);
  return {
    text: `${EMOJI[e.level]} ${headline(e)}`,
    attachments: [{
      color: HEX[e.level],
      blocks: [{ type: "section", text: { type: "mrkdwn", text: detail } }],
    }],
  };
}

function discordBody(e: AlertEvent): unknown {
  return {
    username: "Outage Observer",
    embeds: [{
      title: headline(e),
      url: e.url,
      description: ((e.incident ?? "") + regionNote(e)).trim() || undefined,
      color: parseInt(HEX[e.level].slice(1), 16),
    }],
  };
}

async function postJson(url: string, body: unknown): Promise<DeliverResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // Drain the body so the connection is reusable; we don't need the content.
  await res.body?.cancel().catch(() => {});
  if (res.ok) return "ok";
  if (res.status === 404 || res.status === 410) return "gone";   // webhook deleted
  if (res.status === 429 || res.status >= 500) return "retry";   // transient
  return "gone";   // other 4xx (bad/revoked): don't retry forever
}

/** Slack bot delivery via chat.postMessage (the bot posts to a channel id it was
 *  told to watch, using the workspace bot token). Distinct from the "slack"
 *  incoming-webhook path. */
async function postSlackMessage(token: string, channelId: string, event: AlertEvent): Promise<DeliverResult> {
  if (!token) return "retry";
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: channelId, ...(slackBody(event) as object) }),
  });
  const data = await res.json<{ ok?: boolean; error?: string }>().catch(() => ({} as { ok?: boolean; error?: string }));
  if (data?.ok) return "ok";
  // Permanent failures: the channel/workspace is gone or the token is dead.
  const dead = ["channel_not_found", "is_archived", "account_inactive", "token_revoked", "invalid_auth", "no_permission"];
  if (dead.includes(String(data?.error))) return "gone";
  return "retry";   // incl. not_in_channel (user can /invite the bot), rate_limited
}

export async function deliver(
  env: Env,
  target: { channel: string; address: string; meta: string | null; token?: string },
  event: AlertEvent,
): Promise<DeliverResult> {
  switch (target.channel) {
    case "slack": return postJson(target.address, slackBody(event));
    case "discord": return postJson(target.address, discordBody(event));
    case "discord-bot": {
      // Bot-managed channel: the incoming webhook URL lives in meta.
      let webhook = "";
      try { webhook = JSON.parse(target.meta ?? "{}").webhook ?? ""; } catch { /* malformed */ }
      return webhook ? postJson(webhook, discordBody(event)) : "gone";
    }
    case "slack-bot": return postSlackMessage(target.token ?? "", target.address, event);
    case "webpush": return sendWebPush(env, target, event);
    default: return "gone";
  }
}

/** One-off confirmation sent when a webhook is first connected, so the user sees
 *  it works and which services it covers. */
export async function sendWebhookConfirmation(
  kind: "slack" | "discord",
  url: string,
  count: number,
): Promise<DeliverResult> {
  const text = `🛰 Outage Observer connected. Watching ${count} service${count === 1 ? "" : "s"}. You'll get a message here when any of them changes state.`;
  const body = kind === "slack"
    ? { text }
    : { username: "Outage Observer", content: text };
  return postJson(url, body);
}

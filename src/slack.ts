// Slack slash-command bot. Slack POSTs the command form-encoded to one Request
// URL; we verify the HMAC signature (with a 5-minute replay window), then route
// /outage subcommands. Delivery uses chat.postMessage with the workspace bot
// token (stored as a "slack-bot" target keyed on the channel id).
import { type Env } from "./telegram";
import { statusText, listText, resolveMany, displayName, HELP } from "./botcommands";
import { upsertTarget, setTargetSubs, getTargetByChannelAddress, getTargetSubs, deleteTargetByChannelAddress } from "./store";

const CH = "slack-bot";

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.byteLength !== eb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ea, eb);
}

async function verify(env: Env, raw: string, ts: string, sig: string): Promise<boolean> {
  if (!env.SLACK_SIGNING_SECRET || !ts || !sig) return false;
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;        // replay guard
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SLACK_SIGNING_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${raw}`));
  const expected = "v0=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, sig);
}

function reply(text: string): Response {
  return new Response(JSON.stringify({ response_type: "ephemeral", text }), { headers: { "content-type": "application/json" } });
}

export async function handleSlackCommand(env: Env, request: Request): Promise<Response> {
  const raw = await request.text();
  const ts = request.headers.get("x-slack-request-timestamp") ?? "";
  const sig = request.headers.get("x-slack-signature") ?? "";
  if (!(await verify(env, raw, ts, sig))) return new Response("bad signature", { status: 401 });

  const params = new URLSearchParams(raw);
  const text = (params.get("text") ?? "").trim();
  const channelId = params.get("channel_id") ?? "";
  const teamId = params.get("team_id") ?? "";
  if (!channelId) return reply("Use this in a channel.");

  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = (cmdRaw || "help").toLowerCase();
  const arg = rest.join(" ");

  if (cmd === "status") return reply(await statusText(env, arg));
  if (cmd === "list") return reply(await listText(env, CH, channelId));
  if (cmd === "stop") {
    const removed = await deleteTargetByChannelAddress(env, CH, channelId);
    return reply(removed ? "Stopped. This channel no longer gets Outage Observer alerts." : "This channel wasn't watching anything.");
  }
  if (cmd === "watch") {
    const ids = resolveMany(arg);
    if (!ids.length) return reply("No known services matched. Try ids like `aws openai stripe`.");
    await joinChannel(env, channelId);    // best-effort; needed to post in public channels
    const { id } = await upsertTarget(env, CH, channelId, JSON.stringify({ team: teamId }), null);
    const merged = [...new Set([...await getTargetSubs(env, id), ...ids])];
    await setTargetSubs(env, id, merged);
    return reply(`Now watching ${ids.map(displayName).join(", ")} in this channel. (${merged.length} total) If alerts don't appear, run \`/invite @Outage Observer\` here.`);
  }
  return reply(HELP);
}

/** Best-effort join so the bot can post in a public channel; harmless if it's
 *  already a member or the channel is private (the user then /invites it). */
async function joinChannel(env: Env, channelId: string): Promise<void> {
  if (!env.SLACK_BOT_TOKEN) return;
  await fetch("https://slack.com/api/conversations.join", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
    body: JSON.stringify({ channel: channelId }),
  }).then((r) => r.body?.cancel().catch(() => {})).catch(() => {});
}

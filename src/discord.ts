// Discord slash-command bot over the HTTP Interactions endpoint (no gateway —
// fits a Worker). Discord signs every request with Ed25519; we verify it with
// the app's public key, answer the setup PING, then route /outage subcommands.
// Delivery reuses the targets pipeline: the bot finds-or-creates one incoming
// webhook per channel and stores it as a "discord-bot" target.
import { type Env } from "./telegram";
import { statusText, listText, resolveMany, displayName, HELP } from "./botcommands";
import { upsertTarget, setTargetSubs, getTargetByChannelAddress, getTargetSubs, deleteTargetByChannelAddress } from "./store";

const API = "https://discord.com/api/v10";
const EPHEMERAL = 64;                       // message flag: visible only to invoker
const CH = "discord-bot";
const WEBHOOK_NAME = "Outage Observer";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

async function verify(env: Env, sig: string, ts: string, raw: string): Promise<boolean> {
  if (!env.DISCORD_PUBLIC_KEY || !sig || !ts) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(env.DISCORD_PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, hexToBytes(sig), new TextEncoder().encode(ts + raw));
  } catch { return false; }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}
function reply(content: string): Response {
  return json({ type: 4, data: { content, flags: EPHEMERAL } });   // private to the invoker
}
function say(content: string): Response {
  return json({ type: 4, data: { content } });                     // visible to the whole channel
}

export async function handleDiscordInteraction(env: Env, request: Request, ctx: ExecutionContext): Promise<Response> {
  const sig = request.headers.get("x-signature-ed25519") ?? "";
  const ts = request.headers.get("x-signature-timestamp") ?? "";
  const raw = await request.text();
  if (!(await verify(env, sig, ts, raw))) return new Response("bad signature", { status: 401 });

  let body: any;
  try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  if (body.type === 1) return json({ type: 1 });           // PING -> PONG (endpoint setup)
  if (body.type !== 2) return json({ type: 1 });           // only handle slash commands

  const sub = body.data?.options?.[0];
  const name: string = sub?.name ?? "";
  const optStr = (k: string): string => String((sub?.options ?? []).find((o: any) => o.name === k)?.value ?? "");
  const channelId: string = body.channel_id ?? "";
  const guildId: string | undefined = body.guild_id;

  if (!guildId) return reply("Use this in a server channel, not a DM.");

  if (name === "status") return say(await statusText(env, optStr("provider")));
  if (name === "list") return say(await listText(env, CH, channelId));
  if (name === "stop") {
    const removed = await deleteTargetByChannelAddress(env, CH, channelId);
    return removed ? say("Stopped. This channel no longer gets Outage Observer alerts.") : reply("This channel wasn't watching anything.");
  }
  if (name === "watch") {
    const ids = resolveMany(optStr("providers"));
    if (!ids.length) return reply("No known services matched. Try ids like `aws openai stripe`.");
    // Creating the channel webhook can take a beat; defer (publicly) and edit the
    // reply so we never blow Discord's 3s interaction deadline.
    ctx.waitUntil(doWatch(env, channelId, guildId, ids, body.token).catch((e) => console.error("discord watch failed", String(e))));
    return json({ type: 5 });  // deferred, visible to the channel
  }
  return reply(HELP);
}

async function doWatch(env: Env, channelId: string, guildId: string, ids: string[], token: string): Promise<void> {
  const existing = await getTargetByChannelAddress(env, CH, channelId);
  let webhook = "";
  if (existing?.meta) { try { webhook = JSON.parse(existing.meta).webhook ?? ""; } catch { /* refetch below */ } }
  if (!webhook) webhook = await findOrCreateWebhook(env, channelId);
  if (!webhook) {
    await editOriginal(env, token, "Could not create a webhook here. Give the Outage Observer bot the “Manage Webhooks” permission in this channel and try again.");
    return;
  }
  const { id } = await upsertTarget(env, CH, channelId, JSON.stringify({ webhook, guild: guildId }), null);
  const merged = [...new Set([...await getTargetSubs(env, id), ...ids])];
  await setTargetSubs(env, id, merged);
  await editOriginal(env, token, `Now watching ${ids.map(displayName).join(", ")} in this channel. (${merged.length} total) You'll get a message here when any of them changes state.`);
}

/** Reuse our existing channel webhook if present, else create one. */
async function findOrCreateWebhook(env: Env, channelId: string): Promise<string> {
  if (!env.DISCORD_BOT_TOKEN) return "";
  const auth = { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };
  const list = await fetch(`${API}/channels/${channelId}/webhooks`, { headers: auth });
  if (list.ok) {
    const hooks = await list.json<any[]>().catch(() => []);
    const mine = Array.isArray(hooks) ? hooks.find((h) => h?.name === WEBHOOK_NAME && h?.token) : null;
    if (mine) return `${API}/webhooks/${mine.id}/${mine.token}`;
  }
  const create = await fetch(`${API}/channels/${channelId}/webhooks`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ name: WEBHOOK_NAME }),
  });
  if (!create.ok) { await create.body?.cancel().catch(() => {}); return ""; }
  const h = await create.json<{ id?: string; token?: string }>().catch(() => ({} as { id?: string; token?: string }));
  return h?.id && h?.token ? `${API}/webhooks/${h.id}/${h.token}` : "";
}

/** Replace the deferred placeholder with the real result. */
async function editOriginal(env: Env, token: string, content: string): Promise<void> {
  if (!env.DISCORD_APP_ID) return;
  await fetch(`${API}/webhooks/${env.DISCORD_APP_ID}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  }).then((r) => r.body?.cancel().catch(() => {})).catch(() => {});
}

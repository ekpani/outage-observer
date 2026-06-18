// Slack slash-command bot. Slack POSTs the command form-encoded to one Request
// URL; we verify the HMAC signature (with a 5-minute replay window), then route
// /outage subcommands. Delivery uses chat.postMessage with the workspace bot
// token (stored as a "slack-bot" target keyed on the channel id).
import { type Env } from "./telegram";
import { statusText, listText, resolveMany, displayName, HELP } from "./botcommands";
import { upsertTarget, setTargetSubs, getTargetByChannelAddress, getTargetSubs, deleteTargetByChannelAddress, setSlackTeam } from "./store";
import { renderNotice } from "./seo";

const CH = "slack-bot";
const SITE = "https://outage.observer";
const SCOPES = "commands,chat:write,chat:write.public";

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

// inChannel=true posts the reply for everyone; default is ephemeral (just the
// invoker) so typos, help, and "use in a channel" don't clutter the channel.
function reply(text: string, inChannel = false): Response {
  return new Response(JSON.stringify({ response_type: inChannel ? "in_channel" : "ephemeral", text }), { headers: { "content-type": "application/json" } });
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

  if (cmd === "status") return reply(await statusText(env, arg));   // private quick check
  if (cmd === "list") return reply(await listText(env, CH, channelId), true);
  if (cmd === "stop") {
    const removed = await deleteTargetByChannelAddress(env, CH, channelId);
    return reply(removed ? "Stopped. This channel no longer gets Outage Observer alerts." : "This channel wasn't watching anything.", removed);
  }
  if (cmd === "watch") {
    const ids = resolveMany(arg);
    if (!ids.length) return reply("No known services matched. Try ids like `aws openai stripe`.");
    const { id } = await upsertTarget(env, CH, channelId, JSON.stringify({ team: teamId }), null);
    const merged = [...new Set([...await getTargetSubs(env, id), ...ids])];
    await setTargetSubs(env, id, merged);
    return reply(`Now watching ${ids.map(displayName).join(", ")} in this channel. (${merged.length} total) If alerts don't appear, run \`/invite @Outage Observer\` here.`, true);
  }
  return reply(HELP);
}

// ---- OAuth install flow (multi-workspace) -----------------------------------
// "Add to Slack" -> Slack consent -> callback exchanges the code for that
// workspace's bot token, which we store per team_id. The signing secret is
// app-wide, so request verification already works for every workspace.

function page(title: string, msg: string, status = 200, cta?: { href: string; label: string }): Response {
  return new Response(renderNotice({ title, body: msg, cta }), { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

/** GET /slack/install — kicks off the OAuth consent (with a CSRF state token). */
export async function handleSlackInstall(env: Env): Promise<Response> {
  if (!env.SLACK_CLIENT_ID) return page("Not available yet", "The Slack app isn't fully configured. Check back soon.", 503);
  const state = crypto.randomUUID();
  await env.STATUS_KV.put(`slack_oauth:${state}`, "1", { expirationTtl: 600 });
  const auth = new URL("https://slack.com/oauth/v2/authorize");
  auth.searchParams.set("client_id", env.SLACK_CLIENT_ID);
  auth.searchParams.set("scope", SCOPES);
  auth.searchParams.set("redirect_uri", `${SITE}/slack/oauth/callback`);
  auth.searchParams.set("state", state);
  return Response.redirect(auth.toString(), 302);
}

/** GET /slack/oauth/callback — exchange the code for the workspace bot token. */
export async function handleSlackCallback(env: Env, url: URL): Promise<Response> {
  if (url.searchParams.get("error")) return page("Install cancelled", "No problem — you can add Outage Observer to Slack any time.", 400);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code) return page("Couldn't finish", "Missing authorization code. Please try the install link again.", 400);
  const seen = await env.STATUS_KV.get(`slack_oauth:${state}`);
  if (!seen) return page("Link expired", "That install link expired. Please start again.", 400);
  await env.STATUS_KV.delete(`slack_oauth:${state}`);
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) return page("Not available yet", "The Slack app isn't fully configured.", 503);

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: `${SITE}/slack/oauth/callback`,
    }),
  });
  const data = await res.json<{ ok?: boolean; access_token?: string; team?: { id?: string; name?: string } }>().catch(() => ({} as any));
  if (!data?.ok || !data.access_token || !data.team?.id) {
    return page("Couldn't finish", "Slack didn't complete the install. Please try again.", 400);
  }
  await setSlackTeam(env, data.team.id, data.access_token, data.team.name ?? null);
  return page("Installed", `Outage Observer is now in ${data.team.name ?? "your workspace"}. Use /outage watch <services> in any channel to start.`, 200, { href: SITE + "/", label: "Open the board" });
}

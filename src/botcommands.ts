// Shared command logic for the Slack + Discord bots. Both surfaces parse a
// command into the same handlers here, so status/watch/list/stop behave
// identically and reuse the existing targets + outbox delivery pipeline.
import { CATALOG, ALIASES } from "./catalog";
import { getBoard, getTargetByChannelAddress, getTargetSubs } from "./store";
import { LABEL, EMOJI } from "./labels";
import { type Env } from "./telegram";
import { type Level } from "./adapters";

const BY_ID = new Map(CATALOG.map((p) => [p.id, p] as const));
const BY_NAME = new Map(CATALOG.map((p) => [p.name.toLowerCase(), p] as const));

/** Per-user command throttle, shared by all three bots. Returns true if the
 *  command may proceed. Fails OPEN: a rate-limiter hiccup must never take the
 *  bot down. The inbound webhook has already cost us one request either way;
 *  this caps the *outbound* work (bot-API calls, board reads) one chat can
 *  trigger, so a flood can't burn our quota or starve the poll's subrequests. */
export async function cmdRateOk(env: Env, key: string): Promise<boolean> {
  try {
    return (await env.CMD_LIMIT.limit({ key })).success;
  } catch {
    return true;
  }
}

/** Resolve one token to a provider by id, common-name alias, or exact name. */
export function resolveProvider(input: string) {
  const q = input.trim().toLowerCase().replace(/^@/, "");
  if (!q) return undefined;
  return BY_ID.get(q) ?? (ALIASES[q] ? BY_ID.get(ALIASES[q]) : undefined) ?? BY_NAME.get(q);
}

/** Resolve a space/comma-separated list to a deduped set of provider ids. */
export function resolveMany(input: string): string[] {
  const ids: string[] = [];
  for (const tok of input.split(/[\s,]+/).filter(Boolean)) {
    const p = resolveProvider(tok);
    if (p && !ids.includes(p.id)) ids.push(p.id);
  }
  return ids;
}

export function displayName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

/** "Is X down?" answer for the status command. Reads the display board (KV);
 *  never asserts up/down on a provider we haven't polled (no-fake-news). */
export async function statusText(env: Env, input: string): Promise<string> {
  const p = resolveProvider(input);
  if (!p) {
    return input.trim()
      ? `No service called "${input.trim()}". Try an id like aws, openai, or stripe.`
      : "Usage: /outage status <service>";
  }
  const board = await getBoard(env);
  const entry = board?.providers?.find((e) => e.id === p.id);
  const level = (entry?.level as Level) ?? "unknown";
  const incident = entry?.incident?.name;
  const head = level === "operational"
    ? `${EMOJI[level]} ${p.name} is operational.`
    : level === "unknown"
      ? `${EMOJI[level]} ${p.name}: status not yet known.`
      : `${EMOJI[level]} ${p.name}: ${LABEL[level]}.`;
  const tail = incident && level !== "operational" && level !== "unknown" ? `\n${incident}` : "";
  return `${head}${tail}\nhttps://outage.observer/status/${p.id}`;
}

/** What a channel currently watches, for the list command. */
export async function listText(env: Env, channel: string, address: string): Promise<string> {
  const t = await getTargetByChannelAddress(env, channel, address);
  const subs = t ? await getTargetSubs(env, t.id) : [];
  if (!subs.length) return "This channel isn't watching anything yet. Use /outage watch <services>.";
  return `Watching here: ${subs.map(displayName).join(", ")}`;
}

export const HELP = "Commands: `/outage status <service>`, `/outage watch <services>`, `/outage list`, `/outage stop`, `/outage test`.";

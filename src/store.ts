import type { Env } from "./telegram";
import type { Level } from "./adapters";

const LEVELS_KEY = "levels";
const SUBS_KEY = "subscribers";

/** Map of provider id -> last seen level, stored under a single KV key so a
 *  poll costs one read and at most one write, regardless of catalog size.
 *  (Per-provider writes every minute would blow past KV's 1,000 writes/day
 *  free limit; here we only write when something actually changes.) */
export type LevelMap = Record<string, Level>;

export async function getAllLevels(env: Env): Promise<LevelMap> {
  const raw = await env.STATUS_KV.get(LEVELS_KEY);
  return raw ? (JSON.parse(raw) as LevelMap) : {};
}

export async function setAllLevels(env: Env, levels: LevelMap): Promise<void> {
  await env.STATUS_KV.put(LEVELS_KEY, JSON.stringify(levels));
}

export async function getSubscribers(env: Env): Promise<number[]> {
  const raw = await env.STATUS_KV.get(SUBS_KEY);
  return raw ? (JSON.parse(raw) as number[]) : [];
}

export async function addSubscriber(env: Env, chatId: number): Promise<void> {
  const subs = await getSubscribers(env);
  if (!subs.includes(chatId)) {
    subs.push(chatId);
    await env.STATUS_KV.put(SUBS_KEY, JSON.stringify(subs));
  }
}

export async function removeSubscriber(env: Env, chatId: number): Promise<void> {
  const subs = (await getSubscribers(env)).filter((c) => c !== chatId);
  await env.STATUS_KV.put(SUBS_KEY, JSON.stringify(subs));
}

import type { Env } from "./telegram";
import type { Level } from "./adapters";

const levelKey = (id: string) => `status:${id}`;
const SUBS_KEY = "subscribers";

export async function getLastLevel(env: Env, id: string): Promise<Level | null> {
  return (await env.STATUS_KV.get(levelKey(id))) as Level | null;
}

export async function setLastLevel(env: Env, id: string, level: Level): Promise<void> {
  await env.STATUS_KV.put(levelKey(id), level);
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

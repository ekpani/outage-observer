import type { Env } from "./telegram";
import type { Level } from "./adapters";

const BOARD_KEY = "board";
const SUBS_KEY = "subscribers";

/** A provider's current status, shown on the board and used for alerting. */
export interface BoardEntry {
  id: string;
  name: string;
  category: string;
  level: Level;
  description: string;
  home: string;
  incident?: { name: string; url?: string };
}

/** The full board, persisted under one KV key and served from /api/status.
 *  Written only when its contents change, so per-minute polling stays well
 *  under KV's 1,000 writes/day free limit. */
export interface Board {
  updatedAt: string;
  providers: BoardEntry[];
}

export async function getBoard(env: Env): Promise<Board | null> {
  return await env.STATUS_KV.get<Board>(BOARD_KEY, "json");
}

export async function setBoard(env: Env, board: Board): Promise<void> {
  await env.STATUS_KV.put(BOARD_KEY, JSON.stringify(board));
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

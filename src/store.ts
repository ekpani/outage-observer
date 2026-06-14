import type { Env } from "./telegram";
import type { Level } from "./adapters";

const BOARD_KEY = "board";
const USERS_KEY = "users";
const watchKey = (chatId: number) => `watch:${chatId}`;

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

export async function getUsers(env: Env): Promise<number[]> {
  const raw = await env.STATUS_KV.get(USERS_KEY);
  return raw ? (JSON.parse(raw) as number[]) : [];
}

export async function addUser(env: Env, chatId: number): Promise<void> {
  const users = await getUsers(env);
  if (!users.includes(chatId)) {
    users.push(chatId);
    await env.STATUS_KV.put(USERS_KEY, JSON.stringify(users));
  }
}

export async function removeUser(env: Env, chatId: number): Promise<void> {
  const users = (await getUsers(env)).filter((c) => c !== chatId);
  await env.STATUS_KV.put(USERS_KEY, JSON.stringify(users));
  await env.STATUS_KV.delete(watchKey(chatId));
}

export async function getWatch(env: Env, chatId: number): Promise<string[]> {
  const raw = await env.STATUS_KV.get(watchKey(chatId));
  return raw ? (JSON.parse(raw) as string[]) : [];
}

async function setWatch(env: Env, chatId: number, ids: string[]): Promise<void> {
  if (ids.length) await env.STATUS_KV.put(watchKey(chatId), JSON.stringify(ids));
  else await env.STATUS_KV.delete(watchKey(chatId));
}

/** Toggle one provider in a user's watch list. Returns whether it is now on. */
export async function toggleWatch(env: Env, chatId: number, pid: string): Promise<boolean> {
  const list = await getWatch(env, chatId);
  const has = list.includes(pid);
  await setWatch(env, chatId, has ? list.filter((x) => x !== pid) : [...list, pid]);
  return !has;
}

/** Replace a user's whole watch list (deduped). */
export async function setStack(env: Env, chatId: number, ids: string[]): Promise<void> {
  await setWatch(env, chatId, [...new Set(ids)]);
}

export async function clearWatch(env: Env, chatId: number): Promise<void> {
  await setWatch(env, chatId, []);
}

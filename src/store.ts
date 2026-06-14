import { sendMessage, type Env } from "./telegram";
import type { Level } from "./adapters";

const BOARD_KEY = "board";

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

// ---------- Board (stays in KV) ----------
//
// The board is a single cache-friendly blob read on every /api/status request
// and on every poll. Keeping it in KV means edge reads stay cheap and the hot
// public path never touches D1.

export async function getBoard(env: Env): Promise<Board | null> {
  return await env.STATUS_KV.get<Board>(BOARD_KEY, "json");
}

export async function setBoard(env: Env, board: Board): Promise<void> {
  await env.STATUS_KV.put(BOARD_KEY, JSON.stringify(board));
}

// ---------- Users + watch lists (D1) ----------
//
// Per-user data lives in D1 so fan-out can ask "who watches provider X?" with a
// single indexed query instead of scanning every user's KV blob.

export async function getUsers(env: Env): Promise<number[]> {
  const { results } = await env.DB.prepare("SELECT chat_id FROM users").all<{ chat_id: number }>();
  return results.map((r) => r.chat_id);
}

export async function addUser(env: Env, chatId: number): Promise<void> {
  await env.DB.prepare("INSERT OR IGNORE INTO users (chat_id) VALUES (?)").bind(chatId).run();
}

export async function removeUser(env: Env, chatId: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM users WHERE chat_id = ?").bind(chatId),
    env.DB.prepare("DELETE FROM subscriptions WHERE chat_id = ?").bind(chatId),
  ]);
}

export async function getWatch(env: Env, chatId: number): Promise<string[]> {
  const { results } = await env.DB
    .prepare("SELECT provider_id FROM subscriptions WHERE chat_id = ?")
    .bind(chatId)
    .all<{ provider_id: string }>();
  return results.map((r) => r.provider_id);
}

/** Toggle one provider in a user's watch list. Returns whether it is now on. */
export async function toggleWatch(env: Env, chatId: number, pid: string): Promise<boolean> {
  const existing = await env.DB
    .prepare("SELECT 1 FROM subscriptions WHERE chat_id = ? AND provider_id = ?")
    .bind(chatId, pid)
    .first();
  if (existing) {
    await env.DB
      .prepare("DELETE FROM subscriptions WHERE chat_id = ? AND provider_id = ?")
      .bind(chatId, pid)
      .run();
    return false;
  }
  await env.DB
    .prepare("INSERT OR IGNORE INTO subscriptions (chat_id, provider_id) VALUES (?, ?)")
    .bind(chatId, pid)
    .run();
  return true;
}

/** Replace a user's whole watch list (deduped). */
export async function setStack(env: Env, chatId: number, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  const stmts = [env.DB.prepare("DELETE FROM subscriptions WHERE chat_id = ?").bind(chatId)];
  const insert = env.DB.prepare("INSERT OR IGNORE INTO subscriptions (chat_id, provider_id) VALUES (?, ?)");
  for (const pid of unique) stmts.push(insert.bind(chatId, pid));
  await env.DB.batch(stmts);
}

export async function clearWatch(env: Env, chatId: number): Promise<void> {
  await env.DB.prepare("DELETE FROM subscriptions WHERE chat_id = ?").bind(chatId).run();
}

// ---------- Alert outbox (D1) ----------
//
// The poller enqueues one row per (subscriber, transition) and a bounded batch
// is drained each cron tick. This decouples "detect a transition" from "send N
// Telegram messages", so a big outage can't exhaust the per-invocation
// subrequest budget — the backlog simply flushes over the next few minutes.

export async function enqueueNotification(
  env: Env,
  chatId: number,
  text: string,
  createdAt: number = Date.now(),
): Promise<void> {
  await env.DB
    .prepare("INSERT INTO outbox (chat_id, text, created_at, sent) VALUES (?, ?, ?, 0)")
    .bind(chatId, text, createdAt)
    .run();
}

/** Send up to `max` queued messages, oldest first, and mark them sent.
 *  Returns the number actually sent. Bounded so it fits the shared
 *  50-subrequest poll budget. */
export async function drainOutbox(env: Env, max: number): Promise<number> {
  const { results } = await env.DB
    .prepare("SELECT id, chat_id, text FROM outbox WHERE sent = 0 ORDER BY id LIMIT ?")
    .bind(max)
    .all<{ id: number; chat_id: number; text: string }>();
  if (results.length === 0) return 0;

  const delivered: number[] = [];
  for (const row of results) {
    try {
      await sendMessage(env, row.chat_id, row.text);
      delivered.push(row.id);
    } catch (err) {
      // Leave it queued; a later tick retries. Don't let one bad chat
      // (e.g. a user who blocked the bot) stall the whole batch.
      console.warn("outbox send failed", { id: row.id, error: String(err) });
    }
  }

  if (delivered.length) {
    const placeholders = delivered.map(() => "?").join(",");
    await env.DB
      .prepare(`UPDATE outbox SET sent = 1 WHERE id IN (${placeholders})`)
      .bind(...delivered)
      .run();
  }
  return delivered.length;
}

// ---------- Status history (D1, append-only) ----------
//
// One row per provider transition. Append-only on purpose: D1 answers uptime /
// last-incident / per-service queries today, and the same row shape can stream
// to R2 Data Catalog (Iceberg) + R2 SQL later if the dataset ever outgrows D1.

export async function recordHistory(
  env: Env,
  providerId: string,
  level: string,
  at: number = Date.now(),
): Promise<void> {
  await env.DB
    .prepare("INSERT INTO history (provider_id, level, at) VALUES (?, ?, ?)")
    .bind(providerId, level, at)
    .run();
}

export interface HistoryEvent {
  id: number;
  provider_id: string;
  level: Level;
  at: number;
}

/** Recent transitions, newest first. Optionally restricted to a set of provider
 *  ids (for per-provider / "my stack" feeds). Powers the Atom feed. */
export async function getHistory(
  env: Env,
  ids: string[] | null,
  limit = 50,
): Promise<HistoryEvent[]> {
  if (ids && ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await env.DB
      .prepare(`SELECT id, provider_id, level, at FROM history WHERE provider_id IN (${placeholders}) ORDER BY at DESC LIMIT ?`)
      .bind(...ids, limit)
      .all<HistoryEvent>();
    return results;
  }
  const { results } = await env.DB
    .prepare("SELECT id, provider_id, level, at FROM history ORDER BY at DESC LIMIT ?")
    .bind(limit)
    .all<HistoryEvent>();
  return results;
}

// ---------- Meta (D1 key/value) ----------
//
// "Last checked" updates every poll, which would blow KV's 1,000 writes/day, so
// it lives in D1 (100k/day). Lets the board show a fresh "checked <time>"
// distinct from the board's updatedAt (which is only the last content change).

export async function setCheckedAt(env: Env, ms: number): Promise<void> {
  await env.DB
    .prepare("INSERT INTO meta (key, value) VALUES ('checked_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(String(ms))
    .run();
}

export async function getCheckedAt(env: Env): Promise<number | null> {
  const row = await env.DB
    .prepare("SELECT value FROM meta WHERE key = 'checked_at'")
    .first<{ value: string }>();
  return row ? Number(row.value) : null;
}

import { sendMessage, type Env } from "./telegram";
import type { Level } from "./adapters";
import { deliver, type AlertEvent } from "./channels";
import { parsePrefs } from "./regions";

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
  /** Coarse geos the active incident affects (GCP/AWS); absent/empty = global or
   *  unknown scope. Exposed in /api/status so the Mac app can filter locally. */
  regions?: string[];
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

// ---------- Authoritative alert state (D1, atomic transition detection) ------
//
// Transition detection runs against THIS table, not the KV board, so it can be
// an atomic compare-and-set: cron and push-ingest race safely. Never holds
// `unknown` (failed fetches leave the row untouched → no alert to/from unknown).

export async function getProviderStates(env: Env): Promise<Map<string, Level>> {
  const { results } = await env.DB
    .prepare("SELECT provider_id, level FROM provider_state")
    .all<{ provider_id: string; level: Level }>();
  return new Map(results.map((r) => [r.provider_id, r.level]));
}

/** Advance provider_state atomically in one D1 batch. `baselines` are first-ever
 *  observations (insert-or-ignore — never an alert). `transitions` are
 *  compare-and-set: the UPDATE only flips when the stored level is still `from`,
 *  so a concurrent writer that already moved it matches 0 rows. Returns the ids
 *  whose CAS won — exactly those should fan out an alert (no dup, no loss). */
export async function commitProviderStates(
  env: Env,
  transitions: { id: string; from: Level; to: Level }[],
  baselines: { id: string; level: Level }[],
  at: number = Date.now(),
): Promise<Set<string>> {
  const stmts = [
    ...baselines.map((b) =>
      env.DB.prepare("INSERT OR IGNORE INTO provider_state (provider_id, level, updated_at) VALUES (?, ?, ?)").bind(b.id, b.level, at),
    ),
    ...transitions.map((t) =>
      env.DB.prepare("UPDATE provider_state SET level = ?, updated_at = ? WHERE provider_id = ? AND level = ?").bind(t.to, at, t.id, t.from),
    ),
  ];
  if (!stmts.length) return new Set();
  const results = await env.DB.batch(stmts);
  const confirmed = new Set<string>();
  transitions.forEach((t, i) => {
    if ((results[baselines.length + i]?.meta?.changes ?? 0) > 0) confirmed.add(t.id);
  });
  return confirmed;
}

// ---------- Batched fan-out lookups + enqueue (bounded subrequests) ----------
//
// One IN-query per kind and one batched INSERT per outbox, so fan-out costs a
// handful of subrequests regardless of how many providers transitioned or how
// many subscribers watch them — it can never blow the 50-subrequest budget.

/** A subscriber with their region preference (empty = all regions). */
export interface Subscriber { chatId: number; prefs: string[] }

export async function getSubscribersForProviders(env: Env, providerIds: string[]): Promise<Map<string, Subscriber[]>> {
  if (!providerIds.length) return new Map();
  const ph = providerIds.map(() => "?").join(",");
  const { results } = await env.DB
    .prepare(
      `SELECT s.provider_id, s.chat_id, u.regions
       FROM subscriptions s LEFT JOIN users u ON u.chat_id = s.chat_id
       WHERE s.provider_id IN (${ph})`,
    )
    .bind(...providerIds)
    .all<{ provider_id: string; chat_id: number; regions: string | null }>();
  const map = new Map<string, Subscriber[]>();
  for (const r of results) {
    const sub: Subscriber = { chatId: r.chat_id, prefs: parsePrefs(r.regions) };
    const arr = map.get(r.provider_id);
    if (arr) arr.push(sub); else map.set(r.provider_id, [sub]);
  }
  return map;
}

export async function getTargetsForProviders(env: Env, providerIds: string[]): Promise<Map<string, (Target & { prefs: string[] })[]>> {
  if (!providerIds.length) return new Map();
  const ph = providerIds.map(() => "?").join(",");
  const { results } = await env.DB
    .prepare(
      `SELECT s.provider_id, t.id, t.channel, t.address, t.meta, t.regions
       FROM target_subs s JOIN targets t ON t.id = s.target_id
       WHERE s.provider_id IN (${ph})`,
    )
    .bind(...providerIds)
    .all<{ provider_id: string; id: number; channel: string; address: string; meta: string | null; regions: string | null }>();
  const map = new Map<string, (Target & { prefs: string[] })[]>();
  for (const r of results) {
    const target = { id: r.id, channel: r.channel, address: r.address, meta: r.meta, prefs: parsePrefs(r.regions) };
    const arr = map.get(r.provider_id);
    if (arr) arr.push(target); else map.set(r.provider_id, [target]);
  }
  return map;
}

export async function recordHistoryBatch(env: Env, rows: { id: string; level: Level }[], at: number = Date.now()): Promise<void> {
  if (!rows.length) return;
  await env.DB.batch(rows.map((r) =>
    env.DB.prepare("INSERT INTO history (provider_id, level, at) VALUES (?, ?, ?)").bind(r.id, r.level, at),
  ));
}

/** Observed reliability for a provider, reconstructed from recorded transitions.
 *  Honest by construction: only covers the window since we started tracking, and
 *  `incidents` counts distinct down-periods (degraded/partial/major). Returns
 *  since=0 when there's no history yet (so the page can omit the section). */
export async function getProviderStats(env: Env, providerId: string): Promise<{
  since: number; days: number; incidents: number; lastIncidentAt: number | null; uptimePct: number | null;
}> {
  const { results } = await env.DB
    .prepare("SELECT level, at FROM history WHERE provider_id = ? ORDER BY at ASC")
    .bind(providerId)
    .all<{ level: string; at: number }>();
  if (!results.length) return { since: 0, days: 0, incidents: 0, lastIncidentAt: null, uptimePct: null };
  const now = Date.now();
  const since = results[0].at;
  const isDown = (l: string) => l === "degraded" || l === "partial_outage" || l === "major_outage";
  let downMs = 0, incidents = 0, lastIncidentAt: number | null = null, prevDown = false;
  for (let i = 0; i < results.length; i++) {
    const cur = results[i];
    const next = i + 1 < results.length ? results[i + 1]!.at : now;
    const down = isDown(cur.level);
    if (down && !prevDown) incidents++;        // start of a distinct down-period
    if (down) { downMs += Math.max(0, next - cur.at); lastIncidentAt = cur.at; }
    prevDown = down;
  }
  const total = now - since;
  const uptimePct = total > 0 ? Math.max(0, Math.min(100, 100 * (1 - downMs / total))) : null;
  return { since, days: total / 86_400_000, incidents, lastIncidentAt, uptimePct };
}

export async function enqueueNotificationsBatch(env: Env, rows: { chatId: number; text: string }[], at: number = Date.now()): Promise<void> {
  if (!rows.length) return;
  await env.DB.batch(rows.map((r) =>
    env.DB.prepare("INSERT INTO outbox (chat_id, text, created_at, sent) VALUES (?, ?, ?, 0)").bind(r.chatId, r.text, at),
  ));
}

export async function enqueueTargetEventsBatch(env: Env, rows: { targetId: number; payload: string }[], at: number = Date.now()): Promise<void> {
  if (!rows.length) return;
  await env.DB.batch(rows.map((r) =>
    env.DB.prepare("INSERT INTO target_outbox (target_id, payload, created_at, sent) VALUES (?, ?, ?, 0)").bind(r.targetId, r.payload, at),
  ));
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

// ---------- Delivery targets (D1, non-Telegram channels) ----------
//
// A channel-agnostic substrate parallel to the Telegram tables above (which are
// left untouched). A "target" is one destination (a web-push browser, or a
// Slack/Discord webhook); `target_subs` records which providers it wants; fan-out
// reverse-looks-up by provider and enqueues into `target_outbox`, drained bounded.

export interface Target {
  id: number;
  channel: string;
  address: string;
  meta: string | null;
}

/** Create or update a target (keyed on channel+address). Returns its id and a
 *  stable opaque token used to manage/unsubscribe it later. */
export async function upsertTarget(
  env: Env,
  channel: string,
  address: string,
  meta: string | null,
  regions: string | null = null,
): Promise<{ id: number; token: string }> {
  const token = crypto.randomUUID();
  const row = await env.DB
    .prepare(
      `INSERT INTO targets (channel, address, meta, token, created_at, regions)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(channel, address) DO UPDATE SET meta = excluded.meta, regions = excluded.regions
       RETURNING id, token`,
    )
    .bind(channel, address, meta, token, Date.now(), regions)
    .first<{ id: number; token: string }>();
  return row ?? { id: 0, token };
}

/** A user's region preference (empty = all regions). Telegram /regions sets it. */
export async function setUserRegions(env: Env, chatId: number, regions: string[]): Promise<void> {
  await env.DB
    .prepare("INSERT INTO users (chat_id, regions) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET regions = excluded.regions")
    .bind(chatId, regions.join(","))
    .run();
}

export async function getUserRegions(env: Env, chatId: number): Promise<string[]> {
  const row = await env.DB.prepare("SELECT regions FROM users WHERE chat_id = ?").bind(chatId).first<{ regions: string | null }>();
  return parsePrefs(row?.regions);
}

/** Replace a target's watched providers (deduped). */
export async function setTargetSubs(env: Env, targetId: number, providerIds: string[]): Promise<void> {
  const unique = [...new Set(providerIds)];
  const stmts = [env.DB.prepare("DELETE FROM target_subs WHERE target_id = ?").bind(targetId)];
  const insert = env.DB.prepare("INSERT OR IGNORE INTO target_subs (target_id, provider_id) VALUES (?, ?)");
  for (const pid of unique) stmts.push(insert.bind(targetId, pid));
  await env.DB.batch(stmts);
}

async function deleteTargetId(env: Env, id: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM target_subs WHERE target_id = ?").bind(id),
    env.DB.prepare("DELETE FROM target_outbox WHERE target_id = ?").bind(id),
    env.DB.prepare("DELETE FROM targets WHERE id = ?").bind(id),
  ]);
}

export async function deleteTargetByToken(env: Env, token: string): Promise<boolean> {
  const t = await env.DB.prepare("SELECT id FROM targets WHERE token = ?").bind(token).first<{ id: number }>();
  if (!t) return false;
  await deleteTargetId(env, t.id);
  return true;
}

export async function getTargetsForProvider(env: Env, providerId: string): Promise<Target[]> {
  const { results } = await env.DB
    .prepare(
      `SELECT t.id, t.channel, t.address, t.meta
       FROM target_subs s JOIN targets t ON t.id = s.target_id
       WHERE s.provider_id = ?`,
    )
    .bind(providerId)
    .all<Target>();
  return results;
}

export async function enqueueTargetEvent(env: Env, targetId: number, payload: string): Promise<void> {
  await env.DB
    .prepare("INSERT INTO target_outbox (target_id, payload, created_at, sent) VALUES (?, ?, ?, 0)")
    .bind(targetId, payload, Date.now())
    .run();
}

/** Drain up to `max` queued target messages. Delivers per channel; marks
 *  delivered and permanently-failed rows sent, leaves transient failures queued,
 *  and removes targets whose endpoint is gone (404/410). Returns count sent. */
export async function drainTargetOutbox(env: Env, max: number): Promise<number> {
  const { results } = await env.DB
    .prepare(
      `SELECT o.id, o.payload, t.id AS target_id, t.channel, t.address, t.meta
       FROM target_outbox o JOIN targets t ON t.id = o.target_id
       WHERE o.sent = 0 ORDER BY o.id LIMIT ?`,
    )
    .bind(max)
    .all<{ id: number; payload: string; target_id: number; channel: string; address: string; meta: string | null }>();
  if (results.length === 0) return 0;

  const done: number[] = [];
  const goneTargets = new Set<number>();
  let sent = 0;
  for (const row of results) {
    try {
      const event = JSON.parse(row.payload) as AlertEvent;
      const result = await deliver(env, { channel: row.channel, address: row.address, meta: row.meta }, event);
      if (result === "ok") { done.push(row.id); sent++; }
      else if (result === "gone") { done.push(row.id); goneTargets.add(row.target_id); }
      // "retry": leave queued for a later tick.
    } catch (err) {
      console.warn("target send failed", { id: row.id, error: String(err) });
    }
  }

  if (done.length) {
    const placeholders = done.map(() => "?").join(",");
    await env.DB.prepare(`UPDATE target_outbox SET sent = 1 WHERE id IN (${placeholders})`).bind(...done).run();
  }
  for (const id of goneTargets) await deleteTargetId(env, id);
  return sent;
}

// ---------- Service suggestions (crowd-sourced catalog requests) ----------

/** Record a "please add this" request and count this voter once. Returns the
 *  suggestion's current vote total. votes only increments when the voter is new
 *  (deduped by hashed IP), so the count ≈ distinct people. */
export async function addSuggestion(env: Env, rawName: string, voter: string): Promise<{ votes: number; name: string }> {
  const display = rawName.trim().replace(/\s+/g, " ").slice(0, 60);
  const key = display.toLowerCase();
  const now = Date.now();
  await env.DB
    .prepare("INSERT INTO suggestions (name_key, display_name, votes, created_at, updated_at) VALUES (?, ?, 0, ?, ?) ON CONFLICT(name_key) DO NOTHING")
    .bind(key, display, now, now)
    .run();
  const vote = await env.DB
    .prepare("INSERT OR IGNORE INTO suggestion_votes (name_key, voter) VALUES (?, ?)")
    .bind(key, voter)
    .run();
  if ((vote.meta?.changes ?? 0) > 0) {
    await env.DB.prepare("UPDATE suggestions SET votes = votes + 1, updated_at = ? WHERE name_key = ?").bind(now, key).run();
  }
  const row = await env.DB.prepare("SELECT votes FROM suggestions WHERE name_key = ?").bind(key).first<{ votes: number }>();
  return { votes: row?.votes ?? 0, name: display };
}

export async function getTopSuggestions(env: Env, max = 10): Promise<{ name: string; votes: number }[]> {
  const { results } = await env.DB
    .prepare("SELECT display_name AS name, votes FROM suggestions ORDER BY votes DESC, updated_at DESC LIMIT ?")
    .bind(max)
    .all<{ name: string; votes: number }>();
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

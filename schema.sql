-- Outage Observer per-user data layer (Cloudflare D1 / SQLite).
-- The board itself stays in KV (cache-friendly blob served at /api/status);
-- only users, their watch lists, and the alert outbox live here.
--
-- Apply with:
--   npx wrangler d1 execute outage-observer --remote --file=schema.sql

-- Telegram subscribers (one row per chat).
CREATE TABLE IF NOT EXISTS users (
  chat_id INTEGER PRIMARY KEY
);

-- A user's watch list: which providers they want alerts for.
CREATE TABLE IF NOT EXISTS subscriptions (
  chat_id     INTEGER,
  provider_id TEXT,
  PRIMARY KEY (chat_id, provider_id)
);

-- Reverse lookup for fan-out: "who is watching provider X?".
CREATE INDEX IF NOT EXISTS idx_subs_provider ON subscriptions (provider_id);

-- Durable alert queue. The poller enqueues one row per (subscriber, transition)
-- and drains a bounded batch each cron tick, so a big outage fans out across
-- subsequent minutes instead of blowing the 50-subrequest invocation budget.
CREATE TABLE IF NOT EXISTS outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    INTEGER NOT NULL,
  text       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  sent       INTEGER NOT NULL DEFAULT 0
);

-- Find unsent messages in insertion order, cheaply.
CREATE INDEX IF NOT EXISTS idx_outbox_sent ON outbox (sent, id);

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

-- Status-change history: one append-only row per provider transition. Powers
-- uptime %, last-incident, and per-service "is X down?" pages. Append-only by
-- design, so it can later stream to R2 Data Catalog (Apache Iceberg) + R2 SQL
-- for analytics at scale; until then D1 holds years of it and queries directly.
CREATE TABLE IF NOT EXISTS history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT    NOT NULL,
  level       TEXT    NOT NULL,
  at          INTEGER NOT NULL
);

-- Per-provider timeline lookups for uptime / incident queries.
CREATE INDEX IF NOT EXISTS idx_history_provider_at ON history (provider_id, at);

-- Small key/value table for poll metadata, e.g. the last-checked timestamp, so
-- the board can show "checked <fresh>" without a per-minute KV write (the board
-- itself is only rewritten on change).
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

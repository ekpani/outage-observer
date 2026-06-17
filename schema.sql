-- Outage Observer per-user data layer (Cloudflare D1 / SQLite).
-- The board itself stays in KV (cache-friendly blob served at /api/status);
-- only users, their watch lists, and the alert outbox live here.
--
-- Apply with:
--   npx wrangler d1 execute outage-observer --remote --file=schema.sql

-- Telegram subscribers (one row per chat). `regions` = comma-joined coarse geos
-- the user wants alerts for (NULL/empty = all regions).
CREATE TABLE IF NOT EXISTS users (
  chat_id INTEGER PRIMARY KEY,
  regions TEXT
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
-- Global feed ordering (getHistory with no provider filter, e.g. /feed.xml) sorts
-- by `at` alone; without this it's a full-table scan + filesort on a table built
-- to grow for years.
CREATE INDEX IF NOT EXISTS idx_history_at ON history (at);

-- Small key/value table for poll metadata, e.g. the last-checked timestamp, so
-- the board can show "checked <fresh>" without a per-minute KV write (the board
-- itself is only rewritten on change).
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Authoritative per-provider ALERT state, separate from the KV display board.
-- Transition detection is an atomic compare-and-set on this table, so the cron
-- poll and the push-ingest path can race without double- or losing-alerting
-- (whoever flips the row wins; the loser's UPDATE matches 0 rows and is skipped).
-- It only ever holds real levels — a failed fetch leaves the row untouched — so
-- we never alert to/from `unknown`. Seeded silently on each provider's first
-- observation (insert-or-ignore, no alert).
CREATE TABLE IF NOT EXISTS provider_state (
  provider_id TEXT    PRIMARY KEY,
  level       TEXT    NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Crowd-sourced "please add this service" requests. We add the popular ones to
-- the curated catalog by hand (no self-serve arbitrary feeds — keeps curation +
-- the no-fake-news guarantee). votes ≈ distinct voters (one per hashed IP).
CREATE TABLE IF NOT EXISTS suggestions (
  name_key     TEXT    PRIMARY KEY,   -- normalized (lowercased, trimmed)
  display_name TEXT    NOT NULL,
  votes        INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_suggestions_votes ON suggestions (votes DESC);
-- One vote per (suggestion, voter); voter = hashed IP, so votes can't be trivially inflated.
CREATE TABLE IF NOT EXISTS suggestion_votes (
  name_key TEXT NOT NULL,
  voter    TEXT NOT NULL,
  PRIMARY KEY (name_key, voter)
);

-- ----------------------------------------------------------------------------
-- Non-Telegram delivery targets (web-push browsers, Slack/Discord webhooks).
-- A parallel, channel-agnostic substrate so the Telegram path above stays
-- untouched. Fan-out reverse-looks-up target_subs by provider, enqueues into
-- target_outbox, and a bounded drain delivers per channel.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS targets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel    TEXT    NOT NULL,            -- 'webpush' | 'slack' | 'discord'
  address    TEXT    NOT NULL,            -- push endpoint URL, or webhook URL
  meta       TEXT,                        -- JSON (web-push keys {p256dh,auth}); else NULL
  token      TEXT    NOT NULL,            -- opaque manage/unsubscribe token
  created_at INTEGER NOT NULL,
  regions    TEXT                         -- comma-joined coarse geos (NULL/empty = all)
);
-- One target per (channel, address); re-subscribing updates it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_targets_addr ON targets (channel, address);

-- Which providers each target wants alerts for. Reverse lookup on fan-out.
CREATE TABLE IF NOT EXISTS target_subs (
  target_id   INTEGER NOT NULL,
  provider_id TEXT    NOT NULL,
  PRIMARY KEY (target_id, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_target_subs_provider ON target_subs (provider_id);

-- Durable outbox for non-Telegram channels. Stores a neutral event payload
-- (JSON) so each channel can format at send time. Bounded drain like `outbox`.
CREATE TABLE IF NOT EXISTS target_outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id  INTEGER NOT NULL,
  payload    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  sent       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_target_outbox_sent ON target_outbox (sent, id);

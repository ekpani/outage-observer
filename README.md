# Outage Observer

A Telegram bot that watches the status pages of the infra and model providers in your stack and pings you the moment something changes state. Runs entirely on the Cloudflare Workers free tier.

- **Bot:** [@outageobserverbot](https://t.me/outageobserverbot)
- **Site:** outage.observer

## How it works

A single Worker does two jobs:

- **Cron (every minute):** fetches each provider's status page, normalizes it through an adapter (Atlassian Statuspage or Instatus), compares against the last known level in KV, and on a *transition* fans out a formatted alert to every subscriber. Status is global, so each source is polled once regardless of subscriber count.
- **Webhook:** handles Telegram commands (`/start`, `/status`, `/test`, `/stop`).

## Setup

```bash
npm install

# 1. Log in to Cloudflare
npx wrangler login

# 2. Create the KV namespace, then paste the printed id into wrangler.jsonc
npx wrangler kv namespace create STATUS_KV

# 3. Set secrets
npx wrangler secret put BOT_TOKEN       # from BotFather
npx wrangler secret put WEBHOOK_SECRET  # any long random string
npx wrangler secret put DEBUG_KEY       # any random string

# 4. Deploy
npx wrangler deploy
```

### Point Telegram at the Worker

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://outage-observer.<your-subdomain>.workers.dev/webhook&secret_token=<WEBHOOK_SECRET>"
```

### See an alert fire

1. Open the bot in Telegram and send `/start`.
2. Visit `https://outage-observer.<your-subdomain>.workers.dev/debug/alert?key=<DEBUG_KEY>` to push a sample alert.
3. The cron picks up real transitions automatically once it has a baseline (the first poll just records current levels).

## Local dev

```bash
cp .dev.vars.example .dev.vars   # fill in your values
npx wrangler dev
```

## Catalog

`src/catalog.ts` holds the curated provider list. Most entries use the `statuspage` adapter; a few use `instatus`. Confirm a provider's adapter with one request:

```bash
curl -s https://status.openai.com/api/v2/summary.json | head
```

## Roadmap

- Per-user provider selection (pick your stack) and severity thresholds
- "Add your own status page" by URL (auto-detect type)
- Component-level subscriptions (e.g. GitHub Actions only)
- Web dashboard / Telegram Mini App (the reserved `web/` slot)

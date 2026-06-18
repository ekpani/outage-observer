# Slack & Discord bot setup

The Worker code is already deployed. These are the one-time portal steps (your
part — they need your account). Endpoints, all on `https://outage.observer`:

- Discord interactions: `https://outage.observer/discord/interactions`
- Slack slash command: `https://outage.observer/slack/commands`

Commands (identical on both): `/outage status <service>`, `/outage watch <services…>`,
`/outage list`, `/outage stop`.

---

## Discord (~5 min)

1. **Create the app** — https://discord.com/developers/applications → *New Application*.
2. **Copy three values:**
   - *General Information* → **Application ID** and **Public Key**
   - *Bot* → **Reset Token** (copy the bot token)
3. **Set the secrets** (from the repo root):
   ```
   npx wrangler secret put DISCORD_PUBLIC_KEY   # paste Public Key
   npx wrangler secret put DISCORD_APP_ID       # paste Application ID
   npx wrangler secret put DISCORD_BOT_TOKEN    # paste Bot Token
   ```
   Do this **before** step 4 — Discord sends a verification PING that must pass.
4. **Set the Interactions Endpoint URL** — *General Information* →
   `https://outage.observer/discord/interactions` → Save (it should verify green).
5. **Register the slash command:**
   ```
   DISCORD_APP_ID=<id> DISCORD_BOT_TOKEN=<token> node scripts/register-discord-commands.mjs
   ```
6. **Invite the bot** (scopes `bot` + `applications.commands`, permission Manage Webhooks):
   ```
   https://discord.com/oauth2/authorize?client_id=<APP_ID>&scope=bot+applications.commands&permissions=536870912
   ```
   "Manage Webhooks" lets `/outage watch` create one webhook per channel for delivery.

---

## Slack (~10 min)

1. **Create the app** — https://api.slack.com/apps → *Create New App* → **From a
   manifest** (faster; pre-sets scopes + the slash command). Pick the workspace,
   then paste this manifest (switch the tab to JSON if it shows YAML):
   ```json
   {
     "display_information": {
       "name": "Outage Observer",
       "description": "Provider status and outage alerts for your channels.",
       "background_color": "#070809"
     },
     "features": {
       "bot_user": { "display_name": "Outage Observer", "always_online": true },
       "slash_commands": [
         {
           "command": "/outage",
           "url": "https://outage.observer/slack/commands",
           "description": "Provider status + outage alerts",
           "usage_hint": "status <service> | watch <services> | list | stop",
           "should_escape": false
         }
       ]
     },
     "oauth_config": { "scopes": { "bot": ["commands", "chat:write", "chat:write.public"] } },
     "settings": { "org_deploy_enabled": false, "socket_mode_enabled": false, "token_rotation_enabled": false }
   }
   ```
2. **Set the app-wide secrets.** Bot tokens are per-workspace and come from
   OAuth (below), so the only secrets are the signing secret + OAuth client
   credentials (all under *Basic Information*):
   ```
   npx wrangler secret put SLACK_SIGNING_SECRET   # Basic Information -> App Credentials
   npx wrangler secret put SLACK_CLIENT_ID        # Basic Information -> App Credentials
   npx wrangler secret put SLACK_CLIENT_SECRET    # Basic Information -> App Credentials
   ```
3. **Add the OAuth redirect URL** — *OAuth & Permissions* → **Redirect URLs** →
   `https://outage.observer/slack/oauth/callback` → Save.
4. **Install your own workspace via OAuth** (the same way everyone else does —
   no static token): visit `https://outage.observer/slack/install` and Allow.
   The token is stored per-team in `slack_teams`.
5. **Go public** — *Manage Distribution* → tick the checklist →
   **Activate Public Distribution**. Then share the install link /
   "Add to Slack" button: **`https://outage.observer/slack/install`**.

There is intentionally **no `SLACK_BOT_TOKEN`** — every workspace, including the
home one, authorizes via OAuth, so nothing static is hardcoded.

(From scratch instead of the manifest: add bot scopes `commands`, `chat:write`,
`chat:write.public`; create a `/outage` slash command with Request URL
`https://outage.observer/slack/commands`; then do steps 2-5.)

Public channels work out of the box (`chat:write.public`). For a **private**
channel, run `/invite @Outage Observer` there once.

---

## How delivery works (no new infrastructure)

Both bots reuse the existing `targets` → `target_outbox` → drain pipeline:
- `/outage watch` creates a `target` for the channel and subscribes it to the
  chosen providers (same table the website webhook flow uses).
- Discord: the bot finds-or-creates one incoming webhook per channel
  (`discord-bot` target; delivery posts to that webhook).
- Slack: delivery is `chat.postMessage` with the workspace's bot token, looked up
  per team from `slack_teams` (every workspace authorizes via OAuth; no static
  token) — `slack-bot` target keyed on the channel id.
- Region filtering, the atomic transition detection, and the bounded per-tick
  drain all apply unchanged.

## Distribution / listing

- **Discord**: works in any server you invite it to (one app-wide bot token).
  *Verification* is only required to grow past ~100 servers; *App Directory*
  listing needs that + a light review.
- **Slack**: public distribution is built — any workspace can install via
  `https://outage.observer/slack/install` (OAuth stores its per-team bot token).
  The **Slack Marketplace** listing is the only remaining review (scopes,
  security, privacy, support), and is optional.

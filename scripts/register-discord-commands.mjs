// Registers (bulk-overwrites) the global /outage slash command for the Discord
// app. Run once after creating the app, and again whenever the command shape
// below changes. Global commands can take up to ~1 hour to propagate.
//
//   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... node scripts/register-discord-commands.mjs
//
// (Both values come from the Discord Developer Portal: General Information ->
// Application ID, and Bot -> Token.)

const APP_ID = process.env.DISCORD_APP_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!APP_ID || !TOKEN) {
  console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN in the environment.");
  process.exit(1);
}

// Option type 1 = SUB_COMMAND, 3 = STRING.
const command = {
  name: "outage",
  description: "Check provider status and manage Outage Observer alerts for this channel",
  type: 1,
  options: [
    {
      type: 1, name: "status", description: "Is a provider down right now?",
      options: [{ type: 3, name: "provider", description: "e.g. aws, openai, stripe", required: true }],
    },
    {
      type: 1, name: "watch", description: "Alert this channel when these providers change state",
      options: [{ type: 3, name: "providers", description: "space-separated ids, e.g. aws stripe openai", required: true }],
    },
    { type: 1, name: "list", description: "Show what this channel is watching" },
    { type: 1, name: "stop", description: "Stop Outage Observer alerts in this channel" },
  ],
};

const res = await fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
  method: "PUT",   // bulk overwrite — idempotent
  headers: { authorization: `Bot ${TOKEN}`, "content-type": "application/json" },
  body: JSON.stringify([command]),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Failed (${res.status}):`, text);
  process.exit(1);
}
console.log(`Registered /outage (${res.status}). Up to ~1h to appear in all servers.`);

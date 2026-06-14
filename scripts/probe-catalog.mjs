// Probe each candidate's status endpoint and classify its adapter.
// Run: node scripts/probe-catalog.mjs
// Prints a ready-to-paste catalog plus anything that needs a custom adapter.

const CANDIDATES = [
  // Cloud & hosting
  ["cloudflare", "Cloudflare", "Cloud & hosting", "https://www.cloudflarestatus.com"],
  ["vercel", "Vercel", "Cloud & hosting", "https://www.vercel-status.com"],
  ["netlify", "Netlify", "Cloud & hosting", "https://www.netlifystatus.com"],
  ["digitalocean", "DigitalOcean", "Cloud & hosting", "https://status.digitalocean.com"],
  ["fly", "Fly.io", "Cloud & hosting", "https://status.flyio.net"],
  ["render", "Render", "Cloud & hosting", "https://status.render.com"],
  ["railway", "Railway", "Cloud & hosting", "https://status.railway.app"],
  ["linode", "Linode", "Cloud & hosting", "https://status.linode.com"],
  ["heroku", "Heroku", "Cloud & hosting", "https://status.heroku.com"],

  // Dev & CI
  ["github", "GitHub", "Dev & CI", "https://www.githubstatus.com"],
  ["gitlab", "GitLab", "Dev & CI", "https://status.gitlab.com"],
  ["bitbucket", "Bitbucket", "Dev & CI", "https://bitbucket.status.atlassian.com"],
  ["npm", "npm", "Dev & CI", "https://status.npmjs.org"],
  ["dockerhub", "Docker Hub", "Dev & CI", "https://www.dockerstatus.com"],
  ["circleci", "CircleCI", "Dev & CI", "https://status.circleci.com"],
  ["sentry", "Sentry", "Dev & CI", "https://status.sentry.io"],
  ["jetbrains", "JetBrains", "Dev & CI", "https://status.jetbrains.com"],
  ["jsdelivr", "jsDelivr", "Dev & CI", "https://status.jsdelivr.com"],

  // Data & backend
  ["supabase", "Supabase", "Data & backend", "https://status.supabase.com"],
  ["planetscale", "PlanetScale", "Data & backend", "https://www.planetscalestatus.com"],
  ["mongodb", "MongoDB Atlas", "Data & backend", "https://status.mongodb.com"],
  ["neon", "Neon", "Data & backend", "https://neonstatus.com"],
  ["upstash", "Upstash", "Data & backend", "https://status.upstash.com"],
  ["cockroach", "CockroachDB", "Data & backend", "https://status.cockroachlabs.cloud"],

  // Payments
  ["stripe", "Stripe", "Payments", "https://status.stripe.com"],
  ["paddle", "Paddle", "Payments", "https://status.paddle.com"],
  ["paypal", "PayPal", "Payments", "https://www.paypal-status.com"],

  // Comms
  ["twilio", "Twilio", "Comms", "https://status.twilio.com"],
  ["sendgrid", "SendGrid", "Comms", "https://status.sendgrid.com"],
  ["discord", "Discord", "Comms", "https://discordstatus.com"],
  ["zoom", "Zoom", "Comms", "https://status.zoom.us"],
  ["slack", "Slack", "Comms", "https://slack-status.com"],
  ["resend", "Resend", "Comms", "https://status.resend.com"],

  // Auth & identity
  ["auth0", "Auth0", "Auth & identity", "https://status.auth0.com"],
  ["okta", "Okta", "Auth & identity", "https://status.okta.com"],
  ["clerk", "Clerk", "Auth & identity", "https://status.clerk.com"],
  ["workos", "WorkOS", "Auth & identity", "https://status.workos.com"],

  // AI & model providers
  ["openai", "OpenAI", "AI & model providers", "https://status.openai.com"],
  ["anthropic", "Anthropic", "AI & model providers", "https://status.anthropic.com"],
  ["huggingface", "Hugging Face", "AI & model providers", "https://status.huggingface.co"],
  ["mistral", "Mistral", "AI & model providers", "https://status.mistral.ai"],
  ["cohere", "Cohere", "AI & model providers", "https://status.cohere.com"],
  ["replicate", "Replicate", "AI & model providers", "https://replicatestatus.com"],
  ["groq", "Groq", "AI & model providers", "https://groqstatus.com"],
  ["openrouter", "OpenRouter", "AI & model providers", "https://status.openrouter.ai"],
  ["elevenlabs", "ElevenLabs", "AI & model providers", "https://status.elevenlabs.io"],
  ["perplexity", "Perplexity", "AI & model providers", "https://status.perplexity.com"],
  ["together", "Together AI", "AI & model providers", "https://status.together.ai"],

  // Collaboration
  ["notion", "Notion", "Collaboration", "https://status.notion.so"],
  ["figma", "Figma", "Collaboration", "https://status.figma.com"],
  ["linear", "Linear", "Collaboration", "https://status.linear.app"],
  ["atlassian", "Atlassian", "Collaboration", "https://status.atlassian.com"],
  ["asana", "Asana", "Collaboration", "https://status.asana.com"],
  ["airtable", "Airtable", "Collaboration", "https://status.airtable.com"],

  // CDN & edge
  ["fastly", "Fastly", "CDN & edge", "https://www.fastlystatus.com"],
  ["bunny", "Bunny.net", "CDN & edge", "https://status.bunny.net"],

  // Monitoring
  ["datadog", "Datadog", "Monitoring", "https://status.datadoghq.com"],
  ["pagerduty", "PagerDuty", "Monitoring", "https://status.pagerduty.com"],
  ["grafana", "Grafana Cloud", "Monitoring", "https://status.grafana.com"],
];

const UA = { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" };

async function tryFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: UA, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function classify(url) {
  const sp = await tryFetch(`${url}/api/v2/summary.json`);
  if (sp && sp.status && typeof sp.status.indicator === "string") {
    return { adapter: "statuspage", sample: sp.status.indicator };
  }
  const is = await tryFetch(`${url}/summary.json`);
  if (is && is.page && typeof is.page.status === "string") {
    return { adapter: "instatus", sample: is.page.status };
  }
  return { adapter: "NONE", sample: "" };
}

const results = await Promise.all(
  CANDIDATES.map(async ([id, name, category, url]) => ({
    id,
    name,
    category,
    url,
    ...(await classify(url)),
  })),
);

console.log("--- ALL ---");
for (const r of results) {
  console.log(`${r.adapter.padEnd(11)} ${r.id.padEnd(13)} [${r.sample}] ${r.url}`);
}

console.log("\n--- WORKING (paste into catalog) ---");
for (const r of results.filter((r) => r.adapter !== "NONE")) {
  console.log(
    `  { id: "${r.id}", name: ${JSON.stringify(r.name)}, category: ${JSON.stringify(r.category)}, adapter: "${r.adapter}", url: "${r.url}" },`,
  );
}

console.log("\n--- NEEDS CUSTOM ADAPTER OR BAD URL ---");
for (const r of results.filter((r) => r.adapter === "NONE")) {
  console.log(`  ${r.id} ${r.url}`);
}

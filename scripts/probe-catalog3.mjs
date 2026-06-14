// Broad probe for additional providers. For each candidate, tries Statuspage
// (/api/v2/summary.json) then Instatus (/summary.json) across the given URLs
// plus a www.<id>status.com fallback (the alt-domain lesson). Moderate
// concurrency + browser UA to avoid the false-negatives bot-blocking causes.
// Run: node scripts/probe-catalog3.mjs

const C = [
  // [id, name, category, url, altUrl?]
  // Cloud & hosting
  ["oracle", "Oracle Cloud", "Cloud & hosting", "https://ocistatus.oraclecloud.com"],
  ["scaleway", "Scaleway", "Cloud & hosting", "https://status.scaleway.com"],
  ["hetzner", "Hetzner", "Cloud & hosting", "https://status.hetzner.com"],
  ["vultr", "Vultr", "Cloud & hosting", "https://status.vultr.com"],
  ["ovh", "OVHcloud", "Cloud & hosting", "https://status.ovhcloud.com"],
  ["koyeb", "Koyeb", "Cloud & hosting", "https://status.koyeb.com"],
  ["aiven", "Aiven", "Cloud & hosting", "https://status.aiven.io"],
  ["platformsh", "Platform.sh", "Cloud & hosting", "https://status.platform.sh"],
  ["railway", "Railway", "Cloud & hosting", "https://railway.instatus.com", "https://status.railway.com"],

  // Dev & CI
  ["hashicorp", "HashiCorp", "Dev & CI", "https://status.hashicorp.com"],
  ["travis", "Travis CI", "Dev & CI", "https://www.traviscistatus.com"],
  ["buildkite", "Buildkite", "Dev & CI", "https://www.buildkitestatus.com"],
  ["jfrog", "JFrog", "Dev & CI", "https://status.jfrog.io"],
  ["snyk", "Snyk", "Dev & CI", "https://status.snyk.io"],
  ["sourcegraph", "Sourcegraph", "Dev & CI", "https://status.sourcegraph.com"],
  ["replit", "Replit", "Dev & CI", "https://status.replit.com"],
  ["codesandbox", "CodeSandbox", "Dev & CI", "https://status.codesandbox.io"],
  ["expo", "Expo", "Dev & CI", "https://status.expo.dev"],
  ["gitpod", "Gitpod", "Dev & CI", "https://www.gitpodstatus.com"],
  ["pulumi", "Pulumi", "Dev & CI", "https://status.pulumi.com"],
  ["codecov", "Codecov", "Dev & CI", "https://status.codecov.io"],

  // Data & backend
  ["redis", "Redis Cloud", "Data & backend", "https://status.redis.io"],
  ["algolia", "Algolia", "Data & backend", "https://status.algolia.com"],
  ["pinecone", "Pinecone", "Data & backend", "https://status.pinecone.io"],
  ["elastic", "Elastic Cloud", "Data & backend", "https://status.elastic.co"],
  ["confluent", "Confluent", "Data & backend", "https://status.confluent.cloud"],
  ["snowflake", "Snowflake", "Data & backend", "https://status.snowflake.com"],
  ["databricks", "Databricks", "Data & backend", "https://status.databricks.com"],
  ["fivetran", "Fivetran", "Data & backend", "https://status.fivetran.com"],
  ["dbt", "dbt Cloud", "Data & backend", "https://status.getdbt.com"],
  ["hasura", "Hasura", "Data & backend", "https://status.hasura.io"],
  ["prisma", "Prisma", "Data & backend", "https://www.prisma-status.com"],
  ["turso", "Turso", "Data & backend", "https://status.turso.tech"],
  ["fauna", "Fauna", "Data & backend", "https://status.fauna.com"],
  ["clickhouse", "ClickHouse Cloud", "Data & backend", "https://status.clickhouse.com"],
  ["neon", "Neon", "Data & backend", "https://neon-status.com", "https://neonstatus.com"],

  // Payments
  ["square", "Square", "Payments", "https://www.issquareup.com"],
  ["adyen", "Adyen", "Payments", "https://status.adyen.com"],
  ["plaid", "Plaid", "Payments", "https://status.plaid.com"],
  ["mollie", "Mollie", "Payments", "https://status.mollie.com"],
  ["razorpay", "Razorpay", "Payments", "https://status.razorpay.com"],
  ["chargebee", "Chargebee", "Payments", "https://status.chargebee.com"],
  ["coinbase", "Coinbase", "Payments", "https://status.coinbase.com"],
  ["lemonsqueezy", "Lemon Squeezy", "Payments", "https://status.lemonsqueezy.com"],

  // Comms
  ["postmark", "Postmark", "Comms", "https://status.postmarkapp.com"],
  ["mailgun", "Mailgun", "Comms", "https://status.mailgun.com"],
  ["mailchimp", "Mailchimp", "Comms", "https://status.mailchimp.com"],
  ["resend", "Resend", "Comms", "https://resend-status.com"],
  ["intercom", "Intercom", "Comms", "https://www.intercomstatus.com"],
  ["pusher", "Pusher", "Comms", "https://status.pusher.com"],
  ["ably", "Ably", "Comms", "https://status.ably.com"],
  ["getstream", "Stream", "Comms", "https://status.getstream.io"],
  ["customerio", "Customer.io", "Comms", "https://status.customer.io"],

  // Auth & identity
  ["stytch", "Stytch", "Auth & identity", "https://status.stytch.com"],
  ["frontegg", "Frontegg", "Auth & identity", "https://status.frontegg.com"],
  ["descope", "Descope", "Auth & identity", "https://status.descope.com"],
  ["fusionauth", "FusionAuth", "Auth & identity", "https://status.fusionauth.io"],

  // AI & model providers
  ["fireworks", "Fireworks AI", "AI & model providers", "https://status.fireworks.ai"],
  ["deepgram", "Deepgram", "AI & model providers", "https://status.deepgram.com"],
  ["assemblyai", "AssemblyAI", "AI & model providers", "https://status.assemblyai.com"],
  ["langsmith", "LangSmith", "AI & model providers", "https://status.smith.langchain.com"],
  ["modal", "Modal", "AI & model providers", "https://status.modal.com"],
  ["baseten", "Baseten", "AI & model providers", "https://status.baseten.co"],
  ["runway", "Runway", "AI & model providers", "https://status.runwayml.com"],
  ["stability", "Stability AI", "AI & model providers", "https://status.stability.ai"],
  ["mistral", "Mistral", "AI & model providers", "https://status.mistral.ai", "https://mistral.instatus.com"],
  ["openrouter", "OpenRouter", "AI & model providers", "https://status.openrouter.ai", "https://openrouter.instatus.com"],
  ["together", "Together AI", "AI & model providers", "https://status.together.ai", "https://together.instatus.com"],

  // Collaboration
  ["miro", "Miro", "Collaboration", "https://status.miro.com"],
  ["loom", "Loom", "Collaboration", "https://status.loom.com"],
  ["calendly", "Calendly", "Collaboration", "https://www.calendlystatus.com"],
  ["clickup", "ClickUp", "Collaboration", "https://status.clickup.com"],
  ["monday", "monday.com", "Collaboration", "https://status.monday.com"],
  ["webflow", "Webflow", "Collaboration", "https://status.webflow.com"],
  ["framer", "Framer", "Collaboration", "https://status.framer.com"],
  ["canva", "Canva", "Collaboration", "https://www.canvastatus.com"],

  // CDN & edge
  ["akamai", "Akamai", "CDN & edge", "https://www.akamaistatus.com"],
  ["keycdn", "KeyCDN", "CDN & edge", "https://status.keycdn.com"],
  ["cloudinary", "Cloudinary", "CDN & edge", "https://status.cloudinary.com"],
  ["mux", "Mux", "CDN & edge", "https://status.mux.com"],

  // Monitoring
  ["newrelic", "New Relic", "Monitoring", "https://status.newrelic.com"],
  ["honeycomb", "Honeycomb", "Monitoring", "https://status.honeycomb.io"],
  ["betterstack", "Better Stack", "Monitoring", "https://status.betterstack.com"],
  ["checkly", "Checkly", "Monitoring", "https://status.checklyhq.com"],
  ["pingdom", "Pingdom", "Monitoring", "https://status.pingdom.com"],
  ["bugsnag", "Bugsnag", "Monitoring", "https://status.bugsnag.com"],
  ["rollbar", "Rollbar", "Monitoring", "https://status.rollbar.com"],
  ["launchdarkly", "LaunchDarkly", "Monitoring", "https://status.launchdarkly.com"],
  ["onepassword", "1Password", "Monitoring", "https://status.1password.com"],

  // Commerce & CMS
  ["shopify", "Shopify", "Commerce & CMS", "https://www.shopifystatus.com"],
  ["contentful", "Contentful", "Commerce & CMS", "https://www.contentfulstatus.com"],
  ["sanity", "Sanity", "Commerce & CMS", "https://status.sanity.io"],
  ["storyblok", "Storyblok", "Commerce & CMS", "https://status.storyblok.com"],
  ["ghost", "Ghost", "Commerce & CMS", "https://status.ghost.org"],
  ["wordpress", "WordPress.com", "Commerce & CMS", "https://status.wordpress.com"],

  // Analytics
  ["posthog", "PostHog", "Analytics", "https://status.posthog.com"],
  ["amplitude", "Amplitude", "Analytics", "https://status.amplitude.com"],
  ["mixpanel", "Mixpanel", "Analytics", "https://www.mixpanelstatus.com"],
  ["segment", "Segment", "Analytics", "https://status.segment.com"],
  ["statsig", "Statsig", "Analytics", "https://status.statsig.com"],
  ["plausible", "Plausible", "Analytics", "https://status.plausible.io"],
];

const UA = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "application/json,text/plain,*/*",
};

async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { headers: UA, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(t); }
}

async function classify(id, urls) {
  const tried = [...new Set([...urls, `https://www.${id}status.com`])];
  for (const url of tried) {
    const sp = await get(`${url}/api/v2/summary.json`);
    if (sp && sp.status && typeof sp.status.indicator === "string") return { adapter: "statuspage", url };
    const is = await get(`${url}/summary.json`);
    if (is && is.page && typeof is.page.status === "string") return { adapter: "instatus", url };
  }
  return null;
}

const results = [];
for (let i = 0; i < C.length; i += 6) {
  const chunk = C.slice(i, i + 6);
  const r = await Promise.all(chunk.map(async ([id, name, category, ...urls]) => {
    const hit = await classify(id, urls);
    return { id, name, category, hit };
  }));
  results.push(...r);
}

const ok = results.filter((r) => r.hit);
const fail = results.filter((r) => !r.hit);
console.log(`HITS: ${ok.length} / ${results.length}\n`);
for (const r of ok) {
  console.log(`  { id: "${r.id}", name: ${JSON.stringify(r.name)}, category: ${JSON.stringify(r.category)}, adapter: "${r.hit.adapter}", url: "${r.hit.url}" },`);
}
console.log(`\nFAILED (${fail.length}): ${fail.map((r) => r.id).join(", ")}`);

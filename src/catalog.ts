export type Adapter = "statuspage" | "instatus";

export interface Provider {
  id: string;
  name: string;
  category: string;
  adapter: Adapter;
  /** Base status-page URL, no trailing slash. */
  url: string;
}

/**
 * Curated catalog. Every entry was probed live (scripts/probe-catalog.mjs) and
 * confirmed to expose a standard Statuspage (/api/v2/summary.json) or Instatus
 * (/summary.json) feed, so each one actually resolves.
 *
 * Pending a custom adapter (these moved to bespoke status pages with no standard
 * JSON feed): Stripe, PayPal, Paddle, GitLab, Heroku, Docker, Slack, Auth0, Okta,
 * Notion, Fastly, PagerDuty, Hugging Face, Mistral, OpenRouter, Together, Resend,
 * Neon, Railway, JetBrains, jsDelivr. Adding per-vendor adapters brings them in.
 * (This is why Payments is currently empty: Stripe/PayPal/Paddle are all custom.)
 */
export const CATALOG: Provider[] = [
  // Cloud & hosting
  { id: "cloudflare", name: "Cloudflare", category: "Cloud & hosting", adapter: "statuspage", url: "https://www.cloudflarestatus.com" },
  { id: "vercel", name: "Vercel", category: "Cloud & hosting", adapter: "statuspage", url: "https://www.vercel-status.com" },
  { id: "netlify", name: "Netlify", category: "Cloud & hosting", adapter: "statuspage", url: "https://www.netlifystatus.com" },
  { id: "digitalocean", name: "DigitalOcean", category: "Cloud & hosting", adapter: "statuspage", url: "https://status.digitalocean.com" },
  { id: "fly", name: "Fly.io", category: "Cloud & hosting", adapter: "statuspage", url: "https://status.flyio.net" },
  { id: "render", name: "Render", category: "Cloud & hosting", adapter: "statuspage", url: "https://status.render.com" },
  { id: "linode", name: "Linode", category: "Cloud & hosting", adapter: "statuspage", url: "https://status.linode.com" },

  // Dev & CI
  { id: "github", name: "GitHub", category: "Dev & CI", adapter: "statuspage", url: "https://www.githubstatus.com" },
  { id: "bitbucket", name: "Bitbucket", category: "Dev & CI", adapter: "statuspage", url: "https://bitbucket.status.atlassian.com" },
  { id: "npm", name: "npm", category: "Dev & CI", adapter: "statuspage", url: "https://status.npmjs.org" },
  { id: "circleci", name: "CircleCI", category: "Dev & CI", adapter: "statuspage", url: "https://status.circleci.com" },
  { id: "sentry", name: "Sentry", category: "Dev & CI", adapter: "statuspage", url: "https://status.sentry.io" },

  // Data & backend
  { id: "supabase", name: "Supabase", category: "Data & backend", adapter: "statuspage", url: "https://status.supabase.com" },
  { id: "planetscale", name: "PlanetScale", category: "Data & backend", adapter: "statuspage", url: "https://www.planetscalestatus.com" },
  { id: "mongodb", name: "MongoDB Atlas", category: "Data & backend", adapter: "statuspage", url: "https://status.mongodb.com" },
  { id: "upstash", name: "Upstash", category: "Data & backend", adapter: "statuspage", url: "https://status.upstash.com" },
  { id: "cockroach", name: "CockroachDB", category: "Data & backend", adapter: "statuspage", url: "https://status.cockroachlabs.cloud" },

  // Comms
  { id: "twilio", name: "Twilio", category: "Comms", adapter: "statuspage", url: "https://status.twilio.com" },
  { id: "sendgrid", name: "SendGrid", category: "Comms", adapter: "statuspage", url: "https://status.sendgrid.com" },
  { id: "discord", name: "Discord", category: "Comms", adapter: "statuspage", url: "https://discordstatus.com" },
  { id: "zoom", name: "Zoom", category: "Comms", adapter: "statuspage", url: "https://status.zoom.us" },

  // Auth & identity
  { id: "clerk", name: "Clerk", category: "Auth & identity", adapter: "statuspage", url: "https://status.clerk.com" },
  { id: "workos", name: "WorkOS", category: "Auth & identity", adapter: "statuspage", url: "https://status.workos.com" },

  // AI & model providers
  { id: "openai", name: "OpenAI", category: "AI & model providers", adapter: "statuspage", url: "https://status.openai.com" },
  { id: "anthropic", name: "Anthropic", category: "AI & model providers", adapter: "statuspage", url: "https://status.anthropic.com" },
  { id: "cohere", name: "Cohere", category: "AI & model providers", adapter: "statuspage", url: "https://status.cohere.com" },
  { id: "replicate", name: "Replicate", category: "AI & model providers", adapter: "statuspage", url: "https://replicatestatus.com" },
  { id: "groq", name: "Groq", category: "AI & model providers", adapter: "statuspage", url: "https://groqstatus.com" },
  { id: "elevenlabs", name: "ElevenLabs", category: "AI & model providers", adapter: "statuspage", url: "https://status.elevenlabs.io" },
  { id: "perplexity", name: "Perplexity", category: "AI & model providers", adapter: "instatus", url: "https://status.perplexity.com" },

  // Collaboration
  { id: "figma", name: "Figma", category: "Collaboration", adapter: "statuspage", url: "https://status.figma.com" },
  { id: "atlassian", name: "Atlassian", category: "Collaboration", adapter: "statuspage", url: "https://status.atlassian.com" },
  { id: "asana", name: "Asana", category: "Collaboration", adapter: "statuspage", url: "https://status.asana.com" },
  { id: "airtable", name: "Airtable", category: "Collaboration", adapter: "statuspage", url: "https://status.airtable.com" },
  { id: "linear", name: "Linear", category: "Collaboration", adapter: "statuspage", url: "https://linearstatus.com" },

  // CDN & edge
  { id: "bunny", name: "Bunny.net", category: "CDN & edge", adapter: "statuspage", url: "https://status.bunny.net" },

  // Monitoring
  { id: "datadog", name: "Datadog", category: "Monitoring", adapter: "statuspage", url: "https://status.datadoghq.com" },
  { id: "grafana", name: "Grafana Cloud", category: "Monitoring", adapter: "statuspage", url: "https://status.grafana.com" },
];

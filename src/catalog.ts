export type Adapter = "statuspage" | "instatus" | "slack" | "heroku" | "gcp" | "aws" | "azure" | "x";

export interface Provider {
  id: string;
  name: string;
  category: string;
  adapter: Adapter;
  /** statuspage/instatus: base status-page URL (no trailing slash).
   *  slack/heroku/gcp: the full feed endpoint. */
  url: string;
  /** Human status page to link to, when `url` is an API endpoint (custom
   *  adapters). For statuspage/instatus, `url` is already browsable. */
  link?: string;
}

/**
 * Curated catalog, all entries probed live (scripts/probe-catalog*.mjs).
 * statuspage/instatus entries expose the standard feed; slack/heroku/gcp/aws/
 * azure use each vendor's own JSON or RSS API (for those, `url` is the full
 * endpoint and `link` is the human page).
 *
 * Lesson: a vendor's REAL Statuspage often lives at www.<brand>status.com, not
 * status.<brand> (Stripe = www.stripestatus.com, Notion = www.notion-status.com).
 *
 * Verified custom client-rendered SPAs with no feed (would need a headless
 * browser): Fastly, Okta, Docker, PagerDuty, Hugging Face, GitLab, PayPal.
 */
export const CATALOG: Provider[] = [
  // Cloud & hosting
  { id: "cloudflare", name: "Cloudflare", category: "Cloud & hosting", adapter: "statuspage", url: "https://www.cloudflarestatus.com" },
  { id: "gcp", name: "Google Cloud", category: "Cloud & hosting", adapter: "gcp", url: "https://status.cloud.google.com/incidents.json", link: "https://status.cloud.google.com" },
  { id: "heroku", name: "Heroku", category: "Cloud & hosting", adapter: "heroku", url: "https://status.heroku.com/api/v4/current-status", link: "https://status.heroku.com" },
  { id: "aws", name: "Amazon Web Services", category: "Cloud & hosting", adapter: "aws", url: "https://health.aws.amazon.com/public/currentevents", link: "https://health.aws.amazon.com/health/status" },
  { id: "azure", name: "Microsoft Azure", category: "Cloud & hosting", adapter: "azure", url: "https://azure.status.microsoft/en-us/status/feed/", link: "https://status.azure.com" },
  { id: "vercel", name: "Vercel", category: "Cloud & hosting", adapter: "statuspage", url: "https://www.vercel-status.com" },
  { id: "netlify", name: "Netlify", category: "Cloud & hosting", adapter: "statuspage", url: "https://www.netlifystatus.com" },
  { id: "digitalocean", name: "DigitalOcean", category: "Cloud & hosting", adapter: "statuspage", url: "https://status.digitalocean.com" },
  { id: "fly", name: "Fly.io", category: "Cloud & hosting", adapter: "statuspage", url: "https://status.flyio.net" },
  { id: "render", name: "Render", category: "Cloud & hosting", adapter: "statuspage", url: "https://status.render.com" },
  { id: "railway", name: "Railway", category: "Cloud & hosting", adapter: "instatus", url: "https://railway.instatus.com" },
  { id: "scaleway", name: "Scaleway", category: "Cloud & hosting", adapter: "statuspage", url: "https://status.scaleway.com" },
  { id: "aiven", name: "Aiven", category: "Cloud & hosting", adapter: "statuspage", url: "https://status.aiven.io" },
  { id: "koyeb", name: "Koyeb", category: "Cloud & hosting", adapter: "instatus", url: "https://status.koyeb.com" },
  { id: "linode", name: "Linode", category: "Cloud & hosting", adapter: "statuspage", url: "https://status.linode.com" },

  // Dev & CI
  { id: "github", name: "GitHub", category: "Dev & CI", adapter: "statuspage", url: "https://www.githubstatus.com" },
  { id: "bitbucket", name: "Bitbucket", category: "Dev & CI", adapter: "statuspage", url: "https://bitbucket.status.atlassian.com" },
  { id: "npm", name: "npm", category: "Dev & CI", adapter: "statuspage", url: "https://status.npmjs.org" },
  { id: "circleci", name: "CircleCI", category: "Dev & CI", adapter: "statuspage", url: "https://status.circleci.com" },
  { id: "hashicorp", name: "HashiCorp", category: "Dev & CI", adapter: "statuspage", url: "https://status.hashicorp.com" },
  { id: "travis", name: "Travis CI", category: "Dev & CI", adapter: "statuspage", url: "https://www.traviscistatus.com" },
  { id: "buildkite", name: "Buildkite", category: "Dev & CI", adapter: "statuspage", url: "https://www.buildkitestatus.com" },
  { id: "jfrog", name: "JFrog", category: "Dev & CI", adapter: "statuspage", url: "https://status.jfrog.io" },
  { id: "snyk", name: "Snyk", category: "Dev & CI", adapter: "statuspage", url: "https://status.snyk.io" },
  { id: "expo", name: "Expo", category: "Dev & CI", adapter: "statuspage", url: "https://status.expo.dev" },
  { id: "gitpod", name: "Gitpod", category: "Dev & CI", adapter: "statuspage", url: "https://www.gitpodstatus.com" },
  { id: "pulumi", name: "Pulumi", category: "Dev & CI", adapter: "statuspage", url: "https://status.pulumi.com" },
  { id: "codecov", name: "Codecov", category: "Dev & CI", adapter: "statuspage", url: "https://status.codecov.io" },
  { id: "sentry", name: "Sentry", category: "Dev & CI", adapter: "statuspage", url: "https://status.sentry.io" },

  // Data & backend
  { id: "supabase", name: "Supabase", category: "Data & backend", adapter: "statuspage", url: "https://status.supabase.com" },
  { id: "planetscale", name: "PlanetScale", category: "Data & backend", adapter: "statuspage", url: "https://www.planetscalestatus.com" },
  { id: "mongodb", name: "MongoDB Atlas", category: "Data & backend", adapter: "statuspage", url: "https://status.mongodb.com" },
  { id: "upstash", name: "Upstash", category: "Data & backend", adapter: "statuspage", url: "https://status.upstash.com" },
  { id: "cockroach", name: "CockroachDB", category: "Data & backend", adapter: "statuspage", url: "https://status.cockroachlabs.cloud" },
  { id: "pinecone", name: "Pinecone", category: "Data & backend", adapter: "statuspage", url: "https://status.pinecone.io" },
  { id: "elastic", name: "Elastic Cloud", category: "Data & backend", adapter: "statuspage", url: "https://status.elastic.co" },
  { id: "confluent", name: "Confluent", category: "Data & backend", adapter: "statuspage", url: "https://status.confluent.cloud" },
  { id: "snowflake", name: "Snowflake", category: "Data & backend", adapter: "statuspage", url: "https://status.snowflake.com" },
  { id: "fivetran", name: "Fivetran", category: "Data & backend", adapter: "statuspage", url: "https://status.fivetran.com" },
  { id: "dbt", name: "dbt Cloud", category: "Data & backend", adapter: "statuspage", url: "https://status.getdbt.com" },
  { id: "prisma", name: "Prisma", category: "Data & backend", adapter: "statuspage", url: "https://www.prisma-status.com" },
  { id: "clickhouse", name: "ClickHouse Cloud", category: "Data & backend", adapter: "statuspage", url: "https://status.clickhouse.com" },

  // Payments
  { id: "stripe", name: "Stripe", category: "Payments", adapter: "statuspage", url: "https://www.stripestatus.com" },
  { id: "square", name: "Square", category: "Payments", adapter: "statuspage", url: "https://www.issquareup.com" },
  { id: "plaid", name: "Plaid", category: "Payments", adapter: "statuspage", url: "https://status.plaid.com" },
  { id: "mollie", name: "Mollie", category: "Payments", adapter: "instatus", url: "https://status.mollie.com" },
  { id: "chargebee", name: "Chargebee", category: "Payments", adapter: "statuspage", url: "https://status.chargebee.com" },
  { id: "coinbase", name: "Coinbase", category: "Finance & crypto", adapter: "statuspage", url: "https://status.coinbase.com" },

  // Comms
  { id: "twilio", name: "Twilio", category: "Comms", adapter: "statuspage", url: "https://status.twilio.com" },
  { id: "sendgrid", name: "SendGrid", category: "Comms", adapter: "statuspage", url: "https://status.sendgrid.com" },
  { id: "discord", name: "Discord", category: "Social & community", adapter: "statuspage", url: "https://discordstatus.com" },
  { id: "zoom", name: "Zoom", category: "Comms", adapter: "statuspage", url: "https://status.zoom.us" },
  { id: "slack", name: "Slack", category: "Comms", adapter: "slack", url: "https://slack-status.com/api/v2.0.0/current", link: "https://slack-status.com" },
  { id: "mailgun", name: "Mailgun", category: "Comms", adapter: "statuspage", url: "https://status.mailgun.com" },
  { id: "resend", name: "Resend", category: "Comms", adapter: "statuspage", url: "https://resend-status.com" },
  { id: "intercom", name: "Intercom", category: "Comms", adapter: "statuspage", url: "https://www.intercomstatus.com" },
  { id: "pusher", name: "Pusher", category: "Comms", adapter: "statuspage", url: "https://status.pusher.com" },
  { id: "ably", name: "Ably", category: "Comms", adapter: "statuspage", url: "https://status.ably.com" },
  { id: "getstream", name: "Stream", category: "Comms", adapter: "statuspage", url: "https://status.getstream.io" },

  // Auth & identity
  { id: "clerk", name: "Clerk", category: "Auth & identity", adapter: "statuspage", url: "https://status.clerk.com" },
  { id: "workos", name: "WorkOS", category: "Auth & identity", adapter: "statuspage", url: "https://status.workos.com" },
  { id: "stytch", name: "Stytch", category: "Auth & identity", adapter: "instatus", url: "https://status.stytch.com" },
  { id: "frontegg", name: "Frontegg", category: "Auth & identity", adapter: "statuspage", url: "https://status.frontegg.com" },
  { id: "fusionauth", name: "FusionAuth", category: "Auth & identity", adapter: "statuspage", url: "https://status.fusionauth.io" },

  // AI & model providers
  { id: "openai", name: "OpenAI", category: "AI & model providers", adapter: "statuspage", url: "https://status.openai.com" },
  { id: "anthropic", name: "Anthropic", category: "AI & model providers", adapter: "statuspage", url: "https://status.anthropic.com" },
  { id: "cohere", name: "Cohere", category: "AI & model providers", adapter: "statuspage", url: "https://status.cohere.com" },
  { id: "replicate", name: "Replicate", category: "AI & model providers", adapter: "statuspage", url: "https://replicatestatus.com" },
  { id: "groq", name: "Groq", category: "AI & model providers", adapter: "statuspage", url: "https://groqstatus.com" },
  { id: "elevenlabs", name: "ElevenLabs", category: "AI & model providers", adapter: "statuspage", url: "https://status.elevenlabs.io" },
  { id: "perplexity", name: "Perplexity", category: "AI & model providers", adapter: "instatus", url: "https://status.perplexity.com" },
  { id: "deepgram", name: "Deepgram", category: "AI & model providers", adapter: "statuspage", url: "https://status.deepgram.com" },
  { id: "assemblyai", name: "AssemblyAI", category: "AI & model providers", adapter: "statuspage", url: "https://status.assemblyai.com" },
  { id: "langsmith", name: "LangSmith", category: "AI & model providers", adapter: "statuspage", url: "https://status.smith.langchain.com" },
  { id: "baseten", name: "Baseten", category: "AI & model providers", adapter: "statuspage", url: "https://status.baseten.co" },
  { id: "runway", name: "Runway", category: "AI & model providers", adapter: "statuspage", url: "https://status.runwayml.com" },
  { id: "stability", name: "Stability AI", category: "AI & model providers", adapter: "statuspage", url: "https://status.stability.ai" },

  // Collaboration
  { id: "figma", name: "Figma", category: "Collaboration", adapter: "statuspage", url: "https://status.figma.com" },
  { id: "atlassian", name: "Atlassian", category: "Collaboration", adapter: "statuspage", url: "https://status.atlassian.com" },
  { id: "asana", name: "Asana", category: "Collaboration", adapter: "statuspage", url: "https://status.asana.com" },
  { id: "airtable", name: "Airtable", category: "Collaboration", adapter: "statuspage", url: "https://status.airtable.com" },
  { id: "linear", name: "Linear", category: "Collaboration", adapter: "statuspage", url: "https://linearstatus.com" },
  { id: "notion", name: "Notion", category: "Collaboration", adapter: "statuspage", url: "https://www.notion-status.com" },
  { id: "miro", name: "Miro", category: "Collaboration", adapter: "statuspage", url: "https://status.miro.com" },
  { id: "calendly", name: "Calendly", category: "Collaboration", adapter: "statuspage", url: "https://www.calendlystatus.com" },
  { id: "monday", name: "monday.com", category: "Collaboration", adapter: "statuspage", url: "https://status.monday.com" },
  { id: "webflow", name: "Webflow", category: "Collaboration", adapter: "statuspage", url: "https://status.webflow.com" },
  { id: "canva", name: "Canva", category: "Collaboration", adapter: "statuspage", url: "https://www.canvastatus.com" },

  // CDN & edge
  { id: "bunny", name: "Bunny.net", category: "CDN & edge", adapter: "statuspage", url: "https://status.bunny.net" },
  { id: "akamai", name: "Akamai", category: "CDN & edge", adapter: "statuspage", url: "https://www.akamaistatus.com" },
  { id: "cloudinary", name: "Cloudinary", category: "CDN & edge", adapter: "statuspage", url: "https://status.cloudinary.com" },
  { id: "mux", name: "Mux", category: "CDN & edge", adapter: "statuspage", url: "https://status.mux.com" },

  // Monitoring
  { id: "datadog", name: "Datadog", category: "Monitoring", adapter: "statuspage", url: "https://status.datadoghq.com" },
  { id: "grafana", name: "Grafana Cloud", category: "Monitoring", adapter: "statuspage", url: "https://status.grafana.com" },
  { id: "newrelic", name: "New Relic", category: "Monitoring", adapter: "statuspage", url: "https://status.newrelic.com" },
  { id: "honeycomb", name: "Honeycomb", category: "Monitoring", adapter: "statuspage", url: "https://status.honeycomb.io" },
  { id: "bugsnag", name: "Bugsnag", category: "Monitoring", adapter: "statuspage", url: "https://status.bugsnag.com" },
  { id: "rollbar", name: "Rollbar", category: "Monitoring", adapter: "statuspage", url: "https://status.rollbar.com" },
  { id: "launchdarkly", name: "LaunchDarkly", category: "Monitoring", adapter: "statuspage", url: "https://status.launchdarkly.com" },
  { id: "onepassword", name: "1Password", category: "Monitoring", adapter: "statuspage", url: "https://status.1password.com" },

  // Commerce & CMS
  { id: "shopify", name: "Shopify", category: "Commerce & CMS", adapter: "statuspage", url: "https://www.shopifystatus.com" },
  { id: "contentful", name: "Contentful", category: "Commerce & CMS", adapter: "statuspage", url: "https://www.contentfulstatus.com" },
  { id: "sanity", name: "Sanity", category: "Commerce & CMS", adapter: "statuspage", url: "https://status.sanity.io" },

  // Analytics
  { id: "amplitude", name: "Amplitude", category: "Analytics", adapter: "statuspage", url: "https://status.amplitude.com" },
  { id: "mixpanel", name: "Mixpanel", category: "Analytics", adapter: "statuspage", url: "https://www.mixpanelstatus.com" },
  { id: "segment", name: "Segment", category: "Analytics", adapter: "statuspage", url: "https://status.segment.com" },

  // Networking (grouped with cloud/infra).
  { id: "tailscale", name: "Tailscale", category: "Cloud & hosting", adapter: "statuspage", url: "https://status.tailscale.com" },

  // Social & community
  { id: "reddit", name: "Reddit", category: "Social & community", adapter: "statuspage", url: "https://www.redditstatus.com" },
  { id: "x", name: "X (Twitter)", category: "Social & community", adapter: "x", url: "https://docs.x.com/status.md", link: "https://docs.x.com/status" },
  { id: "pinterest", name: "Pinterest", category: "Social & community", adapter: "statuspage", url: "https://status.pinterest.com" },
  { id: "medium", name: "Medium", category: "Social & community", adapter: "statuspage", url: "https://medium.statuspage.io" },
  { id: "wikimedia", name: "Wikimedia", category: "Social & community", adapter: "statuspage", url: "https://www.wikimediastatus.net" },
  { id: "patreon", name: "Patreon", category: "Social & community", adapter: "statuspage", url: "https://status.patreon.com" },

  // Gaming & streaming
  { id: "twitch", name: "Twitch", category: "Gaming & streaming", adapter: "statuspage", url: "https://status.twitch.tv" },
  { id: "epicgames", name: "Epic Games", category: "Gaming & streaming", adapter: "statuspage", url: "https://status.epicgames.com" },

  // Finance & crypto
  { id: "robinhood", name: "Robinhood", category: "Finance & crypto", adapter: "statuspage", url: "https://status.robinhood.com" },
  { id: "kraken", name: "Kraken", category: "Finance & crypto", adapter: "statuspage", url: "https://status.kraken.com" },
  { id: "cashapp", name: "Cash App", category: "Finance & crypto", adapter: "statuspage", url: "https://status.cash.app" },
  { id: "wise", name: "Wise", category: "Finance & crypto", adapter: "statuspage", url: "https://status.wise.com" },

  // Consumer & lifestyle
  { id: "dropbox", name: "Dropbox", category: "Consumer & lifestyle", adapter: "statuspage", url: "https://status.dropbox.com" },
  { id: "doordash", name: "DoorDash", category: "Consumer & lifestyle", adapter: "statuspage", url: "https://www.doordashstatus.com" },
  { id: "grammarly", name: "Grammarly", category: "Consumer & lifestyle", adapter: "statuspage", url: "https://status.grammarly.com" },
  { id: "duolingo", name: "Duolingo", category: "Consumer & lifestyle", adapter: "statuspage", url: "https://status.duolingo.com" },
  { id: "proton", name: "Proton", category: "Consumer & lifestyle", adapter: "statuspage", url: "https://status.proton.me" },
  { id: "strava", name: "Strava", category: "Consumer & lifestyle", adapter: "statuspage", url: "https://status.strava.com" },

  // Widely-used services we were missing (probed live).
  { id: "postman", name: "Postman", category: "Dev & CI", adapter: "statuspage", url: "https://status.postman.com" },
  { id: "pypi", name: "PyPI", category: "Dev & CI", adapter: "statuspage", url: "https://status.python.org" },
  { id: "neon", name: "Neon", category: "Data & backend", adapter: "instatus", url: "https://neon.instatus.com" },
  { id: "hubspot", name: "HubSpot", category: "Collaboration", adapter: "statuspage", url: "https://status.hubspot.com" },
  { id: "docusign", name: "DocuSign", category: "Collaboration", adapter: "statuspage", url: "https://status.docusign.com" },
  { id: "box", name: "Box", category: "Collaboration", adapter: "statuspage", url: "https://status.box.com" },
  { id: "trello", name: "Trello", category: "Collaboration", adapter: "statuspage", url: "https://trello.status.atlassian.com" },
  { id: "squarespace", name: "Squarespace", category: "Commerce & CMS", adapter: "statuspage", url: "https://status.squarespace.com" },
  { id: "wix", name: "Wix", category: "Commerce & CMS", adapter: "statuspage", url: "https://status.wix.com" },
  { id: "klarna", name: "Klarna", category: "Finance & crypto", adapter: "statuspage", url: "https://status.klarna.com" },

  // Additional widely-used services (probed live).
  { id: "cursor", name: "Cursor", category: "AI & model providers", adapter: "statuspage", url: "https://status.cursor.com" },
  { id: "windsurf", name: "Windsurf", category: "AI & model providers", adapter: "statuspage", url: "https://status.windsurf.com" },
  { id: "lovable", name: "Lovable", category: "AI & model providers", adapter: "statuspage", url: "https://status.lovable.dev" },
  { id: "zapier", name: "Zapier", category: "Collaboration", adapter: "statuspage", url: "https://status.zapier.com" },
  { id: "typeform", name: "Typeform", category: "Collaboration", adapter: "statuspage", url: "https://status.typeform.com" },
  { id: "rippling", name: "Rippling", category: "Collaboration", adapter: "statuspage", url: "https://status.rippling.com" },
  { id: "retool", name: "Retool", category: "Dev & CI", adapter: "statuspage", url: "https://status.retool.com" },
  { id: "ngrok", name: "ngrok", category: "Dev & CI", adapter: "statuspage", url: "https://status.ngrok.com" },
  { id: "temporal", name: "Temporal", category: "Data & backend", adapter: "statuspage", url: "https://status.temporal.io" },
  { id: "livekit", name: "LiveKit", category: "Comms", adapter: "statuspage", url: "https://status.livekit.io" },
  { id: "brevo", name: "Brevo", category: "Comms", adapter: "statuspage", url: "https://status.brevo.com" },
  { id: "klaviyo", name: "Klaviyo", category: "Commerce & CMS", adapter: "statuspage", url: "https://status.klaviyo.com" },
  { id: "bigcommerce", name: "BigCommerce", category: "Commerce & CMS", adapter: "statuspage", url: "https://status.bigcommerce.com" },
  { id: "circle", name: "Circle", category: "Finance & crypto", adapter: "statuspage", url: "https://status.circle.com" },
  { id: "twingate", name: "Twingate", category: "Cloud & hosting", adapter: "statuspage", url: "https://status.twingate.com" },
];

/** INTERNAL polling-freshness set only — NOT a user-facing "essentials" list.
 *  These are polled every minute (~1-min freshness and alert latency); the rest
 *  rotates through shards (a full sweep about every 12-15 minutes). Never surfaced in onboarding: we don't
 *  decide what's essential to anyone. */
export const PRIORITY_IDS = new Set<string>([
  "aws", "gcp", "azure", "cloudflare", "vercel", "netlify", "github", "npm",
  "openai", "anthropic", "stripe", "slack", "discord", "twilio", "supabase", "mongodb",
]);

/** A short, neutral set of commonly-watched services offered as INDIVIDUAL
 *  quick-adds in onboarding (tap one at a time). Not a bulk "add all", not a
 *  blessed "essentials" — just a few suggestions to break the blank-page. The
 *  web board mirrors this list in app.js. */
export const POPULAR_IDS: string[] = [
  "cloudflare", "aws", "github", "vercel", "openai", "anthropic", "stripe", "slack",
];

/** Display order for the board, the directory, and the bot's onboarding picker.
 *  Ordered by how much people tend to care: cloud + AI lead. */
/** Short-URL / common-name aliases → canonical provider id. Lets /twitter and
 *  /status/twitter resolve to the X (Twitter) page (people still search "twitter"). */
export const ALIASES: Record<string, string> = {
  twitter: "x",
};

export const CATEGORY_ORDER: string[] = [
  "Cloud & hosting", "AI & model providers", "Dev & CI", "Data & backend",
  "Payments", "Comms", "CDN & edge", "Auth & identity", "Collaboration",
  "Monitoring", "Commerce & CMS", "Analytics",
  "Social & community", "Gaming & streaming", "Finance & crypto", "Consumer & lifestyle",
];

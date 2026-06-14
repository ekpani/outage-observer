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
 * Curated starter catalog. Most providers run Atlassian Statuspage, which
 * exposes /api/v2/summary.json. A few use Instatus (/summary.json). Adapter
 * tags are best-effort; confirm one with:
 *   curl -s https://status.openai.com/api/v2/summary.json | head
 */
export const CATALOG: Provider[] = [
  // Cloud & hosting
  { id: "cloudflare", name: "Cloudflare", category: "Cloud", adapter: "statuspage", url: "https://www.cloudflarestatus.com" },
  { id: "vercel", name: "Vercel", category: "Cloud", adapter: "statuspage", url: "https://www.vercel-status.com" },
  // Dev
  { id: "github", name: "GitHub", category: "Dev", adapter: "statuspage", url: "https://www.githubstatus.com" },
  { id: "npm", name: "npm", category: "Dev", adapter: "statuspage", url: "https://status.npmjs.org" },
  // Payments & comms
  { id: "stripe", name: "Stripe", category: "Payments", adapter: "statuspage", url: "https://status.stripe.com" },
  { id: "discord", name: "Discord", category: "Comms", adapter: "statuspage", url: "https://discordstatus.com" },
  // AI / model providers
  { id: "openai", name: "OpenAI", category: "AI", adapter: "statuspage", url: "https://status.openai.com" },
  { id: "anthropic", name: "Anthropic", category: "AI", adapter: "statuspage", url: "https://status.anthropic.com" },
  { id: "huggingface", name: "Hugging Face", category: "AI", adapter: "instatus", url: "https://status.huggingface.co" },
];

import { type ProviderStatus } from "./types";

/** Azure: the status RSS feed only lists ACTIVE issues (it clears resolved
 *  ones), so an empty feed means healthy. RSS carries no clean severity, so an
 *  active item maps conservatively to `degraded` with its title. */
export async function fetchAzure(url: string): Promise<ProviderStatus> {
  const res = await fetch(url, {
    headers: { "user-agent": "OutageObserver/0.1 (+https://outage.observer)" },
    cf: { cacheTtl: 30, cacheEverything: true },
  });
  if (!res.ok) return { level: "unknown", description: `HTTP ${res.status}`, incidents: [] };

  const xml = await res.text();
  const items = xml.match(/<item\b[\s\S]*?<\/item>/g) ?? [];
  if (items.length === 0) {
    return { level: "operational", description: "No active Azure issues", incidents: [] };
  }

  const titleMatch = (items[0] ?? "").match(/<title>([\s\S]*?)<\/title>/);
  const name = (titleMatch?.[1] ?? "Active issue")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .trim();
  return {
    level: "degraded",
    description: name,
    incidents: [{ name, impact: "active", status: "active", url: "https://status.azure.com" }],
  };
}

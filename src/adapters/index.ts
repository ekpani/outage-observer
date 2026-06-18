import type { Provider } from "../catalog";
import type { ProviderStatus } from "./types";
import { fetchStatuspage } from "./statuspage";
import { fetchInstatus } from "./instatus";
import { fetchSlack } from "./slack";
import { fetchHeroku } from "./heroku";
import { fetchGcp } from "./gcp";
import { fetchAws } from "./aws";
import { fetchAzure } from "./azure";
import { fetchX } from "./x";

export type { Level, Incident, ProviderStatus } from "./types";
export { SEVERITY } from "./types";

/** Dispatch to the right adapter for a provider. */
export function fetchStatus(provider: Provider): Promise<ProviderStatus> {
  switch (provider.adapter) {
    case "statuspage":
      return fetchStatuspage(provider.url);
    case "instatus":
      return fetchInstatus(provider.url);
    case "slack":
      return fetchSlack(provider.url);
    case "heroku":
      return fetchHeroku(provider.url);
    case "gcp":
      return fetchGcp(provider.url);
    case "aws":
      return fetchAws(provider.url);
    case "azure":
      return fetchAzure(provider.url);
    case "x":
      return fetchX(provider.url);
  }
}

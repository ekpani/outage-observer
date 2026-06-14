import type { Provider } from "../catalog";
import type { ProviderStatus } from "./types";
import { fetchStatuspage } from "./statuspage";
import { fetchInstatus } from "./instatus";

export type { Level, Incident, ProviderStatus } from "./types";
export { SEVERITY } from "./types";

/** Dispatch to the right adapter for a provider. */
export function fetchStatus(provider: Provider): Promise<ProviderStatus> {
  switch (provider.adapter) {
    case "statuspage":
      return fetchStatuspage(provider.url);
    case "instatus":
      return fetchInstatus(provider.url);
  }
}

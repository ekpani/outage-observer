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

/** Dispatch to the right adapter, then normalize. An operational provider has no
 *  current incident by definition; some feeds briefly keep a just-resolved
 *  incident in their active list, which would make a recovery show outage text
 *  ("X recovered" + the resolved incident) on the board, alerts, and the Mac
 *  app. Drop incidents whenever the level is operational so that can't happen. */
export async function fetchStatus(provider: Provider): Promise<ProviderStatus> {
  const status = await dispatch(provider);
  return status.level === "operational" && status.incidents.length
    ? { ...status, incidents: [] }
    : status;
}

function dispatch(provider: Provider): Promise<ProviderStatus> {
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

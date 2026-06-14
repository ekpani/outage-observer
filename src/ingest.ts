import { CATALOG } from "./catalog";
import { fetchStatus } from "./adapters";
import { applyResults } from "./poller";
import { type Env } from "./telegram";

export async function handleIngest(env: Env, providerId: string): Promise<Response> {
  const provider = CATALOG.find((p) => p.id === providerId);
  if (!provider) return new Response("unknown provider", { status: 404 });
  const status = await fetchStatus(provider);
  await applyResults(env, new Map([[provider.id, status]]));
  return new Response("ok");
}

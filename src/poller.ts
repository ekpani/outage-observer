import { CATALOG, PRIORITY_IDS, type Provider } from "./catalog";
import { fetchStatus, SEVERITY, type Level, type ProviderStatus } from "./adapters";
import { getBoard, setBoard, enqueueNotification, drainOutbox, recordHistory, setCheckedAt, type Board, type BoardEntry } from "./store";
import { type Env } from "./telegram";
import { EMOJI, LABEL } from "./labels";

interface Transition {
  id: string;
  name: string;
  from: Level;
  to: Level;
  status: ProviderStatus;
}

function toEntry(provider: Provider, status: ProviderStatus): BoardEntry {
  const entry: BoardEntry = {
    id: provider.id,
    name: provider.name,
    category: provider.category,
    level: status.level,
    description: status.description,
    home: provider.link ?? provider.url,
  };
  const top = status.incidents[0];
  if (top) entry.incident = { name: top.name, url: top.url };
  return entry;
}

// Free tier allows 50 subrequests per invocation. Each tick polls the priority
// providers (every minute) plus one rotating shard of the rest, keeping the
// total well under 50 with headroom for KV ops + Telegram sends.
const REST_SHARD_TARGET = 15;

/** Poll the priority set plus one shard of the remaining catalog. `nowMs`
 *  selects the shard. Returns the number of transitions detected. */
export async function poll(env: Env, nowMs: number): Promise<number> {
  const priority = CATALOG.filter((p) => PRIORITY_IDS.has(p.id));
  const rest = CATALOG.filter((p) => !PRIORITY_IDS.has(p.id));
  const numShards = Math.max(1, Math.ceil(rest.length / REST_SHARD_TARGET));
  const shardIndex = Math.floor(nowMs / 60000) % numShards;
  const toPoll = [...priority, ...rest.filter((_, i) => i % numShards === shardIndex)];

  const fetched = new Map<string, ProviderStatus>();
  await Promise.all(
    toPoll.map(async (provider) => {
      try {
        fetched.set(provider.id, await fetchStatus(provider));
      } catch {
        /* leave unfetched; the previous board entry is kept */
      }
    }),
  );

  const transitions = await applyResults(env, fetched);
  await setCheckedAt(env, nowMs);
  return transitions;
}

/**
 * SHARED SEAM. Merge a batch of freshly-fetched provider statuses into the
 * persisted board (keeping every other provider's last-known entry), write the
 * board when it changes, and alert subscribers on any transition. Used by both
 * the cron poll (a shard's worth) and the push-webhook ingest path (one
 * provider). Returns the number of transitions.
 *
 * Keep this signature stable — the ingest path depends on it.
 */
export async function applyResults(
  env: Env,
  fetched: Map<string, ProviderStatus>,
): Promise<number> {
  const prev = await getBoard(env);
  const prevById = new Map((prev?.providers ?? []).map((e) => [e.id, e] as const));

  const entries: BoardEntry[] = [];
  const transitions: Transition[] = [];

  for (const provider of CATALOG) {
    const prevEntry = prevById.get(provider.id);
    const status = fetched.get(provider.id);

    // Not in this batch, or a failed fetch: keep the last known entry.
    if (!status || status.level === "unknown") {
      entries.push(prevEntry ?? toEntry(provider, { level: "unknown", description: "", incidents: [] }));
      continue;
    }

    entries.push(toEntry(provider, status));
    if (prevEntry && prevEntry.level !== "unknown" && prevEntry.level !== status.level) {
      transitions.push({ id: provider.id, name: provider.name, from: prevEntry.level, to: status.level, status });
    }
  }

  if (!prev || JSON.stringify(entries) !== JSON.stringify(prev.providers)) {
    await setBoard(env, { updatedAt: new Date().toISOString(), providers: entries });
  }

  // Fan out via the durable outbox. For each transition, look up exactly the
  // subscribers watching that provider (one indexed D1 query) and enqueue a
  // message per subscriber. Enqueuing is cheap (DB writes, not subrequests), so
  // even a wide outage can't blow the budget here.
  for (const t of transitions) {
    await recordHistory(env, t.id, t.to);
    const { results } = await env.DB
      .prepare("SELECT chat_id FROM subscriptions WHERE provider_id = ?")
      .bind(t.id)
      .all<{ chat_id: number }>();
    const text = formatAlert(t.name, t.from, t.to, t.status);
    for (const row of results) {
      await enqueueNotification(env, row.chat_id, text);
    }
  }

  // Drain a bounded batch of queued messages every invocation — including ticks
  // with no transitions — so any backlog flushes over subsequent cron ticks
  // (cron runs every minute). The cap keeps sends within the shared
  // 50-subrequest budget alongside the ~31 status fetches in this poll.
  await drainOutbox(env, 10);

  return transitions.length;
}

export function formatAlert(
  name: string,
  from: Level,
  to: Level,
  status: ProviderStatus,
): string {
  const recovered = to === "operational" && SEVERITY[to] < SEVERITY[from];
  const lines: string[] = [];

  lines.push(
    recovered
      ? `${EMOJI[to]} <b>${escapeHtml(name)}</b> recovered`
      : `${EMOJI[to]} <b>${escapeHtml(name)}</b>: ${LABEL[to]}`,
  );

  const incident = status.incidents[0];
  if (incident) {
    lines.push(`<i>${escapeHtml(incident.name)}</i>`);
    if (incident.url) lines.push(incident.url);
  } else if (status.description) {
    lines.push(escapeHtml(status.description));
  }

  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

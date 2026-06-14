import { CATALOG, type Provider } from "./catalog";
import { fetchStatus, SEVERITY, type Level, type ProviderStatus } from "./adapters";
import { getBoard, setBoard, getSubscribers, type Board, type BoardEntry } from "./store";
import { sendMessage, type Env } from "./telegram";
import { EMOJI, LABEL } from "./labels";

interface Transition {
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

// Free tier allows 50 subrequests per invocation. Poll a time-based shard of
// the catalog each minute so a tick stays well under that (with headroom for
// KV ops + Telegram sends). Each provider is refreshed every NUM_SHARDS minutes.
const SHARD_TARGET = 30;

/** Poll one shard of the catalog, merge into the persisted board (kept whole),
 *  and alert subscribers on any transition. `nowMs` picks the shard. Returns
 *  the number of transitions detected. */
export async function poll(env: Env, nowMs: number): Promise<number> {
  const numShards = Math.max(1, Math.ceil(CATALOG.length / SHARD_TARGET));
  const shardIndex = Math.floor(nowMs / 60000) % numShards;

  const fetched = new Map<string, ProviderStatus>();
  await Promise.all(
    CATALOG.filter((_, i) => i % numShards === shardIndex).map(async (provider) => {
      try {
        fetched.set(provider.id, await fetchStatus(provider));
      } catch {
        /* leave unfetched; the previous board entry is kept below */
      }
    }),
  );

  const prev = await getBoard(env);
  const prevById = new Map((prev?.providers ?? []).map((e) => [e.id, e] as const));

  const entries: BoardEntry[] = [];
  const transitions: Transition[] = [];

  for (const provider of CATALOG) {
    const prevEntry = prevById.get(provider.id);
    const status = fetched.get(provider.id);

    // Not polled this tick, or the fetch failed: keep the last known entry.
    if (!status || status.level === "unknown") {
      entries.push(prevEntry ?? toEntry(provider, { level: "unknown", description: "", incidents: [] }));
      continue;
    }

    entries.push(toEntry(provider, status));
    if (prevEntry && prevEntry.level !== "unknown" && prevEntry.level !== status.level) {
      transitions.push({ name: provider.name, from: prevEntry.level, to: status.level, status });
    }
  }

  // Write the board only when its contents change (KV write-budget friendly).
  if (!prev || JSON.stringify(entries) !== JSON.stringify(prev.providers)) {
    const board: Board = { updatedAt: new Date().toISOString(), providers: entries };
    await setBoard(env, board);
  }

  if (transitions.length === 0) return 0;

  const subscribers = await getSubscribers(env);
  for (const t of transitions) {
    const text = formatAlert(t.name, t.from, t.to, t.status);
    for (const chatId of subscribers) {
      await sendMessage(env, chatId, text);
    }
  }
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

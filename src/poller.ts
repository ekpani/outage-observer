import { CATALOG, PRIORITY_IDS, type Provider } from "./catalog";
import { fetchStatus, SEVERITY, type Level, type ProviderStatus } from "./adapters";
import { getBoard, setBoard, getUsers, getWatch, type Board, type BoardEntry } from "./store";
import { sendMessage, type Env } from "./telegram";
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

/** Poll the priority set plus one shard of the remaining catalog, merge into
 *  the persisted board (kept whole), and alert subscribers on any transition.
 *  `nowMs` selects the shard. Returns the number of transitions detected. */
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
      transitions.push({ id: provider.id, name: provider.name, from: prevEntry.level, to: status.level, status });
    }
  }

  // Write the board only when its contents change (KV write-budget friendly).
  if (!prev || JSON.stringify(entries) !== JSON.stringify(prev.providers)) {
    const board: Board = { updatedAt: new Date().toISOString(), providers: entries };
    await setBoard(env, board);
  }

  if (transitions.length === 0) return 0;

  const users = await getUsers(env);
  const watchByUser = new Map<number, Set<string>>();
  for (const u of users) watchByUser.set(u, new Set(await getWatch(env, u)));

  // Fan out only to users watching the changed provider. The send budget keeps
  // the invocation under the free-tier 50-subrequest cap; this only bites during
  // a transition with many subscribers, at which point a Queue is the real fix.
  const MAX_SENDS = 40;
  let sent = 0;
  for (const t of transitions) {
    const text = formatAlert(t.name, t.from, t.to, t.status);
    for (const u of users) {
      if (!watchByUser.get(u)?.has(t.id)) continue;
      if (sent >= MAX_SENDS) {
        console.warn("fan-out capped at MAX_SENDS", { sent });
        return transitions.length;
      }
      await sendMessage(env, u, text);
      sent++;
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

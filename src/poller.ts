import { CATALOG, PRIORITY_IDS, type Provider } from "./catalog";
import { fetchStatus, SEVERITY, type Level, type ProviderStatus } from "./adapters";
import { getBoard, setBoard, setCheckedAt, drainOutbox, drainTargetOutbox, getProviderStates, commitProviderStates, getSubscribersForProviders, getTargetsForProviders, recordHistoryBatch, enqueueNotificationsBatch, enqueueTargetEventsBatch, type BoardEntry } from "./store";
import { type AlertEvent } from "./channels";
import { type Env } from "./telegram";
import { EMOJI, LABEL } from "./labels";
import { regionLabel, shouldAlert } from "./regions";

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
  if (top) {
    // An open incident on an operational provider is an ongoing note (e.g. a
    // contained suspension under a green headline), not a current outage.
    if (status.level === "operational") entry.ongoing = top.name;
    else entry.incident = { name: top.name, url: top.url };
  }
  if (status.regions?.length) entry.regions = status.regions;
  return entry;
}

// Free tier allows 50 subrequests per invocation (KV/D1/fetch all count). Each
// tick polls the 16 priority providers (every minute) plus one rotating shard of
// the rest, so fetches stay bounded as the catalog grows. Worst-case budget for
// one tick: 16 priority + ~10 shard fetches (26) + board/state/fan-out KV+D1
// (~10) + drains (drainOutbox 6 -> 8, drainTargetOutbox 4 -> 6) = ~50, and the
// drains are guarded (see applyResults) so a rare overrun can never discard the
// already-committed transitions or stall checkedAt — undrained rows just flush
// next tick. Keep this sum under 50 when changing the shard or drain budgets.
const REST_SHARD_TARGET = 10;

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
 * SHARED SEAM. Used by both the cron poll (a shard's worth) and the push-webhook
 * ingest path (one provider). Returns the number of confirmed transitions.
 *
 * Transition detection runs against the authoritative D1 `provider_state` table
 * via an atomic compare-and-set, NOT the KV board — so cron and ingest race
 * safely (whoever flips a provider's row wins; the loser is skipped, so no
 * double- or lost-alert). The KV board is rebuilt here for /api/status display
 * only. Fan-out is batched and bounded, so a wide outage with many subscribers
 * can never exhaust the 50-subrequest budget.
 *
 * Keep this signature stable — the ingest path depends on it.
 */
export async function applyResults(
  env: Env,
  fetched: Map<string, ProviderStatus>,
): Promise<number> {
  const byId = new Map(CATALOG.map((p) => [p.id, p] as const));

  // 1) Display board (KV): keep every other provider's last-known entry. Purely
  //    for /api/status rendering now — alerts no longer depend on it.
  const prev = await getBoard(env);
  const prevById = new Map((prev?.providers ?? []).map((e) => [e.id, e] as const));
  const entries: BoardEntry[] = CATALOG.map((provider) => {
    const status = fetched.get(provider.id);
    return !status || status.level === "unknown"
      ? (prevById.get(provider.id) ?? toEntry(provider, { level: "unknown", description: "", incidents: [] }))
      : toEntry(provider, status);
  });

  // 2) Transition candidates vs authoritative D1 state. First sighting seeds a
  //    baseline (no alert); a real level change is a CAS candidate. A failed
  //    fetch (`unknown`) never touches state → never alert to/from unknown.
  const states = await getProviderStates(env);
  const baselines: { id: string; level: Level }[] = [];
  const candidates: Transition[] = [];
  for (const [id, status] of fetched) {
    if (status.level === "unknown") continue;
    const prevLevel = states.get(id);
    if (prevLevel === undefined) {
      baselines.push({ id, level: status.level });
    } else if (prevLevel !== status.level) {
      candidates.push({ id, name: byId.get(id)?.name ?? id, from: prevLevel, to: status.level, status });
    }
  }

  // 3) Commit atomically; only CAS winners alert (race-safe against ingest).
  const confirmedIds = await commitProviderStates(env, candidates, baselines);
  const confirmed = candidates.filter((c) => confirmedIds.has(c.id));

  // 4) Write the display board (best-effort; not the alert source of truth).
  if (!prev || JSON.stringify(entries) !== JSON.stringify(prev.providers)) {
    await setBoard(env, { updatedAt: new Date().toISOString(), providers: entries });
  }

  // 5) Bounded, batched fan-out — but a return to operational while an incident
  //    is still OPEN is an ongoing situation, not a recovery (the provider kept
  //    its headline green during a contained incident). Commit the state above,
  //    just don't alert "recovered" for it.
  const alertable = confirmed.filter((c) => !(c.to === "operational" && c.status.incidents.length > 0));
  if (alertable.length) await fanOut(env, alertable);

  // 6) Drain bounded batches every tick so any backlog flushes over subsequent
  //    ticks. Guarded: the essential work above (state CAS, board, enqueue) is
  //    already committed, so if delivery ever hits the subrequest ceiling during
  //    a heavy incident we swallow it and let the remaining rows flush next tick
  //    rather than throwing away this tick's confirmed transitions.
  try {
    await drainOutbox(env, 6);
    await drainTargetOutbox(env, 4);
  } catch (err) {
    console.warn("drain deferred to next tick", String(err));
  }

  return confirmed.length;
}

/** Fan out a set of confirmed transitions: one IN-query + one batched enqueue
 *  per channel, so cost is a handful of subrequests no matter the outage size. */
async function fanOut(env: Env, transitions: Transition[]): Promise<void> {
  const ids = transitions.map((t) => t.id);
  await recordHistoryBatch(env, transitions.map((t) => ({ id: t.id, level: t.to })));

  // Telegram subscribers — region-filtered (fail-safe: empty prefs or a
  // global/unknown-scope incident always alerts).
  const subs = await getSubscribersForProviders(env, ids);
  const notifRows: { chatId: number; text: string }[] = [];
  for (const t of transitions) {
    const regions = t.status.regions ?? [];
    const text = formatAlert(t.name, t.from, t.to, t.status);
    for (const s of subs.get(t.id) ?? []) {
      if (shouldAlert(s.prefs, regions)) notifRows.push({ chatId: s.chatId, text });
    }
  }
  await enqueueNotificationsBatch(env, notifRows);

  // Non-Telegram targets (web push, Slack/Discord) — same region filter.
  const targetsByProvider = await getTargetsForProviders(env, ids);
  const homeById = new Map(CATALOG.map((p) => [p.id, p.link ?? p.url] as const));
  const eventRows: { targetId: number; payload: string }[] = [];
  for (const t of transitions) {
    const regions = t.status.regions ?? [];
    const targets = targetsByProvider.get(t.id);
    if (!targets?.length) continue;
    const event: AlertEvent = {
      id: t.id, name: t.name, level: t.to, from: t.from,
      url: homeById.get(t.id) ?? "https://outage.observer/",
      incident: t.status.incidents[0]?.name,
      regions,
    };
    const payload = JSON.stringify(event);
    for (const target of targets) {
      if (shouldAlert(target.prefs, regions)) eventRows.push({ targetId: target.id, payload });
    }
  }
  await enqueueTargetEventsBatch(env, eventRows);
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

  // Scope note when the incident is region-specific (not global/unknown).
  const regions = status.regions ?? [];
  if (regions.length && !regions.includes("global")) {
    lines.push(`<i>Regions: ${escapeHtml(regionLabel(regions))}</i>`);
  }

  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

import { CATALOG } from "./catalog";
import { fetchStatus, SEVERITY, type Level, type ProviderStatus } from "./adapters";
import { getLastLevel, setLastLevel, getSubscribers } from "./store";
import { sendMessage, type Env } from "./telegram";

const EMOJI: Record<Level, string> = {
  operational: "🟢",
  maintenance: "🔧",
  degraded: "🟡",
  partial_outage: "🟠",
  major_outage: "🔴",
  unknown: "⚪️",
};

const LABEL: Record<Level, string> = {
  operational: "Operational",
  maintenance: "Maintenance",
  degraded: "Degraded",
  partial_outage: "Partial outage",
  major_outage: "Major outage",
  unknown: "Unknown",
};

interface Transition {
  name: string;
  from: Level;
  to: Level;
  status: ProviderStatus;
}

/** Poll every provider, alert subscribers on any state change. Returns the
 *  number of transitions detected this run. */
export async function pollAll(env: Env): Promise<number> {
  const results = await Promise.allSettled(
    CATALOG.map(async (provider) => ({
      provider,
      status: await fetchStatus(provider),
    })),
  );

  const transitions: Transition[] = [];

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { provider, status } = result.value;
    // Never alert on (or persist) a failed fetch; keep the last good level.
    if (status.level === "unknown") continue;

    const prev = await getLastLevel(env, provider.id);
    if (prev && prev !== status.level) {
      transitions.push({ name: provider.name, from: prev, to: status.level, status });
    }
    await setLastLevel(env, provider.id, status.level);
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

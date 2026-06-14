import type { Level } from "./adapters";

export const EMOJI: Record<Level, string> = {
  operational: "🟢",
  maintenance: "🔧",
  degraded: "🟡",
  partial_outage: "🟠",
  major_outage: "🔴",
  unknown: "⚪️",
};

export const LABEL: Record<Level, string> = {
  operational: "Operational",
  maintenance: "Maintenance",
  degraded: "Degraded",
  partial_outage: "Partial outage",
  major_outage: "Major outage",
  unknown: "Unknown",
};

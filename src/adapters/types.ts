export type Level =
  | "operational"
  | "maintenance"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "unknown";

/** Higher = worse. Used for transition detection and severity thresholds. */
export const SEVERITY: Record<Level, number> = {
  unknown: -1,
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
};

export interface Incident {
  name: string;
  impact: string;
  status: string;
  url?: string;
}

export interface ProviderStatus {
  level: Level;
  description: string;
  incidents: Incident[];
}

// Providers people search for ("is Netflix down?") that Outage Observer
// deliberately does NOT track live, because they publish no official,
// machine-readable status feed. Reporting a guess — or worse, an unattended
// status page stuck on a demo template — would risk a false "all good" during a
// real outage, which is worse than no coverage. Instead we answer the query
// honestly and point to where the provider actually announces incidents.
//
// Pointers never enter CATALOG: they are never polled, never diffed, never
// counted in the live provider total, and can never raise an alert.
export interface Pointer {
  id: string;
  name: string;
  category: string;
  /** Where the provider actually communicates outages (official). */
  link: string;
  /** Human label for that destination. */
  linkLabel: string;
  /** One honest sentence on why there's no live feed. */
  note: string;
  /** Optional opt-in embed of the provider's outage channel. Loaded only on a
   *  click (never on page load), so no third-party SDK runs for visitors who
   *  don't ask for it — keeping our "no third-party SDKs by default" promise. */
  embed?: { kind: "x"; handle: string };
}

export const POINTERS: Pointer[] = [
  {
    id: "spotify",
    name: "Spotify",
    category: "Gaming & streaming",
    link: "https://x.com/SpotifyStatus",
    linkLabel: "@SpotifyStatus on X",
    note: "Spotify doesn't publish a machine-readable status page; it posts outage updates on X.",
    embed: { kind: "x", handle: "SpotifyStatus" },
  },
  {
    id: "netflix",
    name: "Netflix",
    category: "Gaming & streaming",
    link: "https://help.netflix.com/en/is-netflix-down",
    linkLabel: "Netflix Help Center",
    note: "Netflix has no public status feed; its Help Center runs a live “is Netflix down?” check instead.",
  },
];

export const POINTER_BY_ID = new Map(POINTERS.map((p) => [p.id, p] as const));
export const POINTER_IDS = new Set(POINTERS.map((p) => p.id));

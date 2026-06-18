// Competitor data for the public /compare pages. This is the ONE place we name
// competitors (a deliberate, public marketing surface) — kept out of the rest of
// the code by design. Tone: honest and fair. We credit where they're genuinely
// stronger and only claim differences that are true, so the comparison earns
// trust instead of reading as a hit piece. Facts reviewed 2026-06-18.

export interface CompareRow {
  label: string;
  oo: string;
  them: string;
}

export interface Competitor {
  slug: string;            // /compare/<slug>
  name: string;
  /** One-line "what they are". */
  what: string;
  /** Their site (linked nofollow). */
  site: string;
  /** A fair, scannable at-a-glance table (Outage Observer vs them). */
  table: CompareRow[];
  /** Where they are genuinely stronger — stated plainly. */
  theyAreStronger: string[];
  /** Where Outage Observer is different. */
  weAreDifferent: string[];
  chooseThem: string;
  chooseUs: string;
}

export const COMPETITORS: Competitor[] = [
  {
    slug: "statusgator",
    name: "StatusGator",
    what: "a status-page aggregator that also hosts status pages and runs its own uptime checks, aimed at teams and enterprises",
    site: "https://statusgator.com",
    table: [
      { label: "Price", oo: "Free", them: "Paid (free trial)" },
      { label: "Account", oo: "None — nothing to sign up for", them: "Required" },
      { label: "Services watched", oo: "150 curated, hand-picked", them: "8,800+" },
      { label: "Signal source", oo: "Official status feeds only", them: "Official feeds plus its own synthetic 'early warning' checks" },
      { label: "Where alerts go", oo: "Web, Telegram, Slack, Discord, browser push, RSS, native Mac app, installable web app", them: "Email, SMS, Slack, Teams, Discord, PagerDuty, Opsgenie and more" },
      { label: "Hosts your own status page", oo: "No (not what we do)", them: "Yes" },
      { label: "Monitors your own site", oo: "No — we watch the services you depend on", them: "Yes" },
      { label: "Privacy", oo: "No accounts, no tracking; your list stays on your device", them: "Standard SaaS account + analytics" },
    ],
    theyAreStronger: [
      "Far broader coverage — 8,800+ services, including long-tail vendors we don't track.",
      "Team and enterprise features: roles, SSO, history and uptime analytics, and integrations like PagerDuty and Opsgenie.",
      "It's three tools in one — aggregation, your own hosted status page, and uptime monitoring of your endpoints.",
    ],
    weAreDifferent: [
      "Free, with no account or signup. StatusGator is a paid product after the trial.",
      "Official status feeds only. We report what each provider publishes and never synthesize or guess, so you don't get false alarms.",
      "Alerts wherever you already are, all free — including a native Mac app and an installable web app, not just an email dashboard.",
      "Privacy-first: no accounts, no tracking, your watch list stays on your device.",
      "One focused job, nothing to learn: tell you the moment a service you depend on breaks.",
    ],
    chooseThem: "Choose StatusGator if you're a team that needs thousands of niche vendors, enterprise integrations and SSO, or wants to host its own status page in the same tool.",
    chooseUs: "Choose Outage Observer if you want a free, no-signup way to watch the services you actually depend on, with honest official-source alerts and zero false alarms.",
  },
  {
    slug: "isdown",
    name: "IsDown",
    what: "a status-page aggregator for teams, with its own hosted status pages and endpoint monitoring",
    site: "https://isdown.app",
    table: [
      { label: "Price", oo: "Free", them: "Paid (14-day trial)" },
      { label: "Account", oo: "None — nothing to sign up for", them: "Required" },
      { label: "Services watched", oo: "150 curated, hand-picked", them: "6,320+" },
      { label: "Signal source", oo: "Official status feeds only", them: "Official feeds plus crowdsourced reports" },
      { label: "Where alerts go", oo: "Web, Telegram, Slack, Discord, browser push, RSS, native Mac app, installable web app", them: "Slack, Teams, Discord, PagerDuty, Datadog, webhooks, email, SMS" },
      { label: "Hosts your own status page", oo: "No (not what we do)", them: "Yes" },
      { label: "Monitors your own site", oo: "No — we watch the services you depend on", them: "Yes" },
      { label: "Privacy", oo: "No accounts, no tracking; your list stays on your device", them: "Standard SaaS account + analytics" },
    ],
    theyAreStronger: [
      "Broader coverage — 6,320+ vendors.",
      "Team features and integrations like Datadog and PagerDuty, plus granular alert filtering by component and severity.",
      "Hosts your own status pages and can monitor your own endpoints.",
    ],
    weAreDifferent: [
      "Free, with no account. IsDown is paid after a 14-day trial.",
      "Official feeds only — no crowdsourced signals. IsDown blends official and crowdsourced data; we don't, so a wave of user reports never triggers a false “down”.",
      "Channels you already use, free: Telegram, Slack, Discord, browser push, RSS, a native Mac app, and an installable web app.",
      "Privacy-first: no accounts, no tracking, your watch list stays on your device.",
    ],
    chooseThem: "Choose IsDown if you're a team that needs more vendors, enterprise integrations, or to host your own status page.",
    chooseUs: "Choose Outage Observer if you want free, no-signup, official-source-only alerts for the services you depend on.",
  },
];

export const COMPARE_BY_SLUG = new Map(COMPETITORS.map((c) => [c.slug, c] as const));

/** Outage Observer's genuine edge, for the /compare hub. */
export const OO_EDGE: { title: string; body: string }[] = [
  { title: "Free, no account", body: "The whole thing is free with nothing to sign up for. The closest tools are paid products after a trial and require an account." },
  { title: "Official feeds only", body: "We read each provider's official status and report exactly that — never synthetic checks or crowd reports — so you never get a false alarm." },
  { title: "Wherever you already are", body: "Web board, Telegram, Slack, Discord, browser push, RSS, a native Mac app, and an installable web app. Not just an email dashboard." },
  { title: "Private by default", body: "No accounts, no tracking, no third-party SDKs. Your watch list lives on your device, not our servers." },
  { title: "One focused job", body: "We tell you the moment a service you depend on breaks. We don't host your status page or monitor your own site, so there's nothing to set up." },
];

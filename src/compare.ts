// Competitor data for the public /compare pages. This is the ONE place we name
// competitors (a deliberate, public marketing surface) — kept out of the rest of
// the code by design. Tone: honest and fair. We credit where they're genuinely
// stronger and only claim differences that are true, so the comparison earns
// trust instead of reading as a hit piece. Facts reviewed 2026-06-18.
//
// `category` drives the framing:
//   aggregator / crowd  -> Outage Observer is a real alternative (head-to-head).
//   monitor / statuspage -> a DIFFERENT job; we say so plainly and explain when
//                           you'd want each (often both).

export type CompareCategory = "aggregator" | "crowd" | "monitor" | "statuspage";

export interface CompareRow {
  label: string;
  oo: string;
  them: string;
}

export interface Competitor {
  slug: string;
  name: string;
  category: CompareCategory;
  /** One-line "what they are". */
  what: string;
  site: string;
  table: CompareRow[];
  theyAreStronger: string[];
  weAreDifferent: string[];
  chooseThem: string;
  chooseUs: string;
}

const ALERTS_OO = "Web, Telegram, Slack, Discord, browser push, RSS, native Mac app, installable web app";
const PRIV_OO = "No accounts, no tracking; your list stays on your device";
const PRIV_THEM = "Standard SaaS account + analytics";

export const COMPETITORS: Competitor[] = [
  {
    slug: "statusgator", name: "StatusGator", category: "aggregator",
    what: "a status-page aggregator that also hosts status pages and runs its own uptime checks, aimed at teams and enterprises",
    site: "https://statusgator.com",
    table: [
      { label: "Price", oo: "Free", them: "Paid (free trial)" },
      { label: "Account", oo: "None — nothing to sign up for", them: "Required" },
      { label: "Services watched", oo: "150 curated, hand-picked", them: "8,800+" },
      { label: "Signal source", oo: "Official status feeds only", them: "Official feeds plus its own synthetic 'early warning' checks" },
      { label: "Where alerts go", oo: ALERTS_OO, them: "Email, SMS, Slack, Teams, Discord, PagerDuty, Opsgenie and more" },
      { label: "Hosts your own status page", oo: "No (not what we do)", them: "Yes" },
      { label: "Privacy", oo: PRIV_OO, them: PRIV_THEM },
    ],
    theyAreStronger: [
      "Far broader coverage — 8,800+ services, including long-tail vendors we don't track.",
      "Team and enterprise features: roles, SSO, history and uptime analytics, and integrations like PagerDuty and Opsgenie.",
      "Three tools in one — aggregation, your own hosted status page, and uptime monitoring of your endpoints.",
    ],
    weAreDifferent: [
      "Free, with no account or signup. StatusGator is a paid product after the trial.",
      "Official status feeds only. We report what each provider publishes and never synthesize or guess, so you don't get false alarms.",
      "Alerts wherever you already are, all free — including a native Mac app and an installable web app, not just an email dashboard.",
      "Privacy-first: no accounts, no tracking, your watch list stays on your device.",
    ],
    chooseThem: "Choose StatusGator if you're a team that needs thousands of niche vendors, enterprise integrations and SSO, or wants to host its own status page in the same tool.",
    chooseUs: "Choose Outage Observer if you want a free, no-signup way to watch the services you actually depend on, with honest official-source alerts and zero false alarms.",
  },
  {
    slug: "isdown", name: "IsDown", category: "aggregator",
    what: "a status-page aggregator for teams, with its own hosted status pages and endpoint monitoring",
    site: "https://isdown.app",
    table: [
      { label: "Price", oo: "Free", them: "Paid (14-day trial)" },
      { label: "Account", oo: "None — nothing to sign up for", them: "Required" },
      { label: "Services watched", oo: "150 curated, hand-picked", them: "6,320+" },
      { label: "Signal source", oo: "Official status feeds only", them: "Official feeds plus crowdsourced reports" },
      { label: "Where alerts go", oo: ALERTS_OO, them: "Slack, Teams, Discord, PagerDuty, Datadog, webhooks, email, SMS" },
      { label: "Hosts your own status page", oo: "No (not what we do)", them: "Yes" },
      { label: "Privacy", oo: PRIV_OO, them: PRIV_THEM },
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
  {
    slug: "downdetector", name: "Downdetector", category: "crowd",
    what: "a crowd-sourced outage tracker built mostly from user reports",
    site: "https://downdetector.com",
    table: [
      { label: "Price", oo: "Free", them: "Free, ad-supported" },
      { label: "Account", oo: "None", them: "None" },
      { label: "Signal source", oo: "Official status feeds only", them: "User reports (crowdsourced)" },
      { label: "Built for", oo: "The infra & AI services your product depends on", them: "Mostly consumer apps and brands" },
      { label: "Where alerts go", oo: ALERTS_OO, them: "Mainly the website; limited alerting" },
      { label: "Ads / tracking", oo: "None", them: "Ad-supported" },
    ],
    theyAreStronger: [
      "Can surface a consumer-app problem before any official status page admits it — a spike in reports is an early human signal.",
      "Covers thousands of consumer brands people search for.",
      "Free and familiar.",
    ],
    weAreDifferent: [
      "Official status feeds only. A spike in user reports is not a confirmed outage; we report what the provider officially says, so you don't act on a false signal.",
      "Built for the infrastructure and AI services your stack runs on, with real alerts (Telegram, Slack, Discord, push, RSS, Mac app) instead of a page to refresh.",
      "No ads, no tracking.",
    ],
    chooseThem: "Use Downdetector to gauge whether lots of people are reporting issues with a consumer app right now.",
    chooseUs: "Use Outage Observer for authoritative, official-source alerts on the infrastructure and AI services you depend on.",
  },
  {
    slug: "uptimerobot", name: "UptimeRobot", category: "monitor",
    what: "an uptime monitor that checks whether your own websites, APIs and servers are up",
    site: "https://uptimerobot.com",
    table: [
      { label: "What it watches", oo: "The third-party services you depend on (their official status)", them: "Your own URLs, pings, ports and cron jobs" },
      { label: "Price", oo: "Free", them: "Free tier, then paid" },
      { label: "Account", oo: "None", them: "Required" },
      { label: "Setup", oo: "Pick services — no configuration", them: "Configure each monitor (URL, interval, regions)" },
      { label: "Where alerts go", oo: ALERTS_OO, them: "Email, SMS, Slack, webhooks and more" },
      { label: "Hosts your own status page", oo: "No", them: "Yes" },
    ],
    theyAreStronger: [
      "Monitors YOUR sites, APIs and servers and tells you when your things go down.",
      "Synthetic checks (HTTP, ping, port, cron) from multiple locations, with response-time history.",
      "Can host a status page for your own service.",
    ],
    weAreDifferent: [
      "Different job: we watch the third-party services you depend on (AWS, Stripe, OpenAI and more) and tell you when one of them breaks, from their official status.",
      "Free, no account, no setup — you pick services instead of configuring checks.",
      "Alerts everywhere you already are, plus a native Mac app.",
    ],
    chooseThem: "Choose UptimeRobot to monitor your own websites and servers.",
    chooseUs: "Choose Outage Observer to know the moment a service you depend on goes down. Plenty of people run both.",
  },
  {
    slug: "pingdom", name: "Pingdom", category: "monitor",
    what: "a website and transaction monitoring product (by SolarWinds) for your own sites",
    site: "https://www.pingdom.com",
    table: [
      { label: "What it watches", oo: "The third-party services you depend on (their official status)", them: "Your own websites, page speed and user transactions" },
      { label: "Price", oo: "Free", them: "Paid" },
      { label: "Account", oo: "None", them: "Required" },
      { label: "Where alerts go", oo: ALERTS_OO, them: "Email, SMS, webhooks, integrations" },
      { label: "Hosts your own status page", oo: "No", them: "Yes" },
    ],
    theyAreStronger: [
      "Synthetic and real-user monitoring of your own sites, with page-speed and transaction checks.",
      "Detailed performance analytics and global test locations.",
      "Mature, enterprise-grade tooling.",
    ],
    weAreDifferent: [
      "Different job: we don't test your site — we watch the official status of the services your site depends on and alert you when one breaks.",
      "Free and account-free, versus a paid product.",
      "Consumer-friendly alerts (Telegram, Discord, push) and a native Mac app.",
    ],
    chooseThem: "Choose Pingdom to measure your own site's uptime and performance.",
    chooseUs: "Choose Outage Observer to be alerted when a provider you rely on has an incident.",
  },
  {
    slug: "betterstack", name: "Better Stack", category: "monitor",
    what: "uptime monitoring, on-call/incident management and status-page hosting in one platform",
    site: "https://betterstack.com",
    table: [
      { label: "What it watches", oo: "The third-party services you depend on (their official status)", them: "Your own endpoints, plus logs and incidents" },
      { label: "Price", oo: "Free", them: "Free tier, then paid" },
      { label: "Account", oo: "None", them: "Required" },
      { label: "On-call / incident management", oo: "No", them: "Yes" },
      { label: "Hosts your own status page", oo: "No", them: "Yes" },
      { label: "Where alerts go", oo: ALERTS_OO, them: "On-call schedules, Slack, SMS, phone, integrations" },
    ],
    theyAreStronger: [
      "Monitors your own endpoints and ties it to on-call schedules and incident management.",
      "Hosts a polished status page for your own service.",
      "Logs and observability in the same suite.",
    ],
    weAreDifferent: [
      "Different job: we watch the providers you depend on, not your own stack, and never run on-call — we just tell you when a dependency breaks.",
      "Free, no account, nothing to configure.",
      "Official-source-only signal with no false alarms, delivered wherever you already are.",
    ],
    chooseThem: "Choose Better Stack to monitor your own services and run on-call.",
    chooseUs: "Choose Outage Observer to watch the third-party services your product runs on — many teams use it alongside a tool like this.",
  },
  {
    slug: "site24x7", name: "Site24x7", category: "monitor",
    what: "a broad monitoring suite (by Zoho) for your own websites, servers, apps and cloud",
    site: "https://www.site24x7.com",
    table: [
      { label: "What it watches", oo: "The third-party services you depend on (their official status)", them: "Your own websites, servers, apps and cloud resources" },
      { label: "Price", oo: "Free", them: "Paid (limited free tier)" },
      { label: "Account", oo: "None", them: "Required" },
      { label: "Scope", oo: "One focused job", them: "Full-stack monitoring + APM + network" },
      { label: "Where alerts go", oo: ALERTS_OO, them: "Email, SMS, voice, integrations" },
    ],
    theyAreStronger: [
      "Deep, full-stack monitoring of your own infrastructure — servers, APM, network, cloud.",
      "Synthetic and real-user monitoring from many global locations.",
      "Enterprise breadth and integrations.",
    ],
    weAreDifferent: [
      "Different job and far simpler: we watch the official status of the services you depend on, not your own infrastructure.",
      "Free, no account, nothing to deploy or configure.",
      "Honest official-source alerts, everywhere you already are.",
    ],
    chooseThem: "Choose Site24x7 to monitor your own infrastructure end to end.",
    chooseUs: "Choose Outage Observer to know when a provider you depend on goes down, free and instantly.",
  },
  {
    slug: "atlassian-statuspage", name: "Atlassian Statuspage", category: "statuspage",
    what: "a tool for publishing your own status page to your users",
    site: "https://www.atlassian.com/software/statuspage",
    table: [
      { label: "What it does", oo: "Watches OTHER companies' status (and alerts you)", them: "Publishes YOUR status to your users" },
      { label: "Price", oo: "Free", them: "Paid (limited free tier)" },
      { label: "Account", oo: "None", them: "Required" },
      { label: "Subscribers / components", oo: "Not applicable", them: "Yes — your users subscribe to your page" },
      { label: "Where alerts go", oo: ALERTS_OO, them: "Notifies your subscribers about your incidents" },
    ],
    theyAreStronger: [
      "The standard way to host a branded status page and post incident updates to your own users.",
      "Components, subscribers, and incident templates.",
      "Deep Atlassian/Jira integration.",
    ],
    weAreDifferent: [
      "Opposite direction: we don't publish your status — we read other companies' status pages (many of which are hosted on Statuspage) and alert you when they have an incident.",
      "Free, no account.",
      "If you depend on providers that publish on Statuspage, we watch all of them for you in one place.",
    ],
    chooseThem: "Choose Atlassian Statuspage to publish and run your own status page.",
    chooseUs: "Choose Outage Observer to be notified when the services you rely on — including ones that use Statuspage — go down.",
  },
  {
    slug: "incident-io", name: "incident.io", category: "statuspage",
    what: "an incident-management platform with status-page hosting, used by large engineering teams",
    site: "https://incident.io",
    table: [
      { label: "What it does", oo: "Watches OTHER companies' status (and alerts you)", them: "Runs YOUR incidents and publishes YOUR status page" },
      { label: "Price", oo: "Free", them: "Paid" },
      { label: "Account", oo: "None", them: "Required" },
      { label: "Where alerts go", oo: ALERTS_OO, them: "On-call, Slack, your own status page subscribers" },
    ],
    theyAreStronger: [
      "A full incident-management platform: on-call, response workflows, postmortems, and a hosted status page for your own service.",
      "Used by large engineering teams to run real incidents.",
      "Polished, modern status pages (with a Statuspage-compatible API).",
    ],
    weAreDifferent: [
      "Opposite direction: we don't run your incidents or host your status — we read other companies' status pages (some of which run on incident.io) and alert you when they break.",
      "Free, no account, nothing to set up.",
      "Official-source-only signal with no false alarms, delivered wherever you already are.",
    ],
    chooseThem: "Choose incident.io to manage your own incidents and publish your own status page.",
    chooseUs: "Choose Outage Observer to be notified when the providers you depend on — including ones whose status pages run on incident.io — go down.",
  },
  {
    slug: "instatus", name: "Instatus", category: "statuspage",
    what: "a fast, modern tool for hosting your own status page",
    site: "https://instatus.com",
    table: [
      { label: "What it does", oo: "Watches OTHER companies' status (and alerts you)", them: "Publishes YOUR status to your users" },
      { label: "Price", oo: "Free", them: "Free tier, then paid" },
      { label: "Account", oo: "None", them: "Required" },
      { label: "Where alerts go", oo: ALERTS_OO, them: "Notifies your subscribers about your incidents" },
    ],
    theyAreStronger: [
      "A clean, quick way to host your own branded status page.",
      "Subscribers, components, and a generous free tier for publishing.",
    ],
    weAreDifferent: [
      "Opposite direction: we read other companies' status pages (several providers we watch publish on Instatus) and alert you, rather than hosting your own.",
      "Free, no account, with alerts wherever you already are.",
    ],
    chooseThem: "Choose Instatus to publish your own status page.",
    chooseUs: "Choose Outage Observer to watch everyone else's and get told when one breaks.",
  },
];

export const COMPARE_BY_SLUG = new Map(COMPETITORS.map((c) => [c.slug, c] as const));

/** Group competitors by category for the hub. */
export const COMPARE_GROUPS: { category: CompareCategory; heading: string; blurb: string }[] = [
  { category: "aggregator", heading: "Status aggregators", blurb: "The closest tools — they watch other companies' status too. This is a real head-to-head." },
  { category: "crowd", heading: "Crowd-sourced trackers", blurb: "Built from user reports rather than official feeds." },
  { category: "monitor", heading: "Uptime monitors", blurb: "Different job: they check whether your own site is up. Often used alongside Outage Observer." },
  { category: "statuspage", heading: "Status-page hosts", blurb: "Different job: they publish your status. We read everyone else's." },
];

/** Outage Observer's genuine edge, for the /compare hub. */
export const OO_EDGE: { title: string; body: string }[] = [
  { title: "Free, no account", body: "The whole thing is free with nothing to sign up for. The closest tools are paid products after a trial and require an account." },
  { title: "Official feeds only", body: "We read each provider's official status and report exactly that — never synthetic checks or crowd reports — so you never get a false alarm." },
  { title: "Wherever you already are", body: "Web board, Telegram, Slack, Discord, browser push, RSS, a native Mac app, and an installable web app. Not just an email dashboard." },
  { title: "Private by default", body: "No accounts, no tracking, no third-party SDKs. Your watch list lives on your device, not our servers." },
  { title: "One focused job", body: "We tell you the moment a service you depend on breaks. We don't host your status page or monitor your own site, so there's nothing to set up." },
];

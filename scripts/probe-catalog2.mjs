// Re-probe the first pass's failures gently: browser UA, low concurrency,
// longer timeout, and a few alternate URLs. Run: node scripts/probe-catalog2.mjs

const CANDIDATES = [
  ["railway", "Railway", "Cloud & hosting", ["https://status.railway.com", "https://status.railway.app"]],
  ["heroku", "Heroku", "Cloud & hosting", ["https://status.heroku.com"]],
  ["gitlab", "GitLab", "Dev & CI", ["https://status.gitlab.com"]],
  ["dockerhub", "Docker Hub", "Dev & CI", ["https://status.docker.com", "https://www.dockerstatus.com"]],
  ["jetbrains", "JetBrains", "Dev & CI", ["https://status.jetbrains.com"]],
  ["jsdelivr", "jsDelivr", "Dev & CI", ["https://status.jsdelivr.com"]],
  ["neon", "Neon", "Data & backend", ["https://neonstatus.com"]],
  ["stripe", "Stripe", "Payments", ["https://status.stripe.com"]],
  ["paddle", "Paddle", "Payments", ["https://status.paddle.com"]],
  ["paypal", "PayPal", "Payments", ["https://www.paypal-status.com"]],
  ["slack", "Slack", "Comms", ["https://slack-status.com", "https://status.slack.com"]],
  ["resend", "Resend", "Comms", ["https://status.resend.com"]],
  ["auth0", "Auth0", "Auth & identity", ["https://status.auth0.com"]],
  ["okta", "Okta", "Auth & identity", ["https://status.okta.com"]],
  ["huggingface", "Hugging Face", "AI & model providers", ["https://status.huggingface.co"]],
  ["mistral", "Mistral", "AI & model providers", ["https://status.mistral.ai"]],
  ["openrouter", "OpenRouter", "AI & model providers", ["https://status.openrouter.ai"]],
  ["together", "Together AI", "AI & model providers", ["https://status.together.ai"]],
  ["notion", "Notion", "Collaboration", ["https://status.notion.so"]],
  ["linear", "Linear", "Collaboration", ["https://status.linear.app", "https://linearstatus.com"]],
  ["fastly", "Fastly", "CDN & edge", ["https://www.fastlystatus.com", "https://status.fastly.com"]],
  ["pagerduty", "PagerDuty", "Monitoring", ["https://status.pagerduty.com"]],
];

const UA = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "application/json,text/plain,*/*",
};

async function tryFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { headers: UA, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function classify(urls) {
  for (const url of urls) {
    const sp = await tryFetch(`${url}/api/v2/summary.json`);
    if (sp && sp.status && typeof sp.status.indicator === "string") {
      return { adapter: "statuspage", url, sample: sp.status.indicator };
    }
    const is = await tryFetch(`${url}/summary.json`);
    if (is && is.page && typeof is.page.status === "string") {
      return { adapter: "instatus", url, sample: is.page.status };
    }
  }
  return { adapter: "NONE", url: urls[0], sample: "" };
}

// Concurrency limiter: process in chunks of 5.
const results = [];
for (let i = 0; i < CANDIDATES.length; i += 5) {
  const chunk = CANDIDATES.slice(i, i + 5);
  const chunkResults = await Promise.all(
    chunk.map(async ([id, name, category, urls]) => ({ id, name, category, ...(await classify(urls)) })),
  );
  results.push(...chunkResults);
}

console.log("--- RECOVERED ---");
for (const r of results.filter((r) => r.adapter !== "NONE")) {
  console.log(
    `  { id: "${r.id}", name: ${JSON.stringify(r.name)}, category: ${JSON.stringify(r.category)}, adapter: "${r.adapter}", url: "${r.url}" },`,
  );
}
console.log("\n--- STILL FAILED (custom adapter needed) ---");
for (const r of results.filter((r) => r.adapter === "NONE")) {
  console.log(`  ${r.id} ${r.url}`);
}

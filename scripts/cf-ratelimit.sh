#!/usr/bin/env bash
# Create/replace the single free-tier WAF rate-limiting rule for outage.observer.
#
# Free plan limits this to: 1 rule, count by IP, 10s window, match on Path +
# Verified Bot only. The rule challenges per-IP floods on the browsable/API
# paths while deliberately EXCLUDING:
#   - bot webhook paths (/webhook, /slack, /discord, /ingest) — these arrive
#     from a few Telegram/Slack/Discord IPs at high volume; rate-limiting them
#     would break the bots.
#   - verified bots (Googlebot, Bingbot, etc.) — never block real crawlers,
#     so SEO/AEO indexing is untouched.
#
# The Free plan only allows the "block" action for rate limiting (challenge
# actions are paid), and only a 10s window / 10s mitigation. THRESHOLD is set
# generously so real users (who mostly hit cached pages) never reach it; a flood
# gets a short 10s block that auto-clears.
#
# Run:  CLOUDFLARE_API_TOKEN=<token with Zone:WAF Edit + Zone:Read> \
#         bash scripts/cf-ratelimit.sh
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (Zone:WAF Edit + Zone:Read for outage.observer)}"
ZONE_NAME="${ZONE_NAME:-outage.observer}"
THRESHOLD="${THRESHOLD:-100}"   # requests per 10s per IP before mitigation
API="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")

zone_id=$(curl -fsS "${auth[@]}" "${API}/zones?name=${ZONE_NAME}" \
  | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')")
[ -n "$zone_id" ] || { echo "zone ${ZONE_NAME} not found for this token"; exit 1; }
echo "zone_id=${zone_id}  threshold=${THRESHOLD}/10s"

expr='(not starts_with(http.request.uri.path, "/webhook")) and (not starts_with(http.request.uri.path, "/slack")) and (not starts_with(http.request.uri.path, "/discord")) and (not starts_with(http.request.uri.path, "/ingest")) and (not cf.client.bot)'

# PUT replaces the whole http_ratelimit entrypoint (free tier holds 1 rule).
curl -fsS -X PUT "${auth[@]}" -H "content-type: application/json" \
  "${API}/zones/${zone_id}/rulesets/phases/http_ratelimit/entrypoint" \
  --data "$(python3 - "$expr" "$THRESHOLD" <<'PY'
import json, sys
expr, threshold = sys.argv[1], int(sys.argv[2])
print(json.dumps({
  "rules": [{
    "description": "Per-IP flood guard (skip bot webhooks + verified crawlers)",
    "expression": expr,
    "action": "block",
    "ratelimit": {
      "characteristics": ["cf.colo.id", "ip.src"],
      "period": 10,
      "requests_per_period": threshold,
      "mitigation_timeout": 10
    }
  }]
}))
PY
)" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('success') else json.dumps(d.get('errors'), indent=2))"

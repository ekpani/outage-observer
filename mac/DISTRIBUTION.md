# Shipping Outage Observer for Mac

Distributed as a **notarized Developer ID** DMG (direct download off
outage.observer/mac), with the **Mac App Store** to follow. Automated with
**fastlane** (`mac/fastlane/Fastfile`) — the same recipe runs locally and in CI.

Outage Observer is a sandboxed, network-client-only app with no restricted
capabilities (no push / iCloud / app groups), so a Developer ID build needs
**no provisioning profile** — automatic signing resolves the Developer ID cert
in the keychain directly.

## One-time setup
1. **App Store Connect API key** (for notarization): ASC → Users and Access →
   Integrations → App Store Connect API → generate (App Manager). Download the
   `.p8`. (You can reuse the same key as your other apps.)
2. `cp mac/fastlane/.env.example mac/fastlane/.env` and fill in `ASC_KEY_ID`,
   `ASC_ISSUER_ID`, `ASC_KEY_PATH`.

## Build locally
```sh
cd mac
fastlane mac release
```
Builds Release with Hardened Runtime, signs **Developer ID**, notarizes, staples.
Output: `mac/build/mac/Outage Observer.app`. To make the DMG:
```sh
brew install create-dmg
./scripts/make-dmg.sh "build/mac/Outage Observer.app" Outage-Observer.dmg
```

## Ship via GitHub CI (`.github/workflows/Release Mac`)
One manual trigger (Actions → **Release Mac** → Run) goes live. The runner runs
the same `fastlane mac release` recipe, builds the **branded DMG**
(`mac/scripts/make-dmg.sh` + `mac/assets/dmg.png`), **notarizes + staples the
DMG**, publishes an immutable **dated** GitHub Release for history, and
**recreates the `mac-latest` release** — the FIXED URL `outage.observer/mac`
links to (`releases/download/mac-latest/Outage-Observer.dmg`).

**Five repo secrets** (Settings → Secrets and variables → Actions). All reusable
from your existing Developer ID setup — three are your ASC key, two are your
signing cert:
```sh
# Signing cert (Developer ID Application). Export it (Touch ID prompt):
PW="$(openssl rand -base64 24)"
security export -k ~/Library/Keychains/login.keychain-db -t identities \
  -f pkcs12 -P "$PW" -o /tmp/devid.p12          # approve the keychain prompt
base64 -i /tmp/devid.p12 | gh secret set DEVID_CERT_P12_BASE64 --repo ekpani/outage-observer
printf '%s' "$PW" | gh secret set DEVID_CERT_PASSWORD --repo ekpani/outage-observer
rm -f /tmp/devid.p12                            # never commit / never print the .p12

# ASC API key (reuse the same key + .p8 you use elsewhere):
gh secret set ASC_KEY_ID      --repo ekpani/outage-observer --body "YOUR_KEY_ID"
gh secret set ASC_ISSUER_ID   --repo ekpani/outage-observer --body "YOUR_ISSUER_ID"
base64 -i ~/keys/AuthKey_YOURKEY.p8 | gh secret set ASC_KEY_P8_BASE64 --repo ekpani/outage-observer
```

## Versions
`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` live in `mac/project.yml`.
Fastlane stamps each build with a UTC-timestamp build number, so you only bump
`MARKETING_VERSION` for user-facing version changes.

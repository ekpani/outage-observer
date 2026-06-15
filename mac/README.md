# Outage Observer for Mac

A native menu-bar app + notifications for [outage.observer](https://outage.observer).
Lives in your menu bar, shows the status of the services you're observing, and
sends a local notification the moment one changes state. Same design language as
the web board (dark, Departure Mono, the aperture mark).

It reads the public `https://outage.observer/api/status` snapshot — no account,
no keys, no backend of its own.

## What it does

- **Menu bar** — a small reticle whose color tracks the worst status among the
  services you watch (green / amber / red). Click for your **personalized board**:
  every service you observe, problems pinned to the top, each clickable to open
  its page.
- **Notifications** — polls every 30s and fires a local notification on a real
  status transition for a service you watch (never on the first sample, never
  to/from `unknown` — same no-fake-news rule as the rest of the project).
- **Window** — a fuller "Manage" view: search the full catalog and add/remove
  services, grouped by category, with live status overlaid.
- **Settings** — launch at login (SMAppService), notifications on/off, refresh
  interval.

Your "observing" set is stored locally in `UserDefaults`. The app is a menu-bar
agent (`LSUIElement`), so it has no Dock icon; set `LSUIElement` to `false` in
`Resources/Info.plist` if you'd prefer a Dock icon + normal window.

## Build & run

Requires macOS 14+, Xcode, and [XcodeGen](https://github.com/yonom/XcodeGen)
(`brew install xcodegen`). The Xcode project is generated from `project.yml`.

```sh
cd mac
xcodegen generate
open "OutageObserver.xcodeproj"   # then Run (⌘R)
```

Or from the command line:

```sh
cd mac
xcodegen generate
xcodebuild -project OutageObserver.xcodeproj -scheme OutageObserver \
  -configuration Release -derivedDataPath .build CODE_SIGNING_ALLOWED=NO build
open ".build/Build/Products/Release/Outage Observer.app"
```

## Releases

Pushing a tag matching `mac-v*` (e.g. `mac-v1.0.0`) triggers
`.github/workflows/mac-release.yml`, which builds the app on a macOS runner and
attaches a zip to the GitHub Release.

The released build is **unsigned** (no Apple Developer secrets in CI), so the
first launch needs a right-click → **Open** to get past Gatekeeper. To ship a
signed + notarized build, add your signing identity / notary credentials as
repo secrets and enable signing in the workflow.

## Onboarding & focus

On first launch the app is **gated behind a short onboarding** (welcome → choose
what to watch → notifications + launch at login). It's intentionally unusable
until you finish, because the choose-services step is how the app learns what to
track. After that, the app **only acts on the services you picked** — it polls
the single public `/api/status` snapshot (one cached request) and only ever
notifies for, and shows, your chosen services. It does not start polling at all
until onboarding completes.

Notifications fire on **any** real transition for an observed service — outage,
degradation, maintenance, or recovery — never on the first sample after launch,
and never to/from `unknown`. Freshness is bounded by the chain: the provider's
own status page → Outage Observer's backend (cron every minute, plus instant
push for providers wired to its webhook) → the edge-cached snapshot
(`s-maxage=30`) → the app's 30s poll. So push-backed providers are near-instant;
the rest land within ~1–2 minutes. The app also refreshes the moment you open
the menu.

## Publishing to the Mac App Store

The app is built MAS-ready: sandboxed, `network.client` only, an app category,
and a non-exempt-encryption flag. You need an Apple Developer account.

1. **App ID** — in the Developer portal, register `observer.outage.mac` (no extra
   capabilities; App Sandbox is automatic for MAS).
2. **App record** — create the app in App Store Connect (same bundle id), set it
   to free, fill the privacy section (Outage Observer collects **no** data — it
   only reads a public status feed), and add screenshots.
3. **Signing** — in Xcode, set the team on the `OutageObserver` target. For MAS,
   Xcode uses an *Apple Distribution* certificate + a Mac App Store provisioning
   profile (Automatic signing handles both).
4. **Archive & upload** — Product → Archive, then distribute via *App Store
   Connect* in the Organizer (or export a `.pkg` and upload with Transporter).
5. Submit for review.

The `mac-release.yml` workflow (GitHub zip) is a **separate**, unsigned channel
for people who don't want the App Store; MAS upload is done from Xcode with your
account. Keep `ENABLE_HARDENED_RUNTIME` on (harmless for MAS, required if you
also ship the Developer-ID zip notarized).

## Regenerating assets

- App icon: `node ../scripts/gen-icon.mjs` then
  `iconutil -c icns AppIcon.iconset -o Resources/AppIcon.icns`
- Font: `Resources/DepartureMono-Regular.otf` (Departure Mono, free license),
  registered at launch and via `ATSApplicationFontsPath`.

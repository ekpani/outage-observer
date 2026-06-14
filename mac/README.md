# Outage Observer for Mac

A native menu-bar app + notifications for [outage.observer](https://outage.observer).
Lives in your menu bar, shows the status of the services you're observing, and
sends a local notification the moment one changes state. Same design language as
the web board (dark, Departure Mono, the aperture mark).

It reads the public `https://outage.observer/api/status` snapshot — no account,
no keys, no backend of its own.

## What it does

- **Menu bar** — a small aperture icon whose pupil turns green / amber / red with
  the worst status among the services you observe. Click for a popover: overall
  status, your observed services (click any to open its page), refresh, settings.
- **Notifications** — polls every minute and fires a local notification on a real
  status transition for a service you observe (never on the first sample, never
  to/from `unknown` — same no-fake-news rule as the rest of the project).
- **Window** — a fuller view to manage what you observe: search the full catalog
  and star services to add/remove, grouped by category.
- **Settings** — launch at login (SMAppService), notifications on/off, refresh
  interval.

Your "observing" set is stored locally in `UserDefaults`. The app is a menu-bar
agent (`LSUIElement`), so it has no Dock icon; set `LSUIElement` to `false` in
`Resources/Info.plist` if you'd prefer a Dock icon + normal window.

## Build & run

Requires macOS 13+, Xcode, and [XcodeGen](https://github.com/yonom/XcodeGen)
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

## Regenerating assets

- App icon: `node ../scripts/gen-icon.mjs` then
  `iconutil -c icns AppIcon.iconset -o Resources/AppIcon.icns`
- Font: `Resources/DepartureMono-Regular.otf` (Departure Mono, free license),
  registered at launch and via `ATSApplicationFontsPath`.

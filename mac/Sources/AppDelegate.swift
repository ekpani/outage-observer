import AppKit
import SwiftUI
import Combine
import CoreText

/// The scope reticle as a TEMPLATE image (ring + ticks + centre dot), drawn so
/// its centre is the exact image centre. Template → the system colours it like
/// every other menu-bar icon (black on light bars, white on dark). The colored
/// status pupil is overlaid separately, pinned to the same centre.
private func menuBarScope(size: CGFloat = 18) -> NSImage {
    let img = NSImage(size: NSSize(width: size, height: size))
    img.lockFocus()
    NSColor.black.set()   // template: the shape matters, not the colour
    let c = NSPoint(x: size / 2, y: size / 2)
    let r = size * 0.3

    let ring = NSBezierPath(ovalIn: NSRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
    ring.lineWidth = 1.4
    ring.stroke()

    let ticks = NSBezierPath()
    ticks.lineWidth = 1.4
    let t0 = r + 0.6, t1 = r + 2.4
    for (dx, dy) in [(0.0, 1.0), (0.0, -1.0), (1.0, 0.0), (-1.0, 0.0)] {
        ticks.move(to: NSPoint(x: c.x + dx * t0, y: c.y + dy * t0))
        ticks.line(to: NSPoint(x: c.x + dx * t1, y: c.y + dy * t1))
    }
    ticks.stroke()

    let pr: CGFloat = 1.7
    NSBezierPath(ovalIn: NSRect(x: c.x - pr, y: c.y - pr, width: 2 * pr, height: 2 * pr)).fill()

    img.unlockFocus()
    img.isTemplate = true
    return img
}

/// Owns the menu-bar status item and the popover. We use AppKit's NSStatusItem +
/// NSPopover (rather than SwiftUI's MenuBarExtra) so the popover shows the
/// standard arrow that stems from the icon and anchors centered beneath it.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let store = StatusStore.shared
    private var statusItem: NSStatusItem?
    private var popover: NSPopover?
    private var pupilLayer: CALayer?
    private var cancellables = Set<AnyCancellable>()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Register the bundled Departure Mono so Font.custom resolves it.
        if let url = Bundle.main.url(forResource: "DepartureMono-Regular", withExtension: "otf") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }

        let pop = NSPopover()
        pop.behavior = .transient                 // closes on click-outside
        pop.animates = true
        // The arrow/frame is system-drawn chrome (not our content), so match its
        // appearance to the user's theme choice (nil = follow system) — otherwise
        // the default light material shows through the stem on a dark body.
        pop.appearance = store.nsAppearance
        pop.contentSize = NSSize(width: popoverWidth, height: 520)
        pop.contentViewController = NSHostingController(
            rootView: MenuContentView().environmentObject(store)
        )
        popover = pop

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.target = self
        item.button?.action = #selector(togglePopover(_:))
        item.button?.toolTip = "Outage Observer"
        item.button?.setAccessibilityLabel("Outage Observer status")
        statusItem = item
        updateIcon()

        // First launch: a menu-bar agent has no window, so open the popover once
        // so onboarding isn't missed. (Next runloop tick, when the button is laid
        // out and can anchor the popover.)
        if !store.onboarded {
            Task { @MainActor in self.showPopover() }
        }

        // Recolor the icon whenever anything that affects the worst status
        // changes. objectWillChange fires before the value updates, so read it
        // back on the next main-actor hop (by then it's current).
        store.objectWillChange
            .sink { [weak self] _ in
                Task { @MainActor in
                    guard let self else { return }
                    self.updateIcon()
                    self.popover?.appearance = self.store.nsAppearance
                }
            }
            .store(in: &cancellables)
    }

    @objc private func togglePopover(_ sender: Any?) {
        guard let pop = popover else { return }
        if pop.isShown { pop.performClose(sender) } else { showPopover() }
    }

    private func showPopover() {
        guard let button = statusItem?.button, let pop = popover, !pop.isShown else { return }
        pop.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        pop.contentViewController?.view.window?.makeKey()
        NSApp.activate(ignoringOtherApps: true)
    }

    /// The menu-bar reticle. `contentTintColor` is NOT honoured for status-item
    /// images on a dark menu bar (the icon falls back to a black template and
    /// vanishes), so we never use it. When all is well the icon is a plain
    /// template — the system's own menu-bar treatment renders it white on a dark
    /// bar, black on a light bar (always visible). When something needs attention
    /// we bake a saturated colour directly into the image, so it renders that
    /// colour on any bar with no tinting involved.
    private func updateIcon() {
        guard let button = statusItem?.button else { return }
        button.contentTintColor = nil

        // The scope is a TEMPLATE image, so the system colours it to match every
        // other menu-bar icon — black on a light (wallpaper-driven) bar, white on
        // a dark one. (effectiveAppearance can't tell us this; only template
        // rendering tracks the wallpaper.) The status colour rides on top as a
        // separate layer pinned to the scope's exact centre, so the ring adapts.
        button.image = menuBarScope()

        let dot = ensurePupilLayer(on: button)
        if let tint = menuBarTint(store.worst) {
            let s: CGFloat = 5
            dot.bounds = CGRect(x: 0, y: 0, width: s, height: s)
            dot.cornerRadius = s / 2
            dot.position = CGPoint(x: button.bounds.midX, y: button.bounds.midY)   // anchor 0.5,0.5
            dot.contentsScale = button.window?.backingScaleFactor ?? 2
            dot.backgroundColor = tint.cgColor
            dot.isHidden = false
        } else {
            dot.isHidden = true
        }
    }

    private func ensurePupilLayer(on button: NSStatusBarButton) -> CALayer {
        button.wantsLayer = true
        if let layer = pupilLayer, layer.superlayer != nil { return layer }
        let layer = CALayer()
        layer.isHidden = true
        button.layer?.addSublayer(layer)
        pupilLayer = layer
        return layer
    }

    private func menuBarTint(_ level: Level) -> NSColor? {
        switch level {
        case .maintenance:    return NSColor(hex: 0x5BA8FF)
        case .degraded:       return NSColor(hex: 0xE5B647)
        case .partial_outage: return NSColor(hex: 0xF0883E)
        case .major_outage:   return NSColor(hex: 0xF0726A)
        case .operational, .unknown: return nil   // plain template adapts to the bar
        }
    }
}

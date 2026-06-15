import AppKit
import SwiftUI
import Combine
import CoreText

/// Owns the menu-bar status item and the popover. We use AppKit's NSStatusItem +
/// NSPopover (rather than SwiftUI's MenuBarExtra) so the popover shows the
/// standard arrow that stems from the icon and anchors centered beneath it.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let store = StatusStore.shared
    private var statusItem: NSStatusItem?
    private var popover: NSPopover?
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

    /// The menu-bar reticle. When all is well it's a plain template image, so the
    /// system renders it white on a dark bar and black on a light bar (always
    /// visible). When something needs attention it's tinted a saturated colour
    /// (amber / orange / red / blue) that reads on either bar. We use direct
    /// NSColors here, not Theme's adaptive colors: converting a SwiftUI dynamic
    /// Color back to NSColor resolved to a near-black tint and the icon vanished.
    private func updateIcon() {
        guard let button = statusItem?.button else { return }
        let cfg = NSImage.SymbolConfiguration(pointSize: 13, weight: .regular)
        let img = NSImage(systemSymbolName: "dot.scope", accessibilityDescription: "Outage Observer")?
            .withSymbolConfiguration(cfg)
        img?.isTemplate = true
        button.image = img
        button.contentTintColor = menuBarTint(store.worst)   // nil => adapts to the bar
    }

    private func menuBarTint(_ level: Level) -> NSColor? {
        switch level {
        case .maintenance:    return NSColor(hex: 0x5BA8FF)
        case .degraded:       return NSColor(hex: 0xE5B647)
        case .partial_outage: return NSColor(hex: 0xF0883E)
        case .major_outage:   return NSColor(hex: 0xF0726A)
        case .operational, .unknown: return nil   // template adapts: white on dark, black on light
        }
    }
}

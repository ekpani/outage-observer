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
        statusItem = item
        updateIcon()

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
        guard let button = statusItem?.button, let pop = popover else { return }
        if pop.isShown {
            pop.performClose(sender)
        } else {
            pop.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            pop.contentViewController?.view.window?.makeKey()
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    /// A reticle that stems-from-nothing visually but is tinted by the worst
    /// observed status (green / amber / red) — readable on light and dark bars.
    private func updateIcon() {
        guard let button = statusItem?.button else { return }
        let cfg = NSImage.SymbolConfiguration(pointSize: 13, weight: .regular)
        let img = NSImage(systemSymbolName: "dot.scope", accessibilityDescription: "Outage Observer")?
            .withSymbolConfiguration(cfg)
        img?.isTemplate = true
        button.image = img
        button.contentTintColor = NSColor(Theme.status(store.worst))
    }
}

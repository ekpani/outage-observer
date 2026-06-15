import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        if !UserDefaults.standard.bool(forKey: "didOnboard") {
            OnboardingController.shared.show()
        }
    }
}

/// Presents the first-run onboarding in its own borderless dark window (a
/// menu-bar agent has no main window to host it in).
@MainActor
final class OnboardingController {
    static let shared = OnboardingController()
    private var window: NSWindow?

    func show() {
        if window == nil {
            let root = OnboardingView(onDone: { [weak self] in self?.finish() })
                .environmentObject(StatusStore.shared)
            let hosting = NSHostingController(rootView: root)
            let w = NSWindow(contentViewController: hosting)
            w.styleMask = [.titled, .closable, .fullSizeContentView]
            w.titleVisibility = .hidden
            w.titlebarAppearsTransparent = true
            w.isMovableByWindowBackground = true
            w.backgroundColor = NSColor(red: 7 / 255, green: 8 / 255, blue: 9 / 255, alpha: 1)
            w.isReleasedWhenClosed = false
            w.setContentSize(NSSize(width: 440, height: 580))
            w.center()
            window = w
        }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }

    private func finish() {
        UserDefaults.standard.set(true, forKey: "didOnboard")
        window?.close()
        window = nil
    }
}

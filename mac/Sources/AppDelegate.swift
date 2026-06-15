import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        if !StatusStore.shared.onboarded {
            OnboardingController.shared.show()
        }
    }
}

/// Presents the first-run onboarding in its own dark window. A menu-bar agent
/// has no main window to host it in, and the app is intentionally unusable
/// until onboarding completes — so the window has no close button (the only way
/// out is finishing the flow, or Quit).
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
            w.styleMask = [.titled, .fullSizeContentView]   // no .closable — must finish
            w.titleVisibility = .hidden
            w.titlebarAppearsTransparent = true
            w.isMovableByWindowBackground = true
            w.backgroundColor = NSColor(red: 7 / 255, green: 8 / 255, blue: 9 / 255, alpha: 1)
            w.isReleasedWhenClosed = false
            w.setContentSize(NSSize(width: 460, height: 640))
            w.center()
            w.level = .floating
            window = w
        }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }

    private func finish() {
        window?.orderOut(nil)
        window = nil
    }
}

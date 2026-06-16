import SwiftUI
import Sparkle

/// Wraps Sparkle's standard updater. Created at launch so it runs scheduled
/// background checks (per the Info.plist SUEnableAutomaticChecks / interval), and
/// exposes a manual "Check for Updates…" the popover Settings can call.
///
/// We're an `LSUIElement` agent with no normal activation, so Sparkle's update
/// window can open behind everything. As its user-driver delegate we activate
/// the app whenever update UI is about to show, so the prompt is never missed.
@MainActor
final class UpdaterManager: NSObject, ObservableObject, SPUStandardUserDriverDelegate {
    static let shared = UpdaterManager()

    private var controller: SPUStandardUpdaterController!

    private override init() {
        super.init()
        // startingUpdater: true → begins automatic checks immediately.
        controller = SPUStandardUpdaterController(startingUpdater: true,
                                                  updaterDelegate: nil,
                                                  userDriverDelegate: self)
    }

    func checkForUpdates() {
        NSApp.activate(ignoringOtherApps: true)
        controller.updater.checkForUpdates()
    }

    // Bring the agent app forward so the update alert/progress window is visible
    // and focusable rather than buried behind other apps.
    nonisolated func standardUserDriverWillHandleShowingUpdate(
        _ handleShowingUpdate: Bool,
        forUpdate update: SUAppcastItem,
        state: SPUUserUpdateState
    ) {
        Task { @MainActor in NSApp.activate(ignoringOtherApps: true) }
    }
}

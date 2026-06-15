import SwiftUI
import Sparkle

/// Wraps Sparkle's standard updater. Created at launch so it runs scheduled
/// background checks (per the Info.plist SUEnableAutomaticChecks / interval), and
/// exposes a manual "Check for Updates…" the popover Settings can call.
@MainActor
final class UpdaterManager: ObservableObject {
    static let shared = UpdaterManager()

    private let controller: SPUStandardUpdaterController

    private init() {
        // startingUpdater: true → begins automatic checks immediately.
        controller = SPUStandardUpdaterController(startingUpdater: true,
                                                  updaterDelegate: nil,
                                                  userDriverDelegate: nil)
    }

    func checkForUpdates() {
        controller.updater.checkForUpdates()
    }
}

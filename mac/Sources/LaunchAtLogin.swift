import ServiceManagement
import SwiftUI

/// Thin wrapper over SMAppService for the "Launch at login" toggle (macOS 13+).
@MainActor
final class LaunchAtLogin: ObservableObject {
    @Published var enabled: Bool {
        didSet { apply() }
    }

    init() {
        enabled = SMAppService.mainApp.status == .enabled
    }

    private func apply() {
        do {
            if enabled {
                if SMAppService.mainApp.status != .enabled { try SMAppService.mainApp.register() }
            } else {
                try SMAppService.mainApp.unregister()
            }
        } catch {
            NSLog("LaunchAtLogin error: \(error.localizedDescription)")
        }
    }
}

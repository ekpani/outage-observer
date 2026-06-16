import AppKit
import UserNotifications

/// Local notifications on real status transitions. The app polls /api/status and
/// fires here when a service the user observes changes state. Clicking opens the
/// provider's Outage Observer page.
// Stateless singleton (just methods), so it's safe to share across isolation
// domains; completions are delivered on the main actor.
final class NotificationManager: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = NotificationManager()

    private override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    func requestAuthorization(_ completion: @escaping @MainActor (Bool) -> Void = { _ in }) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            Task { @MainActor in completion(granted) }
        }
    }

    func isAuthorized(_ completion: @escaping @MainActor (Bool) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let authorized = settings.authorizationStatus == .authorized
            Task { @MainActor in completion(authorized) }
        }
    }

    /// True when macOS has explicitly DENIED notifications — re-enabling needs a
    /// trip to System Settings (re-requesting authorization silently no-ops), so
    /// the UI surfaces a recovery path for this state.
    func isDenied(_ completion: @escaping @MainActor (Bool) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let denied = settings.authorizationStatus == .denied
            Task { @MainActor in completion(denied) }
        }
    }

    /// Open System Settings straight to this app's Notifications pane.
    @MainActor func openSystemNotificationSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension") {
            NSWorkspace.shared.open(url)
        }
    }

    /// A clearly-fictional sample so the user can preview the alert + its sound.
    func sendTest() {
        requestAuthorization { granted in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = "Test alert — Example Service"
            content.body = "A sample so you can hear the sound. Not a real incident."
            content.sound = UNNotificationSound(named: UNNotificationSoundName("oo-alert.caf"))
            UNUserNotificationCenter.current().add(
                UNNotificationRequest(identifier: "oo-test-\(Int(Date().timeIntervalSince1970))", content: content, trigger: nil)
            )
        }
    }

    func notify(provider: Provider, to level: Level) {
        let content = UNMutableNotificationContent()
        let recovered = level == .operational
        content.title = recovered ? "\(provider.name) recovered" : "\(provider.name): \(level.label)"
        content.body = provider.incident?.name ?? (recovered ? "Back to normal." : "Status is now \(level.label).")
        // Bright rising tone on recovery, a softer tone for trouble (bundled .caf,
        // so the system still respects Focus / notification settings).
        content.sound = UNNotificationSound(named: UNNotificationSoundName(recovered ? "oo-recovered.caf" : "oo-alert.caf"))
        content.userInfo = ["url": statusURL(for: provider.id).absoluteString]
        let request = UNNotificationRequest(
            identifier: "oo-\(provider.id)-\(Int(Date().timeIntervalSince1970))",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    // Show banners even when the app is frontmost.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let s = response.notification.request.content.userInfo["url"] as? String, let url = URL(string: s) {
            Task { @MainActor in NSWorkspace.shared.open(url) }
        }
        completionHandler()
    }
}

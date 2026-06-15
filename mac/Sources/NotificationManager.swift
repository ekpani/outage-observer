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

    func notify(provider: Provider, to level: Level) {
        let content = UNMutableNotificationContent()
        let recovered = level == .operational
        content.title = recovered ? "\(provider.name) recovered" : "\(provider.name): \(level.label)"
        content.body = provider.incident?.name ?? (recovered ? "Back to normal." : "Status is now \(level.label).")
        content.sound = .default
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

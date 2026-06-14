import AppKit
import SwiftUI

/// Single source of truth: polls /api/status, holds the snapshot + the user's
/// "observing" set, and fires notifications on transitions among observed
/// services. @MainActor so all @Published mutations are on the main thread.
@MainActor
final class StatusStore: ObservableObject {
    @Published var providers: [Provider] = []
    @Published var checkedAt: Date?
    @Published var loading = false
    @Published var lastError: String?

    @Published var observing: Set<String> {
        didSet { UserDefaults.standard.set(Array(observing), forKey: "observing") }
    }
    @Published var notificationsEnabled: Bool {
        didSet { UserDefaults.standard.set(notificationsEnabled, forKey: "notificationsEnabled") }
    }
    @Published var interval: Double {
        didSet { UserDefaults.standard.set(interval, forKey: "interval"); restartTimer() }
    }

    private var lastLevels: [String: Level] = [:]
    private var timer: Timer?

    init() {
        let d = UserDefaults.standard
        if let saved = d.array(forKey: "observing") as? [String] {
            observing = Set(saved)
        } else {
            observing = defaultObserving
        }
        notificationsEnabled = (d.object(forKey: "notificationsEnabled") as? Bool) ?? true
        interval = (d.object(forKey: "interval") as? Double) ?? 60

        NotificationManager.shared.requestAuthorization()
        Task { await refresh() }
        restartTimer()
    }

    // MARK: Derived

    var observedProviders: [Provider] {
        providers
            .filter { observing.contains($0.id) }
            .sorted { lhs, rhs in
                lhs.level.severity != rhs.level.severity
                    ? lhs.level.severity > rhs.level.severity
                    : lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
    }

    /// Worst status among observed (ignoring unknown); operational if all clear.
    var worst: Level {
        observedProviders
            .map(\.level)
            .filter { $0 != .unknown }
            .max(by: { $0.severity < $1.severity }) ?? .operational
    }

    var attentionCount: Int {
        observedProviders.filter { $0.level.needsAttention }.count
    }

    func isObserving(_ id: String) -> Bool { observing.contains(id) }

    func toggle(_ id: String) {
        if observing.contains(id) { observing.remove(id) } else { observing.insert(id) }
    }

    func open(_ provider: Provider) {
        NSWorkspace.shared.open(statusURL(for: provider.id))
    }

    // MARK: Polling

    func restartTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: max(15, interval), repeats: true) { [weak self] _ in
            Task { await self?.refresh() }
        }
    }

    func refresh() async {
        loading = true
        defer { loading = false }
        do {
            var req = URLRequest(url: URL(string: "https://outage.observer/api/status")!)
            req.setValue("application/json", forHTTPHeaderField: "accept")
            req.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, _) = try await URLSession.shared.data(for: req)
            let snapshot = try JSONDecoder().decode(Snapshot.self, from: data)

            // Notify on real transitions for observed services. Never on the
            // first sample (no prior level) and never to/from unknown.
            for p in snapshot.providers where observing.contains(p.id) {
                if let prev = lastLevels[p.id], prev != p.level, prev != .unknown, p.level != .unknown {
                    if notificationsEnabled {
                        NotificationManager.shared.notify(provider: p, to: p.level)
                    }
                }
            }
            for p in snapshot.providers { lastLevels[p.id] = p.level }

            providers = snapshot.providers
            if let ms = snapshot.checkedAt { checkedAt = Date(timeIntervalSince1970: ms / 1000) }
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }
}

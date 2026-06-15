import AppKit
import SwiftUI

/// Single source of truth. Polls /api/status, holds the snapshot + the user's
/// "observing" set, and fires notifications on transitions among observed
/// services. @MainActor so all @Published mutations are on the main thread.
///
/// Focus rule: the app only acts on the services the user chose during
/// onboarding. Polling doesn't even start until onboarding is complete, and
/// notifications only ever fire for observed services.
@MainActor
final class StatusStore: ObservableObject {
    static let shared = StatusStore()

    /// Live status by provider id, from the most recent /api/status snapshot.
    @Published private(set) var snapshot: [String: Provider] = [:]
    @Published private(set) var checkedAt: Date?
    @Published private(set) var loading = false
    @Published private(set) var lastError: String?

    @Published var onboarded: Bool {
        didSet {
            UserDefaults.standard.set(onboarded, forKey: "didOnboard")
            startPolling()   // starts if onboarded, cancels the loop if not
        }
    }
    @Published var observing: Set<String> {
        didSet { UserDefaults.standard.set(Array(observing), forKey: "observing") }
    }
    @Published var notificationsEnabled: Bool {
        didSet {
            UserDefaults.standard.set(notificationsEnabled, forKey: "notificationsEnabled")
            if notificationsEnabled { NotificationManager.shared.requestAuthorization() }
        }
    }
    @Published var interval: Double {
        didSet { UserDefaults.standard.set(interval, forKey: "interval"); startPolling() }
    }

    private var lastLevels: [String: Level] = [:]
    private var pollTask: Task<Void, Never>?

    private init() {
        let d = UserDefaults.standard
        onboarded = d.bool(forKey: "didOnboard")
        observing = Set(d.array(forKey: "observing") as? [String] ?? [])
        notificationsEnabled = (d.object(forKey: "notificationsEnabled") as? Bool) ?? true
        // 30s matches the /api/status edge cache (s-maxage=30) — the freshness
        // floor; polling faster wouldn't return newer data.
        interval = (d.object(forKey: "interval") as? Double) ?? 30

        if onboarded { startPolling() }
    }

    // MARK: Derived (catalog-backed, so observed services show even pre-fetch)

    /// A Provider for an observed id: live from the snapshot, or a synthesized
    /// "unknown" placeholder from catalog metadata until the first fetch lands.
    private func provider(for id: String) -> Provider? {
        if let live = snapshot[id] { return live }
        guard let meta = catalogByID[id] else { return nil }
        return Provider(id: meta.id, name: meta.name, category: meta.category,
                        level: .unknown, home: nil, incident: nil)
    }

    /// The personalized board: every observed service, worst status first.
    var observedProviders: [Provider] {
        observing.compactMap(provider(for:)).sorted { a, b in
            a.level.severity != b.level.severity
                ? a.level.severity > b.level.severity
                : a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
        }
    }

    var attention: [Provider] { observedProviders.filter { $0.level.needsAttention } }
    var attentionCount: Int { attention.count }

    /// Worst status among observed (ignoring unknown); operational if all clear.
    var worst: Level {
        observedProviders.map(\.level).filter { $0 != .unknown }
            .max(by: { $0.severity < $1.severity }) ?? .operational
    }

    /// Live level for any catalog id (used by the picker once a snapshot exists).
    func level(for id: String) -> Level { snapshot[id]?.level ?? .unknown }
    func snapshotHas(_ id: String) -> Bool { snapshot[id] != nil }

    func isObserving(_ id: String) -> Bool { observing.contains(id) }

    func toggle(_ id: String) {
        if observing.contains(id) { observing.remove(id) } else { observing.insert(id) }
    }

    func open(_ provider: Provider) { NSWorkspace.shared.open(statusURL(for: provider.id)) }
    func open(id: String) { NSWorkspace.shared.open(statusURL(for: id)) }

    func completeOnboarding() { onboarded = true }

    /// Re-run onboarding, keeping current picks (they show pre-selected).
    func replayOnboarding() {
        onboarded = false
        OnboardingController.shared.show()
    }

    /// Wipe everything back to a first-launch state and re-run onboarding.
    func resetAll() {
        observing = []
        notificationsEnabled = true
        interval = 30
        lastLevels = [:]
        snapshot = [:]
        onboarded = false
        OnboardingController.shared.show()
    }

    // MARK: Polling (only while onboarded)

    func startPolling() {
        pollTask?.cancel()
        guard onboarded else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.refresh()
                try? await Task.sleep(for: .seconds(max(15, self.interval)))
            }
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
            let snap = try JSONDecoder().decode(Snapshot.self, from: data)

            // Notify on real transitions for observed services — outages,
            // degradations, maintenance, and recoveries alike. Never on the
            // first sample (no prior level) and never to/from unknown.
            for p in snap.providers where observing.contains(p.id) {
                if let prev = lastLevels[p.id], prev != p.level, prev != .unknown, p.level != .unknown {
                    if notificationsEnabled {
                        NotificationManager.shared.notify(provider: p, to: p.level)
                    }
                }
            }
            for p in snap.providers { lastLevels[p.id] = p.level }

            snapshot = Dictionary(uniqueKeysWithValues: snap.providers.map { ($0.id, $0) })
            if let ms = snap.checkedAt { checkedAt = Date(timeIntervalSince1970: ms / 1000) }
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }
}

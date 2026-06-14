import Foundation

/// The six status levels, mirroring the web app. Decoding is lenient: any
/// unrecognized string becomes `.unknown` (never crash on a new level).
enum Level: String, Codable, CaseIterable {
    case operational, maintenance, degraded, partial_outage, major_outage, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Level(rawValue: raw) ?? .unknown
    }

    var label: String {
        switch self {
        case .operational: return "Operational"
        case .maintenance: return "Maintenance"
        case .degraded: return "Degraded"
        case .partial_outage: return "Partial outage"
        case .major_outage: return "Major outage"
        case .unknown: return "Unknown"
        }
    }

    /// Low → high severity. `unknown` sorts below operational (-1).
    var severity: Int {
        switch self {
        case .unknown: return -1
        case .operational: return 0
        case .maintenance: return 1
        case .degraded: return 2
        case .partial_outage: return 3
        case .major_outage: return 4
        }
    }

    /// Actively unhealthy. `unknown` is neutral and never alarms (no-fake-news).
    var needsAttention: Bool { self != .operational && self != .unknown }
}

struct Incident: Codable, Hashable {
    let name: String
    let url: String?
}

struct Provider: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let category: String
    let level: Level
    let home: String?
    let incident: Incident?
}

struct Snapshot: Codable {
    let updatedAt: String?
    let checkedAt: Double?   // ms since epoch, or null
    let providers: [Provider]
}

/// Display order for the window's "add services" picker (mirrors the web).
let categoryOrder: [String] = [
    "Cloud & hosting", "AI & model providers", "Dev & CI", "Data & backend",
    "Payments", "Comms", "CDN & edge", "Auth & identity", "Collaboration",
    "Monitoring", "Commerce & CMS", "Analytics",
]

/// Commonly-watched services seeded on first run (mirrors POPULAR_IDS).
let defaultObserving: Set<String> = [
    "cloudflare", "aws", "github", "vercel", "openai", "anthropic", "stripe", "slack",
]

func statusURL(for id: String) -> URL {
    URL(string: "https://outage.observer/status/\(id)")!
}

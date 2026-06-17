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
    /// Coarse geos the active incident affects (GCP/AWS); nil/empty = global or
    /// unknown scope. Optional, so providers without it decode fine.
    let regions: [String]?
}

/// Coarse geographies for region-relevant alerting (mirrors the web's regions.ts).
enum Geo: String, CaseIterable, Identifiable {
    case na, sa, eu, apac, me, af, oce
    var id: String { rawValue }
    var label: String {
        switch self {
        case .na: return "North America"
        case .sa: return "South America"
        case .eu: return "Europe"
        case .apac: return "Asia-Pacific"
        case .me: return "Middle East"
        case .af: return "Africa"
        case .oce: return "Oceania"
        }
    }
}

/// Fail-safe: should a user whose chosen geos are `prefs` (empty = everywhere) be
/// notified about an incident affecting `regions`? Mirrors regions.ts shouldAlert:
/// empty prefs, or a global/unknown-scope incident, always notifies.
func shouldNotify(prefs: Set<String>, regions: [String]?) -> Bool {
    if prefs.isEmpty { return true }
    let r = regions ?? []
    if r.isEmpty || r.contains("global") { return true }
    return r.contains(where: { prefs.contains($0) })
}

struct Snapshot: Codable {
    let updatedAt: String?
    let checkedAt: Double?   // ms since epoch, or null
    let providers: [Provider]
}

/// Display order for the pickers (mirrors the web).
let categoryOrder: [String] = [
    "Cloud & hosting", "AI & model providers", "Dev & CI", "Data & backend",
    "Payments", "Comms", "CDN & edge", "Auth & identity", "Collaboration",
    "Monitoring", "Commerce & CMS", "Analytics",
    "Social & community", "Gaming & streaming", "Finance & crypto", "Consumer & lifestyle",
]

/// Static catalog metadata, indexed (live status overlays from /api/status).
let catalogByID: [String: CatalogEntry] = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) })

func catalogEntries(in category: String) -> [CatalogEntry] {
    catalog.filter { $0.category == category }
}

func statusURL(for id: String) -> URL {
    URL(string: "https://outage.observer/status/\(id)")!
}

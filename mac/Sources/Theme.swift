import SwiftUI

extension Color {
    init(hex: UInt) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}

/// Outage Observer design tokens (the dark theme from tokens.css). The app is
/// dark-fixed for brand consistency.
enum Theme {
    static let bgPage = Color(hex: 0x070809)
    static let bgSurface = Color(hex: 0x0C0E11)
    static let bgElevated = Color(hex: 0x15181C)
    static let bgSunken = Color(hex: 0x050607)

    static let textPrimary = Color(hex: 0xECEEF0)
    static let textSecondary = Color(hex: 0x9AA0A6)
    static let textMuted = Color(hex: 0x5C636B)

    static let border = Color(hex: 0x1E2329)
    static let borderStrong = Color(hex: 0x2A3036)
    static let accent = Color(hex: 0x3FCF5E)

    static func status(_ level: Level) -> Color {
        switch level {
        case .operational: return Color(hex: 0x3FCF5E)
        case .maintenance: return Color(hex: 0x5BA8FF)
        case .degraded: return Color(hex: 0xE5B647)
        case .partial_outage: return Color(hex: 0xF0883E)
        case .major_outage: return Color(hex: 0xF0726A)
        case .unknown: return Color(hex: 0x8A93A0)
        }
    }
}

extension Font {
    /// Departure Mono (bundled + registered at launch); falls back gracefully.
    static func mono(_ size: CGFloat) -> Font {
        .custom("Departure Mono", size: size)
    }
}

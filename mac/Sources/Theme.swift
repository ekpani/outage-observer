import SwiftUI
import AppKit

extension Color {
    init(hex: UInt) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}

extension NSColor {
    convenience init(hex: UInt) {
        self.init(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: 1)
    }
}

/// A color that resolves to `light` or `dark` based on the drawing appearance,
/// so a single token adapts to System / Light / Dark automatically.
private func dyn(_ light: UInt, _ dark: UInt) -> Color {
    Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            ? NSColor(hex: dark) : NSColor(hex: light)
    })
}

/// Outage Observer design tokens, adaptive (light + dark) — the same palette as
/// tokens.css. Values follow the app's effective appearance (System by default).
enum Theme {
    static let bgPage     = dyn(0xECEBE7, 0x070809)
    static let bgSurface  = dyn(0xFFFFFF, 0x0C0E11)
    static let bgElevated = dyn(0xFFFFFF, 0x15181C)
    static let bgSunken   = dyn(0xF1F0ED, 0x050607)

    static let textPrimary   = dyn(0x16181B, 0xECEEF0)
    static let textSecondary = dyn(0x5B636E, 0x9AA0A6)
    static let textMuted     = dyn(0x8A929C, 0x5C636B)

    static let border       = dyn(0xE6E7E9, 0x1E2329)
    static let borderStrong = dyn(0xD5D7DA, 0x2A3036)
    static let accent       = dyn(0x1A7F37, 0x3FCF5E)

    static func status(_ level: Level) -> Color {
        switch level {
        case .operational:    return dyn(0x1A7F37, 0x3FCF5E)
        case .maintenance:    return dyn(0x1F6FEB, 0x5BA8FF)
        case .degraded:       return dyn(0x946400, 0xE5B647)
        case .partial_outage: return dyn(0xB14A00, 0xF0883E)
        case .major_outage:   return dyn(0xC0362C, 0xF0726A)
        case .unknown:        return dyn(0x5B636E, 0x8A93A0)
        }
    }
}

extension Font {
    /// Departure Mono (bundled + registered at launch); falls back gracefully.
    static func mono(_ size: CGFloat) -> Font {
        .custom("Departure Mono", size: size)
    }
}

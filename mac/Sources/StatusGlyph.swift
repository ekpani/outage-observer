import SwiftUI

// Colorblind-safe: each status reads as a distinct shape, not just a color
// (mirrors the web glyph set: disc, diamond, bar, half, cross, ring).

private struct Diamond: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.midX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.midY))
        p.addLine(to: CGPoint(x: r.midX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX, y: r.midY))
        p.closeSubpath()
        return p
    }
}

private struct HalfDisc: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        let c = CGPoint(x: r.midX, y: r.midY)
        p.addArc(center: c, radius: r.width / 2, startAngle: .degrees(-90), endAngle: .degrees(90), clockwise: false)
        p.closeSubpath()
        return p
    }
}

private struct Cross: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.move(to: CGPoint(x: r.maxX, y: r.minY)); p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        return p
    }
}

struct StatusGlyph: View {
    let level: Level
    var size: CGFloat = 12

    var body: some View {
        let color = Theme.status(level)
        ZStack {
            switch level {
            case .operational:
                Circle().fill(color)
            case .maintenance:
                Diamond().fill(color)
            case .degraded:
                Capsule().fill(color).frame(height: size * 0.34)
            case .partial_outage:
                Circle().stroke(color, lineWidth: size * 0.14)
                HalfDisc().fill(color)
            case .major_outage:
                Cross().stroke(color, style: StrokeStyle(lineWidth: size * 0.2, lineCap: .round))
                    .padding(size * 0.18)
            case .unknown:
                Circle().stroke(color, lineWidth: size * 0.16)
            }
        }
        .frame(width: size, height: size)
    }
}

/// The aperture brand mark.
struct Aperture: View {
    var size: CGFloat = 22
    var pupil: Color = Theme.accent
    var ring: Color = Theme.textPrimary

    var body: some View {
        ZStack {
            Circle().stroke(ring, lineWidth: max(1.5, size * 0.12))
                .frame(width: size, height: size)
            Circle().stroke(ring.opacity(0.4), lineWidth: max(1.5, size * 0.12))
                .frame(width: size * 0.56, height: size * 0.56)
            Circle().fill(pupil).frame(width: size * 0.26, height: size * 0.26)
        }
        .frame(width: size, height: size)
    }
}

/// Menu-bar icon: monochrome ring that adapts to the bar, pupil tinted by the
/// worst observed status (green when all clear, red when something's down).
struct MenuBarLabel: View {
    let worst: Level
    var body: some View {
        ZStack {
            Circle().stroke(Color.primary, lineWidth: 1.5).frame(width: 14, height: 14)
            Circle().fill(Theme.status(worst)).frame(width: 6, height: 6)
        }
        .frame(width: 18, height: 18)
    }
}

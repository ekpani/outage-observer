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

/// A continuously-rotating radar sweep with concentric scope rings and the
/// aperture at center — the site's radar motif. Rotates linearly forever (no
/// boomerang / auto-reverse). Used as the onboarding hero.
struct RadarView: View {
    var size: CGFloat = 168

    var body: some View {
        // Drawn in a Canvas so the rings, the sweep's conic-gradient center, and
        // the aperture all pivot on the EXACT same point — no anchor drift.
        TimelineView(.animation) { timeline in
            Canvas { ctx, sz in
                let c = CGPoint(x: sz.width / 2, y: sz.height / 2)
                let maxR = min(sz.width, sz.height) / 2

                // Concentric scope rings (inner brighter, like the site).
                for i in 1...4 {
                    let r = maxR * CGFloat(i) / 4
                    let rect = CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)
                    ctx.stroke(Path(ellipseIn: rect),
                               with: .color(Theme.accent.opacity(0.05 + Double(4 - i) * 0.035)),
                               lineWidth: 1)
                }

                // The sweep: a conic gradient centered exactly on c, its start
                // angle advanced by wall-clock time → continuous rotation.
                let deg = (timeline.date.timeIntervalSinceReferenceDate / 7)
                    .truncatingRemainder(dividingBy: 1) * 360
                let grad = Gradient(stops: [
                    .init(color: Theme.accent.opacity(0.34), location: 0.0),
                    .init(color: Theme.accent.opacity(0.06), location: 0.10),
                    .init(color: .clear, location: 0.30),
                    .init(color: .clear, location: 1.0),
                ])
                let disc = Path(ellipseIn: CGRect(x: c.x - maxR, y: c.y - maxR, width: 2 * maxR, height: 2 * maxR))
                ctx.clip(to: disc)
                ctx.fill(Path(CGRect(origin: .zero, size: sz)),
                         with: .conicGradient(grad, center: c, angle: .degrees(deg)))
            }
            .frame(width: size, height: size)
            .overlay {
                Aperture(size: size * 0.34)
                    .shadow(color: Theme.accent.opacity(0.4), radius: 12)
            }
        }
        .frame(width: size, height: size)
    }
}

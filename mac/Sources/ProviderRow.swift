import SwiftUI

/// A board row. On the menu-bar board, services needing attention get a colored
/// leading accent + tint so problems read instantly.
struct ProviderRow: View {
    let provider: Provider
    var showToggle: Bool = false
    var observing: Bool = false
    var liveLevel: Level? = nil      // for the picker, when a snapshot exists
    var onToggle: (() -> Void)? = nil
    var onOpen: (() -> Void)? = nil

    @State private var hovering = false

    private var attention: Bool { provider.level.needsAttention }

    var body: some View {
        HStack(spacing: 10) {
            StatusGlyph(level: showToggle ? (liveLevel ?? .unknown) : provider.level, size: 11)
                .opacity(showToggle && liveLevel == nil ? 0.0 : 1.0)
                .overlay(alignment: .center) {
                    if showToggle && liveLevel == nil {
                        Circle().fill(Theme.textMuted.opacity(0.4)).frame(width: 5, height: 5)
                    }
                }

            Text(provider.name)
                .font(.mono(13))
                .foregroundStyle(Theme.textPrimary)
                .lineLimit(1)

            Spacer(minLength: 8)

            if showToggle {
                Image(systemName: observing ? "checkmark.circle.fill" : "plus.circle")
                    .font(.system(size: 14))
                    .foregroundStyle(observing ? Theme.accent : Theme.textMuted)
            } else {
                if let inc = provider.incident?.name, attention {
                    Text(inc).font(.system(size: 11)).foregroundStyle(Theme.textSecondary).lineLimit(1)
                }
                Text(provider.level.label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.status(provider.level))
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 8)
        .background(rowBackground)
        .overlay(alignment: .leading) {
            if attention && !showToggle {
                Rectangle().fill(Theme.status(provider.level)).frame(width: 2.5)
            }
        }
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .onTapGesture { (showToggle ? onToggle : onOpen)?() }
    }

    private var rowBackground: some View {
        let tint = attention && !showToggle
            ? Theme.status(provider.level).opacity(0.08)
            : Color.clear
        return ZStack {
            tint
            if hovering { Theme.bgElevated.opacity(0.6) }
        }
    }
}

import SwiftUI

struct ProviderRow: View {
    let provider: Provider
    var showToggle: Bool = false
    var observing: Bool = false
    var onToggle: (() -> Void)? = nil
    var onOpen: (() -> Void)? = nil

    @State private var hovering = false

    var body: some View {
        HStack(spacing: 10) {
            StatusGlyph(level: provider.level, size: 11)
            Text(provider.name)
                .font(.mono(13))
                .foregroundStyle(Theme.textPrimary)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(provider.level.label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Theme.status(provider.level))
                .lineLimit(1)
            if showToggle {
                Button(action: { onToggle?() }) {
                    Image(systemName: observing ? "star.fill" : "plus")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(observing ? Theme.accent : Theme.textMuted)
                        .frame(width: 20, height: 20)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(hovering ? Theme.bgElevated : Color.clear)
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .onTapGesture { onOpen?() }
    }
}

import SwiftUI

/// The menu-bar popover — the primary surface. Once onboarded it IS your board:
/// every service you observe, problems pinned to the top.
/// Measures the board's natural content height so the scroll frame fits exactly.
private struct BoardHeightKey: PreferenceKey {
    static var defaultValue: CGFloat { 0 }
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

struct MenuContentView: View {
    @EnvironmentObject var store: StatusStore
    @Environment(\.openWindow) private var openWindow
    @State private var boardHeight: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(Theme.border)
            if store.onboarded {
                statusLine
                Divider().overlay(Theme.border)
                board
                Divider().overlay(Theme.border)
                footer
            } else {
                setupPrompt
            }
        }
        .frame(width: 320)
        .background(Theme.bgSurface)
        .preferredColorScheme(.dark)
        .onAppear { if store.onboarded { Task { await store.refresh() } } }   // always fresh on open
    }

    private var header: some View {
        HStack(spacing: 9) {
            Aperture(size: 18)
            Text("outage.observer").font(.mono(13)).foregroundStyle(Theme.textSecondary)
            Spacer()
            if store.onboarded {
                iconButton("arrow.clockwise") { Task { await store.refresh() } }.help("Refresh now")
                iconButton("plus") { openMain() }.help("Add or remove services")
                settingsButton.help("Settings")
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }

    // A single honest line: green when all clear, the worst color otherwise.
    private var statusLine: some View {
        let n = store.attentionCount
        return HStack(spacing: 9) {
            StatusGlyph(level: n == 0 ? .operational : store.worst, size: 11)
            Text(n == 0 ? "All clear" : "\(n) need\(n == 1 ? "s" : "") attention")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(n == 0 ? Theme.textSecondary : Theme.status(store.worst))
            Spacer()
            Text(checkedText).font(.mono(10)).foregroundStyle(Theme.textMuted)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
    }

    @ViewBuilder private var board: some View {
        if store.observedProviders.isEmpty {
            VStack(spacing: 8) {
                Text("Nothing to watch yet").font(.mono(12)).foregroundStyle(Theme.textMuted)
                Button("Add services") { openMain() }
                    .buttonStyle(.plain).foregroundStyle(Theme.accent).font(.mono(12))
            }
            .frame(maxWidth: .infinity).padding(.vertical, 24)
        } else {
            // A ScrollView has no intrinsic height; inside the self-sizing
            // MenuBarExtra window it collapses to 0 (rows vanish). So measure the
            // rows' real height and pin the frame to exactly that, capped so long
            // lists scroll. (A fixed per-row estimate left a gap above the footer.)
            let cap: CGFloat = 396
            let estimate = min(CGFloat(store.observedProviders.count) * 34, cap)
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(store.observedProviders) { p in
                        ProviderRow(provider: p, onOpen: { store.open(p) })
                    }
                }
                .background(GeometryReader { g in
                    Color.clear.preference(key: BoardHeightKey.self, value: g.size.height)
                })
            }
            .frame(height: min(boardHeight > 0 ? boardHeight : estimate, cap))
            .onPreferenceChange(BoardHeightKey.self) { boardHeight = $0 }
        }
    }

    private var footer: some View {
        HStack {
            Spacer()
            Button("Quit") { NSApp.terminate(nil) }
                .buttonStyle(.plain).font(.mono(11)).foregroundStyle(Theme.textMuted)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
    }

    private var setupPrompt: some View {
        VStack(spacing: 12) {
            Text("Finish setup to choose what to watch.")
                .font(.mono(12)).foregroundStyle(Theme.textSecondary).multilineTextAlignment(.center)
            Button("Get started") { OnboardingController.shared.show() }
                .buttonStyle(.plain)
                .font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.bgPage)
                .padding(.horizontal, 18).padding(.vertical, 9)
                .background(RoundedRectangle(cornerRadius: 9).fill(Theme.accent))
            Button("Quit") { NSApp.terminate(nil) }
                .buttonStyle(.plain).font(.mono(10)).foregroundStyle(Theme.textMuted)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 26).padding(.horizontal, 18)
    }

    private var settingsButton: some View {
        SettingsLink {
            Image(systemName: "gearshape").font(.system(size: 12)).foregroundStyle(Theme.textMuted).frame(width: 22, height: 22)
        }
        .buttonStyle(.plain)
    }

    private var checkedText: String {
        guard let d = store.checkedAt else { return store.loading ? "checking…" : "—" }
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        f.timeZone = TimeZone(identifier: "UTC")
        return "checked \(f.string(from: d)) UTC"
    }

    private func iconButton(_ name: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: name).font(.system(size: 12)).foregroundStyle(Theme.textMuted).frame(width: 22, height: 22)
        }
        .buttonStyle(.plain)
    }

    private func openMain() {
        openWindow(id: "main")
        NSApp.activate(ignoringOtherApps: true)
    }
}

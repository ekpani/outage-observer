import SwiftUI

let popoverWidth: CGFloat = 340

/// Measures the board's natural content height so the scroll frame fits exactly.
private struct BoardHeightKey: PreferenceKey {
    static var defaultValue: CGFloat { 0 }
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

/// The single surface. Everything is a route inside this popover — no windows.
struct MenuContentView: View {
    @EnvironmentObject var store: StatusStore
    @State private var boardHeight: CGFloat = 0

    var body: some View {
        Group {
            if !store.onboarded {
                OnboardingView()
            } else {
                switch store.route {
                case .board: boardScreen
                case .browse: BrowseView()
                case .settings: SettingsScreen()
                }
            }
        }
        .frame(width: popoverWidth)
        .background(Theme.bgSurface)
        .preferredColorScheme(.dark)
        .onAppear { if store.onboarded { Task { await store.refresh() } } }
    }

    // MARK: Board route

    private var boardScreen: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(Theme.border)
            statusLine
            Divider().overlay(Theme.border)
            board
            Divider().overlay(Theme.border)
            footer
        }
    }

    private var header: some View {
        HStack(spacing: 9) {
            Aperture(size: 18)
            Text("outage.observer").font(.mono(13)).foregroundStyle(Theme.textSecondary)
            Spacer()
            iconButton("arrow.clockwise") { Task { await store.refresh() } }.help("Refresh now")
            iconButton("plus") { go(.browse) }.help("Add or remove services")
            iconButton("gearshape") { go(.settings) }.help("Settings")
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }

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
            VStack(spacing: 10) {
                Text("Nothing to watch yet").font(.mono(12)).foregroundStyle(Theme.textMuted)
                Button("Add services") { go(.browse) }
                    .buttonStyle(.plain).foregroundStyle(Theme.accent).font(.mono(12))
            }
            .frame(maxWidth: .infinity).padding(.vertical, 26)
        } else {
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

    private func go(_ r: AppRoute) {
        withAnimation(.easeOut(duration: 0.15)) { store.route = r }
    }
}

// MARK: - Shared in-popover chrome

/// A back-button header used by the browse and settings routes.
struct RouteHeader: View {
    @EnvironmentObject var store: StatusStore
    let title: String

    var body: some View {
        HStack(spacing: 8) {
            Button { withAnimation(.easeOut(duration: 0.15)) { store.route = .board } } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left").font(.system(size: 12, weight: .semibold))
                    Text("Board").font(.mono(11))
                }
                .foregroundStyle(Theme.textSecondary)
            }
            .buttonStyle(.plain)
            Spacer()
            Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.textPrimary)
            Spacer()
            // Spacer balance so the title stays centered.
            HStack(spacing: 4) { Image(systemName: "chevron.left"); Text("Board").font(.mono(11)) }
                .opacity(0).accessibilityHidden(true)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }
}

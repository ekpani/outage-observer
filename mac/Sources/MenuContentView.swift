import SwiftUI

/// The menu-bar popover — the primary surface.
struct MenuContentView: View {
    @EnvironmentObject var store: StatusStore
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(Theme.border)
            summary
            Divider().overlay(Theme.border)
            list
            Divider().overlay(Theme.border)
            footer
        }
        .frame(width: 320)
        .background(Theme.bgSurface)
        .preferredColorScheme(.dark)
    }

    private var header: some View {
        HStack(spacing: 9) {
            Aperture(size: 18)
            Text("outage.observer").font(.mono(13)).foregroundStyle(Theme.textSecondary)
            Spacer()
            iconButton("arrow.clockwise") { Task { await store.refresh() } }
            iconButton("gearshape") { openSettings() }
            iconButton("macwindow") { openMain() }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }

    private var summary: some View {
        let n = store.attentionCount
        return HStack(spacing: 11) {
            StatusGlyph(level: n == 0 ? .operational : store.worst, size: 14)
            VStack(alignment: .leading, spacing: 2) {
                Text(n == 0 ? "All systems normal" : "\(n) need\(n == 1 ? "s" : "") attention")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Text(checkedText).font(.mono(10)).foregroundStyle(Theme.textMuted)
            }
            Spacer()
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }

    @ViewBuilder private var list: some View {
        if store.observedProviders.isEmpty {
            VStack(spacing: 8) {
                Text("Not observing anything yet").font(.mono(12)).foregroundStyle(Theme.textMuted)
                Button("Add services") { openMain() }
                    .buttonStyle(.plain).foregroundStyle(Theme.accent).font(.mono(12))
            }
            .frame(maxWidth: .infinity).padding(.vertical, 22)
        } else {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(store.observedProviders) { p in
                        ProviderRow(provider: p, onOpen: { store.open(p) })
                    }
                }
            }
            .frame(maxHeight: 340)
        }
    }

    private var footer: some View {
        HStack(spacing: 14) {
            Button("Open board") { NSWorkspace.shared.open(URL(string: "https://outage.observer")!) }
                .buttonStyle(.plain).font(.mono(11)).foregroundStyle(Theme.textSecondary)
            Button("Manage…") { openMain() }
                .buttonStyle(.plain).font(.mono(11)).foregroundStyle(Theme.textSecondary)
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

    private func openMain() {
        openWindow(id: "main")
        NSApp.activate(ignoringOtherApps: true)
    }

    private func openSettings() {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }
}

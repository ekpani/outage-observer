import SwiftUI

/// The full window: what you're observing, plus the whole catalog to add from.
struct BoardWindowView: View {
    @EnvironmentObject var store: StatusStore
    @State private var query = ""

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(Theme.border)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    observingSection
                    addSection
                }
                .padding(.bottom, 16)
            }
        }
        .background(Theme.bgPage)
        .preferredColorScheme(.dark)
    }

    private var header: some View {
        HStack(spacing: 11) {
            Aperture(size: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text("Outage Observer").font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.textPrimary)
                Text(store.attentionCount == 0 ? "all clear" : "\(store.attentionCount) need attention")
                    .font(.mono(10)).foregroundStyle(Theme.textMuted)
            }
            Spacer()
            TextField("Search…", text: $query)
                .textFieldStyle(.plain).font(.mono(12)).foregroundStyle(Theme.textPrimary)
                .padding(.horizontal, 9).padding(.vertical, 5)
                .background(Theme.bgSunken).clipShape(RoundedRectangle(cornerRadius: 6))
                .frame(width: 150)
            Button { Task { await store.refresh() } } label: {
                Image(systemName: "arrow.clockwise").foregroundStyle(Theme.textMuted)
            }
            .buttonStyle(.plain)
        }
        .padding(14)
    }

    @ViewBuilder private var observingSection: some View {
        if query.isEmpty && !store.observedProviders.isEmpty {
            sectionHeader("Observing", store.observedProviders.count)
            ForEach(store.observedProviders) { p in
                ProviderRow(provider: p, showToggle: true, observing: true,
                            onToggle: { store.toggle(p.id) }, onOpen: { store.open(p) })
            }
        }
    }

    private var addSection: some View {
        ForEach(categoryOrder, id: \.self) { cat in
            let items = filtered(cat)
            if !items.isEmpty {
                sectionHeader(cat, items.count)
                ForEach(items) { p in
                    ProviderRow(provider: p, showToggle: true, observing: store.isObserving(p.id),
                                onToggle: { store.toggle(p.id) }, onOpen: { store.open(p) })
                }
            }
        }
    }

    private func filtered(_ cat: String) -> [Provider] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return store.providers.filter { $0.category == cat && (q.isEmpty || $0.name.lowercased().contains(q)) }
    }

    private func sectionHeader(_ title: String, _ count: Int) -> some View {
        HStack(spacing: 8) {
            Text(title.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(1.2).foregroundStyle(Theme.textSecondary)
            Text("\(count)").font(.mono(10)).foregroundStyle(Theme.textMuted)
            Spacer()
        }
        .padding(.horizontal, 14).padding(.top, 16).padding(.bottom, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.bgSunken)
    }
}

import SwiftUI

/// Add/remove services, in the popover. Catalog-backed (instant); live status
/// overlays from the snapshot when available.
struct BrowseView: View {
    @EnvironmentObject var store: StatusStore
    @State private var query = ""

    private var results: [CatalogEntry] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return [] }
        return store.liveCatalog.filter { $0.name.lowercased().contains(q) || $0.id.contains(q) }
    }

    var body: some View {
        VStack(spacing: 0) {
            RouteHeader(title: "Add services")
            Divider().overlay(Theme.border)
            searchField.padding(.horizontal, 12).padding(.vertical, 10)
            Divider().overlay(Theme.border)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if query.isEmpty {
                        if !store.observing.isEmpty {
                            section("Observing", store.observing.count)
                            ForEach(observingEntries) { row($0) }
                        }
                        section("Popular", popularIDs.count)
                        ForEach(popularIDs.compactMap { store.catalogEntry(for: $0) }) { row($0) }
                        ForEach(store.liveCategories, id: \.self) { cat in
                            let items = store.catalogIn(cat)
                            if !items.isEmpty {
                                section(cat, items.count)
                                ForEach(items) { row($0) }
                            }
                        }
                    } else if results.isEmpty {
                        Text("No matches for “\(query)”.")
                            .font(.mono(12)).foregroundStyle(Theme.textMuted)
                            .padding(.horizontal, 14).padding(.top, 20)
                    } else {
                        ForEach(results) { row($0) }.padding(.top, 6)
                    }
                }
                .padding(.bottom, 8)
            }
            .frame(height: 392)

            Divider().overlay(Theme.border)
            footer
        }
    }

    private var observingEntries: [CatalogEntry] {
        store.observing.compactMap { store.catalogEntry(for: $0) }.sorted { $0.name < $1.name }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 12)).foregroundStyle(Theme.textMuted)
            TextField("Search \(store.liveCatalog.count) services…", text: $query)
                .textFieldStyle(.plain).font(.mono(12)).foregroundStyle(Theme.textPrimary)
        }
        .padding(.horizontal, 11).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 8).fill(Theme.bgSunken))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))
    }

    private func section(_ title: String, _ count: Int) -> some View {
        HStack(spacing: 8) {
            Text(title.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(1.1).foregroundStyle(Theme.textSecondary)
            Text("\(count)").font(.mono(10)).foregroundStyle(Theme.textMuted)
            Spacer()
        }
        .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.bgSunken)
    }

    private func row(_ e: CatalogEntry) -> some View {
        let p = Provider(id: e.id, name: e.name, category: e.category,
                         level: store.level(for: e.id), home: nil, incident: nil, regions: nil)
        return ProviderRow(provider: p, showToggle: true, observing: store.isObserving(e.id),
                           liveLevel: store.snapshotHas(e.id) ? store.level(for: e.id) : nil,
                           onToggle: { store.toggle(e.id) }, onOpen: { store.open(id: e.id) })
    }

    private var footer: some View {
        HStack {
            Text("\(store.observing.count) watched").font(.mono(11)).foregroundStyle(Theme.textMuted)
            Spacer()
            Button("Done") { withAnimation(.easeOut(duration: 0.15)) { store.route = .board } }
                .buttonStyle(.plain).font(.mono(12)).foregroundStyle(Theme.accent)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
    }
}

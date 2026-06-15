import SwiftUI

/// First-run flow. Three deliberate steps: welcome, choose what to watch
/// (required — the app only tracks what you pick here), and turn on the bits
/// that make it set-and-forget. Crafted, unhurried, no settings dumped on you.
struct OnboardingView: View {
    @EnvironmentObject var store: StatusStore

    private var step: Int { store.onboardingStep }   // held on the store, survives popover dismiss

    var body: some View {
        ZStack {
            Theme.bgPage
            // A soft beacon glow, echoing the web radar — atmosphere, not noise.
            RadialGradient(colors: [Theme.accent.opacity(0.10), .clear],
                           center: .top, startRadius: 0, endRadius: 300)

            VStack(spacing: 0) {
                progressDots
                Group {
                    switch step {
                    case 0: WelcomeStep(onContinue: { go(1) })
                    case 1: ChooseStep(onBack: { go(0) }, onContinue: { go(2) })
                    default: ReadyStep(onBack: { go(1) }, onFinish: finish)
                    }
                }
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing).combined(with: .opacity),
                    removal: .move(edge: .leading).combined(with: .opacity)))
            }
        }
        .frame(height: 560)
    }

    private var progressDots: some View {
        HStack(spacing: 7) {
            ForEach(0..<3, id: \.self) { i in
                Capsule()
                    .fill(i == step ? Theme.accent : Theme.borderStrong)
                    .frame(width: i == step ? 20 : 6, height: 6)
                    .animation(.spring(response: 0.4, dampingFraction: 0.8), value: step)
            }
        }
        .padding(.top, 18)
    }

    private func go(_ s: Int) {
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { store.onboardingStep = s }
    }

    private func finish() {
        store.completeOnboarding()
    }
}

// MARK: - Step 1: Welcome

private struct WelcomeStep: View {
    var onContinue: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            RadarView(size: 132).padding(.top, 24)
            Text("Outage Observer")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
                .padding(.top, 18)
            Text("Know the moment your stack breaks.")
                .font(.mono(12)).foregroundStyle(Theme.textSecondary)
                .padding(.top, 7)

            VStack(alignment: .leading, spacing: 14) {
                point("scope", "A quiet reticle in your menu bar", "glows amber or red when something you watch has trouble")
                point("bell.badge", "A notification the instant it happens", "no dashboards, no refreshing")
                point("moon.stars", "Silence the rest of the time", "you only hear from it when it matters")
            }
            .padding(.top, 28).padding(.horizontal, 28)

            Spacer(minLength: 12)
            PrimaryButton(title: "Get started", action: onContinue)
                .padding(.horizontal, 28).padding(.bottom, 28)
        }
    }

    private func point(_ icon: String, _ title: String, _ sub: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon).font(.system(size: 15)).foregroundStyle(Theme.accent)
                .frame(width: 24, height: 22)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 13.5, weight: .medium)).foregroundStyle(Theme.textPrimary)
                Text(sub).font(.system(size: 11.5)).foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Step 2: Choose what to watch (required)

private struct ChooseStep: View {
    @EnvironmentObject var store: StatusStore
    var onBack: () -> Void
    var onContinue: () -> Void
    @State private var query = ""

    private var results: [CatalogEntry] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return [] }
        return catalog.filter { $0.name.lowercased().contains(q) || $0.id.contains(q) }
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 6) {
                Text("What do you depend on?")
                    .font(.system(size: 20, weight: .semibold)).foregroundStyle(Theme.textPrimary)
                Text("Pick the services you run on. Outage Observer\nwatches just these and ignores the rest.")
                    .font(.mono(11)).foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center).lineSpacing(2)
            }
            .padding(.top, 22).padding(.horizontal, 24)

            searchField.padding(.horizontal, 24).padding(.top, 16)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if query.isEmpty {
                        sectionLabel("Popular")
                        FlowChips(ids: popularIDs)
                            .padding(.horizontal, 30).padding(.bottom, 6)
                        ForEach(categoryOrder, id: \.self) { cat in
                            let items = catalogEntries(in: cat)
                            if !items.isEmpty {
                                sectionLabel(cat)
                                ForEach(items) { e in pickRow(e) }
                            }
                        }
                    } else if results.isEmpty {
                        Text("No matches for “\(query)”.")
                            .font(.mono(12)).foregroundStyle(Theme.textMuted)
                            .padding(.horizontal, 36).padding(.top, 24)
                    } else {
                        ForEach(results) { e in pickRow(e) }
                            .padding(.top, 8)
                    }
                }
                .padding(.bottom, 8)
            }
            .padding(.top, 10)

            footer
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 12)).foregroundStyle(Theme.textMuted)
            TextField("Search 106 services…", text: $query)
                .textFieldStyle(.plain).font(.mono(12)).foregroundStyle(Theme.textPrimary)
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 8).fill(Theme.bgSunken))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))
    }

    private func sectionLabel(_ s: String) -> some View {
        Text(s.uppercased())
            .font(.system(size: 10, weight: .semibold)).tracking(1.2)
            .foregroundStyle(Theme.textSecondary)
            .padding(.horizontal, 24).padding(.top, 16).padding(.bottom, 6)
    }

    private func pickRow(_ e: CatalogEntry) -> some View {
        let on = store.isObserving(e.id)
        return Button { withAnimation(.easeOut(duration: 0.12)) { store.toggle(e.id) } } label: {
            HStack(spacing: 11) {
                Image(systemName: on ? "checkmark.circle.fill" : "plus.circle")
                    .font(.system(size: 15)).foregroundStyle(on ? Theme.accent : Theme.textMuted)
                Text(e.name).font(.mono(13)).foregroundStyle(Theme.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 24).padding(.vertical, 7)
            .background(on ? Theme.accent.opacity(0.06) : .clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Button(action: onBack) {
                Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.textSecondary).frame(width: 42, height: 42)
                    .background(RoundedRectangle(cornerRadius: 9).stroke(Theme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)

            PrimaryButton(title: store.observing.isEmpty ? "Choose at least one" : "Continue · \(store.observing.count)",
                          action: onContinue, disabled: store.observing.isEmpty)
        }
        .padding(.horizontal, 24).padding(.vertical, 14)
        .background(Theme.bgPage.shadow(.drop(color: .black.opacity(0.3), radius: 8, y: -4)))
    }
}

/// Wrapping "popular" quick-add chips.
private struct FlowChips: View {
    @EnvironmentObject var store: StatusStore
    let ids: [String]

    var body: some View {
        let entries = ids.compactMap { catalogByID[$0] }
        FlexWrap(spacing: 8, lineSpacing: 8) {
            ForEach(entries) { e in
                let on = store.isObserving(e.id)
                Button { withAnimation(.easeOut(duration: 0.12)) { store.toggle(e.id) } } label: {
                    HStack(spacing: 6) {
                        Image(systemName: on ? "checkmark" : "plus").font(.system(size: 10, weight: .bold))
                        Text(e.name).font(.mono(12))
                    }
                    .foregroundStyle(on ? Theme.accent : Theme.textSecondary)
                    .padding(.horizontal, 11).padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 999).fill(on ? Theme.accent.opacity(0.12) : Theme.bgElevated))
                    .overlay(RoundedRectangle(cornerRadius: 999).stroke(on ? Theme.accent.opacity(0.5) : Theme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Step 3: Ready (notifications + launch at login)

private struct ReadyStep: View {
    @EnvironmentObject var store: StatusStore
    var onBack: () -> Void
    var onFinish: () -> Void

    @StateObject private var launch = LaunchAtLogin()
    @State private var notifGranted = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            Aperture(size: 50)
            Text("Set it, forget it")
                .font(.system(size: 21, weight: .semibold)).foregroundStyle(Theme.textPrimary)
                .padding(.top, 20)
            Text("Two switches and you'll never babysit a status page again.")
                .font(.mono(11)).foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center).padding(.top, 8).padding(.horizontal, 28)

            VStack(spacing: 12) {
                toggleCard(icon: "bell.badge.fill", on: notifGranted,
                           title: notifGranted ? "Notifications on" : "Enable notifications",
                           sub: "The whole point — a ping the moment a service changes") {
                    guard !notifGranted else { return }
                    NotificationManager.shared.requestAuthorization { notifGranted = $0 }
                }
                toggleCard(icon: "power", on: launch.enabled,
                           title: launch.enabled ? "Launches at login" : "Launch at login",
                           sub: "So it's always watching, quietly in the background") {
                    launch.enabled.toggle()
                }
            }
            .padding(.top, 28).padding(.horizontal, 28)

            Spacer()
            HStack(spacing: 12) {
                Button(action: onBack) {
                    Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.textSecondary).frame(width: 42, height: 42)
                        .background(RoundedRectangle(cornerRadius: 9).stroke(Theme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                PrimaryButton(title: "Start watching · \(store.observing.count)", action: onFinish)
            }
            .padding(.horizontal, 28).padding(.bottom, 32)
        }
        .onAppear { NotificationManager.shared.isAuthorized { notifGranted = $0 } }
    }

    private func toggleCard(icon: String, on: Bool, title: String, sub: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 13) {
                Image(systemName: icon).font(.system(size: 16))
                    .foregroundStyle(on ? Theme.accent : Theme.textMuted).frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.textPrimary)
                    Text(sub).font(.system(size: 11)).foregroundStyle(Theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18)).foregroundStyle(on ? Theme.accent : Theme.textMuted)
            }
            .padding(.horizontal, 14).padding(.vertical, 13)
            .background(RoundedRectangle(cornerRadius: 12).fill(Theme.bgSurface))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(on ? Theme.accent.opacity(0.5) : Theme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Shared

private struct PrimaryButton: View {
    let title: String
    let action: () -> Void
    var disabled: Bool = false

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(disabled ? Theme.textMuted : Theme.bgPage)
                .frame(maxWidth: .infinity).frame(height: 44)
                .background(RoundedRectangle(cornerRadius: 10).fill(disabled ? Theme.bgElevated : Theme.accent))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }
}

/// Minimal wrapping layout for the chip row.
private struct FlexWrap: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? 360
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > maxWidth, x > 0 { x = 0; y += rowHeight + lineSpacing; rowHeight = 0 }
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
        return CGSize(width: maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowHeight + lineSpacing; rowHeight = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
    }
}

import SwiftUI

/// Settings, in the popover. Compact rows instead of a macOS Settings window.
struct SettingsScreen: View {
    @EnvironmentObject var store: StatusStore
    @StateObject private var launch = LaunchAtLogin()
    @State private var confirmReset = false

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    var body: some View {
        VStack(spacing: 0) {
            RouteHeader(title: "Settings")
            Divider().overlay(Theme.border)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    group("Alerts")
                    toggleRow("Notify on status changes", isOn: $store.notificationsEnabled)
                    toggleRow("Launch at login", isOn: $launch.enabled)

                    group("Refresh")
                    HStack {
                        Text("Check every").font(.system(size: 13)).foregroundStyle(Theme.textPrimary)
                        Spacer()
                        Picker("", selection: $store.interval) {
                            Text("30s").tag(30.0); Text("1m").tag(60.0); Text("5m").tag(300.0)
                        }
                        .labelsHidden().frame(width: 80)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 9)

                    group("Appearance")
                    HStack {
                        Text("Theme").font(.system(size: 13)).foregroundStyle(Theme.textPrimary)
                        Spacer()
                        Picker("", selection: $store.appearance) {
                            Text("System").tag(Appearance.system)
                            Text("Light").tag(Appearance.light)
                            Text("Dark").tag(Appearance.dark)
                        }
                        .labelsHidden().frame(width: 110)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 9)

                    group("Setup")
                    tapRow("Replay onboarding") { store.replayOnboarding() }
                    tapRow("Reset app…", destructive: true) { confirmReset = true }

                    group("About")
                    infoRow("Version", appVersion)
                    linkRow("outage.observer", "https://outage.observer")
                    linkRow("Source on GitHub", "https://github.com/ekpani/outage-observer")
                }
                .padding(.bottom, 8)
            }
            .frame(maxHeight: 420)

            Divider().overlay(Theme.border)
            HStack {
                Spacer()
                Button("Quit") { NSApp.terminate(nil) }
                    .buttonStyle(.plain).font(.mono(11)).foregroundStyle(Theme.textMuted)
            }
            .padding(.horizontal, 14).padding(.vertical, 9)
        }
        .confirmationDialog("Reset Outage Observer?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Reset everything", role: .destructive) { store.resetAll() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Clears the services you watch and your preferences, then restarts onboarding.")
        }
    }

    private func group(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.system(size: 10, weight: .semibold)).tracking(1.1).foregroundStyle(Theme.textSecondary)
            .padding(.horizontal, 14).padding(.top, 16).padding(.bottom, 5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.bgSunken)
    }

    private func toggleRow(_ label: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            Text(label).font(.system(size: 13)).foregroundStyle(Theme.textPrimary)
        }
        .toggleStyle(.switch).tint(Theme.accent)
        .padding(.horizontal, 14).padding(.vertical, 8)
    }

    private func tapRow(_ label: String, destructive: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(label).font(.system(size: 13))
                    .foregroundStyle(destructive ? Theme.status(.major_outage) : Theme.accent)
                Spacer()
            }
            .padding(.horizontal, 14).padding(.vertical, 9).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func infoRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.system(size: 13)).foregroundStyle(Theme.textPrimary)
            Spacer()
            Text(value).font(.mono(12)).foregroundStyle(Theme.textMuted)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
    }

    private func linkRow(_ label: String, _ url: String) -> some View {
        Button { NSWorkspace.shared.open(URL(string: url)!) } label: {
            HStack {
                Text(label).font(.system(size: 13)).foregroundStyle(Theme.accent)
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 10)).foregroundStyle(Theme.textMuted)
            }
            .padding(.horizontal, 14).padding(.vertical, 9).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var store: StatusStore
    @StateObject private var launch = LaunchAtLogin()
    @State private var confirmReset = false

    var body: some View {
        Form {
            Section {
                Toggle("Launch at login", isOn: $launch.enabled)
                Toggle("Notify on status changes", isOn: $store.notificationsEnabled)
            }
            Section("Refresh") {
                Picker("Check every", selection: $store.interval) {
                    Text("30 seconds").tag(30.0)
                    Text("1 minute").tag(60.0)
                    Text("5 minutes").tag(300.0)
                }
            }
            Section("Setup") {
                Button("Replay onboarding…") { store.replayOnboarding() }
                Button("Reset app…", role: .destructive) { confirmReset = true }
                    .confirmationDialog("Reset Outage Observer?",
                                        isPresented: $confirmReset, titleVisibility: .visible) {
                        Button("Reset everything", role: .destructive) { store.resetAll() }
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text("Clears the services you watch and your preferences, then restarts onboarding.")
                    }
            }
            Section("About") {
                LabeledContent("Version", value: appVersion)
                Link("outage.observer", destination: URL(string: "https://outage.observer")!)
                Link("Source on GitHub", destination: URL(string: "https://github.com/ekpani/outage-observer")!)
            }
        }
        .formStyle(.grouped)
        .frame(width: 380, height: 340)
        .preferredColorScheme(.dark)
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }
}

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var store: StatusStore
    @StateObject private var launch = LaunchAtLogin()

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

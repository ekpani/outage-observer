import SwiftUI

/// First-run welcome. "Set it and forget it": two taps for notifications +
/// launch at login, and you're already observing a sensible default set.
struct OnboardingView: View {
    @EnvironmentObject var store: StatusStore
    var onDone: () -> Void

    @StateObject private var launch = LaunchAtLogin()
    @State private var notifGranted = false
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 0) {
            hero
            steps
            Spacer(minLength: 18)
            actions
            footer
        }
        .frame(width: 440, height: 580)
        .background(Theme.bgPage)
        .preferredColorScheme(.dark)
        .onAppear {
            pulse = true
            NotificationManager.shared.isAuthorized { notifGranted = $0 }
        }
    }

    private var hero: some View {
        VStack(spacing: 14) {
            Aperture(size: 58)
                .scaleEffect(pulse ? 1.0 : 0.9)
                .animation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true), value: pulse)
            Text("Outage Observer")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
            Text("Live status of the services you run on, right in your menu bar.")
                .font(.mono(12))
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
        }
        .padding(.top, 44).padding(.bottom, 26)
    }

    private var steps: some View {
        VStack(alignment: .leading, spacing: 15) {
            step("scope", "A reticle in your menu bar glows amber or red when something you watch has trouble.")
            step("bell.badge", "A notification the moment a service changes state.")
            step("moon.stars", "Quiet the rest of the time.")
        }
        .padding(.horizontal, 38)
    }

    private func step(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).font(.system(size: 14)).foregroundStyle(Theme.accent).frame(width: 22)
            Text(text).font(.system(size: 12.5)).foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
    }

    private var actions: some View {
        VStack(spacing: 10) {
            actionRow(on: notifGranted,
                      title: notifGranted ? "Notifications on" : "Enable notifications",
                      subtitle: "Get pinged when a service changes state") {
                guard !notifGranted else { return }
                NotificationManager.shared.requestAuthorization { notifGranted = $0 }
            }
            actionRow(on: launch.enabled,
                      title: launch.enabled ? "Launches at login" : "Launch at login",
                      subtitle: "So it's always watching, quietly") {
                launch.enabled.toggle()
            }
        }
        .padding(.horizontal, 38)
    }

    private func actionRow(on: Bool, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18))
                    .foregroundStyle(on ? Theme.accent : Theme.textMuted)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.textPrimary)
                    Text(subtitle).font(.mono(10)).foregroundStyle(Theme.textMuted)
                }
                Spacer()
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .background(RoundedRectangle(cornerRadius: 10).fill(Theme.bgSurface))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(on ? Theme.accent.opacity(0.5) : Theme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var footer: some View {
        VStack(spacing: 12) {
            Text("Watching \(store.observing.count) popular services — customise anytime.")
                .font(.mono(10)).foregroundStyle(Theme.textMuted)
            Button(action: onDone) {
                Text("Start watching")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.bgPage)
                    .frame(maxWidth: .infinity).padding(.vertical, 11)
                    .background(RoundedRectangle(cornerRadius: 9).fill(Theme.accent))
            }
            .buttonStyle(.plain)
        }
        .padding(20)
    }
}

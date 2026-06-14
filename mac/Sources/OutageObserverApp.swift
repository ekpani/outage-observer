import SwiftUI
import CoreText

@main
struct OutageObserverApp: App {
    @StateObject private var store = StatusStore()

    init() {
        // Register the bundled Departure Mono so Font.custom resolves it.
        if let url = Bundle.main.url(forResource: "DepartureMono-Regular", withExtension: "otf") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }

    var body: some Scene {
        MenuBarExtra {
            MenuContentView().environmentObject(store)
        } label: {
            MenuBarLabel(worst: store.worst)
        }
        .menuBarExtraStyle(.window)

        Window("Outage Observer", id: "main") {
            BoardWindowView()
                .environmentObject(store)
                .frame(minWidth: 380, minHeight: 480)
        }
        .defaultSize(width: 440, height: 640)

        Settings {
            SettingsView().environmentObject(store)
        }
    }
}

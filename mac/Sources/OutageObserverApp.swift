import SwiftUI
import CoreText

@main
struct OutageObserverApp: App {
    @StateObject private var store = StatusStore.shared

    init() {
        // Register the bundled Departure Mono so Font.custom resolves it.
        if let url = Bundle.main.url(forResource: "DepartureMono-Regular", withExtension: "otf") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }

    var body: some Scene {
        // The entire app lives in this one menu-bar popover — onboarding,
        // board, browse/add, and settings are all routes inside it. No separate
        // windows (which open on another Space/display and feel like nothing
        // happened).
        MenuBarExtra {
            MenuContentView().environmentObject(store)
        } label: {
            MenuBarLabel(worst: store.worst)
        }
        .menuBarExtraStyle(.window)
    }
}

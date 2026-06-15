import SwiftUI

@main
struct OutageObserverApp: App {
    // The app IS the status item + popover (set up in AppDelegate). There are no
    // real windows; this empty Settings scene just satisfies the App's Scene
    // requirement and never appears (the app is an LSUIElement agent).
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        Settings { EmptyView() }
    }
}

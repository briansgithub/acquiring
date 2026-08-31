import SwiftData
import SwiftUI

@main
struct AcquiringApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: PlaylistRecord.self)
    }
}

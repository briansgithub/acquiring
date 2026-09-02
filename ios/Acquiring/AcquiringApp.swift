import SwiftData
import SwiftUI

@main
@MainActor
struct AcquiringApp: App {
    private let modelContainer: ModelContainer
    private let environment: AppEnvironment

    init() {
        do {
            let uiTestSession = UITestSession.current()
            let schema = Schema([PlaylistRecord.self, PlaylistEntryRecord.self])
            let configuration = if uiTestSession == nil {
                ModelConfiguration("UserDataV1", schema: schema)
            } else {
                ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            }
            let container = try ModelContainer(for: schema, configurations: [configuration])
            modelContainer = container
            environment = try AppEnvironment(
                modelContext: container.mainContext,
                uiTestSession: uiTestSession
            )
        } catch {
            fatalError("Unable to initialize Acquiring: \(error.localizedDescription)")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(environment)
                .preferredColorScheme(.dark)
        }
        .modelContainer(modelContainer)
    }
}

import SwiftUI

struct ContentView: View {
    @Environment(AppEnvironment.self) private var environment

    var body: some View {
        LibraryScene(environment: environment)
    }
}

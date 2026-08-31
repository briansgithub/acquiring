import SwiftUI

struct ContentView: View {
    private let catalog: any CatalogRepository
    @State private var catalogStatus = "Catalog integration ready"

    init(catalog: any CatalogRepository = EmptyCatalogRepository()) {
        self.catalog = catalog
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "music.note.list")
                    .font(.system(size: 48))
                    .accessibilityHidden(true)
                Text("Acquiring")
                    .font(.largeTitle.bold())
                Text(catalogStatus)
                    .foregroundStyle(.secondary)
            }
            .padding()
            .navigationTitle("Library")
            .task {
                let count = (try? await catalog.songCount()) ?? 0
                if count > 0 {
                    catalogStatus = "\(count) songs available"
                }
            }
        }
    }
}

#Preview {
    ContentView()
}

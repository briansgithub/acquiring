import SwiftUI

/// An explicit browser handoff keeps the local query and navigation intact.
struct HooktheorySearchButton: View {
    let query: String
    @Environment(\.openURL) private var openURL
    @State private var cannotOpenSearch = false

    private var searchText: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        Button {
            var components = URLComponents(string: "https://www.hooktheory.com/theorytab/search")
            components?.queryItems = [URLQueryItem(name: "q", value: searchText)]
            guard !searchText.isEmpty, let url = components?.url else {
                cannotOpenSearch = true
                return
            }
            openURL(url) { accepted in
                cannotOpenSearch = !accepted
            }
        } label: {
            Label("Search Hooktheory.com", systemImage: "arrow.up.right.square")
        }
        .disabled(searchText.isEmpty)
        .accessibilityIdentifier("library.externalSearch")
        .accessibilityHint(searchText.isEmpty
            ? "Enter a song or artist in the search field first"
            : "Searches for \(searchText) in your browser; your place in the library is saved")
        .alert("Unable to Open Hooktheory", isPresented: $cannotOpenSearch) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Open hooktheory.com/theorytab/search in your browser and search for \(searchText). Your library search is still here.")
        }
    }
}

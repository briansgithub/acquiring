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
            HStack(spacing: 12) {
                Image(systemName: "arrow.up.right.square")
                    .font(.body.weight(.semibold))
                    .frame(width: 32, height: 32)
                    .background(Color.accentColor.opacity(0.12), in: Circle())

                Text("Search")
                    .font(.headline.weight(.semibold))

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .disabled(searchText.isEmpty)
        .buttonStyle(HooktheorySearchButtonStyle())
        .accessibilityLabel("Search Hooktheory.com")
        .accessibilityIdentifier("library.externalSearch")
        .accessibilityHint(searchText.isEmpty
            ? "Enter a song or artist in the HookTheory search field first"
            : "Searches for \(searchText) in your browser; your place in the library is saved")
        .alert("Unable to Open Hooktheory", isPresented: $cannotOpenSearch) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Open hooktheory.com/theorytab/search in your browser and search for \(searchText). Your library search is still here.")
        }
    }
}

private struct HooktheorySearchButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(isEnabled ? Color.accentColor : Color.secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(backgroundColor(isPressed: configuration.isPressed))
            }
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(borderColor(isPressed: configuration.isPressed), lineWidth: 1)
            }
            .opacity(isEnabled ? 1 : 0.65)
            .scaleEffect(!reduceMotion && isEnabled && configuration.isPressed ? 0.985 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private func backgroundColor(isPressed: Bool) -> Color {
        guard isEnabled else { return Color.secondary.opacity(0.06) }
        return Color.accentColor.opacity(isPressed ? 0.12 : 0.05)
    }

    private func borderColor(isPressed: Bool) -> Color {
        guard isEnabled else { return Color.secondary.opacity(0.15) }
        return Color.accentColor.opacity(isPressed ? 0.55 : 0.25)
    }
}

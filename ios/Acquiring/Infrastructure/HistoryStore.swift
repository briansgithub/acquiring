import Foundation

actor HistoryStore {
    private enum Key {
        static let songs = "acquiring.history.songSlugs"
        static let artists = "acquiring.history.artists"
    }

    private let defaults: UserDefaults
    private let maximumItems = 10

    init(suiteName: String? = nil) {
        defaults = suiteName.flatMap(UserDefaults.init(suiteName:)) ?? .standard
    }

    func songSlugs() -> [String] {
        defaults.stringArray(forKey: Key.songs) ?? []
    }

    func artists() -> [String] {
        defaults.stringArray(forKey: Key.artists) ?? []
    }

    func addSong(_ slug: String) {
        store(slug, key: Key.songs, canonicalize: { $0 })
    }

    func addArtist(_ artist: String?) {
        guard let artist else { return }
        store(artist, key: Key.artists) { value in
            value.replacingOccurrences(of: "-", with: " ")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    func removeAll() {
        defaults.removeObject(forKey: Key.songs)
        defaults.removeObject(forKey: Key.artists)
    }

    private func store(_ rawValue: String, key: String, canonicalize: (String) -> String) {
        let value = canonicalize(rawValue)
        guard !value.isEmpty else { return }
        var values = defaults.stringArray(forKey: key) ?? []
        values.removeAll { $0.caseInsensitiveCompare(value) == .orderedSame }
        values.insert(value, at: 0)
        defaults.set(Array(values.prefix(maximumItems)), forKey: key)
    }
}

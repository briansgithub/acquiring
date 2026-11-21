import AcquiringAudio
import Foundation
import Observation
import SwiftData

/// Android mainline 3c887223. Cue and Loop/Song are storage only until B04-B06.
struct SongPlaybackSettings: Codable, Equatable {
    var slug: String
    var lockInMajor = false
    var tempoPercent = 100.0
    var arpeggioOptionIndex = 3
    var melodyChordBalance = 0.5
    var instrument: String? = nil
    var transpose = 0
    var rootDegreeCue = "OFF"
    var voiceVolume = 0.5
    var loopSection = true

    static let instruments: [String: SynthWaveform] = [
        "CHURCH_ORGAN": .churchOrgan, "ELECTRIC_PIANO": .electricPiano,
        "MARIMBA": .marimba, "REED_ORGAN": .oboe, "STRINGS": .strings,
        "CLARINET": .clarinet, "FLUTE": .flute, "VIBRAPHONE": .vibraphone,
        "WARM_ORGAN": .warmOrgan, "SAWTOOTH": .sawtooth, "SINE": .sine,
        "SQUARE": .square, "TRIANGLE": .triangle
    ]
    static let cues = ["OFF", "ROOT_PULSES", "HARMONIC_DISTANCE", "SPOKEN_NUMBER",
                       "SUNG_NUMBER_WITH_DETAILS", "MELODY_FUNCTION", "MELODY_CHORD_TONE"]

    func sanitized() -> Self {
        var row = self
        if !tempoPercent.isFinite || !(0...200).contains(tempoPercent) { row.tempoPercent = 100 }
        if !(0...7).contains(arpeggioOptionIndex) { row.arpeggioOptionIndex = 3 }
        if !melodyChordBalance.isFinite || !(0...1).contains(melodyChordBalance) { row.melodyChordBalance = 0.5 }
        if let instrument, Self.instruments[instrument] == nil { row.instrument = nil }
        if !(-12...12).contains(transpose) { row.transpose = 0 }
        if !Self.cues.contains(rootDegreeCue) { row.rootDegreeCue = "OFF" }
        if !voiceVolume.isFinite || !(0...1).contains(voiceVolume) { row.voiceVolume = 0.5 }
        return row
    }
}

@Model
final class SongPlaybackSettingsRecord {
    @Attribute(.unique) var slug: String
    var payload: Data

    init(slug: String, payload: Data) {
        self.slug = slug
        self.payload = payload
    }
}

@MainActor
protocol SongPlaybackSettingsStore {
    func get(_ slug: String) async throws -> SongPlaybackSettings?
    func upsert(_ row: SongPlaybackSettings) async throws
}

/// A separate context prevents rollback of a failed settings save affecting Favorites.
@MainActor
final class SwiftDataSongPlaybackSettingsStore: SongPlaybackSettingsStore {
    private let context: ModelContext
    init(container: ModelContainer) {
        context = ModelContext(container)
        context.autosaveEnabled = false
    }
    private func record(_ slug: String) throws -> SongPlaybackSettingsRecord? {
        var query = FetchDescriptor<SongPlaybackSettingsRecord>(predicate: #Predicate { $0.slug == slug })
        query.fetchLimit = 1
        return try context.fetch(query).first
    }
    func get(_ slug: String) async throws -> SongPlaybackSettings? {
        guard let record = try record(slug) else { return nil }
        var row = try JSONDecoder().decode(SongPlaybackSettings.self, from: record.payload)
        row.slug = slug
        return row
    }
    func upsert(_ row: SongPlaybackSettings) async throws {
        do {
            let payload = try JSONEncoder().encode(row.sanitized())
            if let record = try record(row.slug) { record.payload = payload }
            else { context.insert(SongPlaybackSettingsRecord(slug: row.slug, payload: payload)) }
            try context.save()
        } catch {
            context.rollback()
            throw error
        }
    }
}

@MainActor
@Observable
final class SongPlaybackSettingsSession {
    private(set) var value: SongPlaybackSettings?
    private(set) var readError: String?
    private(set) var writeError: String?
    @ObservationIgnored private let store: any SongPlaybackSettingsStore
    @ObservationIgnored var didApply: ((SongPlaybackSettings) -> Void)?
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var edited = false
    @ObservationIgnored private var pending: [SongPlaybackSettings] = []
    @ObservationIgnored private var writer: Task<Void, Never>?
    @ObservationIgnored private var loader: Task<Void, Never>?

    init(store: any SongPlaybackSettingsStore) { self.store = store }

    func enterSong(_ slug: String) {
        guard value?.slug != slug else { return }
        generation += 1
        let token = generation
        edited = false
        readError = nil
        value = SongPlaybackSettings(slug: slug)
        // Pending or failed writes are newer than the database, including A -> B -> A.
        if let latest = pending.last(where: { $0.slug == slug }) {
            value = latest
            edited = true
        }
        didApply?(value!)
        loader = Task { @MainActor in
            do {
                let row = try await store.get(slug)
                guard generation == token, !edited else { return }
                if let row {
                    value = row.sanitized()
                    didApply?(value!)
                }
            } catch {
                guard generation == token, !edited else { return }
                readError = "Saved playback settings could not be loaded. Defaults are in use. Select another song and return to retry."
            }
        }
    }

    func waitForLoad() async { await loader?.value }

    func edit(markUnchanged: Bool = true, _ change: (inout SongPlaybackSettings) -> Void) {
        guard var row = value else { return }
        change(&row)
        row = row.sanitized()
        guard markUnchanged || row != value else { return }
        value = row
        edited = true
        readError = nil
        // Keep the in-flight head until success; replace only the waiting tail.
        if pending.count > (writer == nil ? 0 : 1), pending.last?.slug == row.slug {
            pending.removeLast()
        }
        pending.append(row)
        retryWrites()
    }

    func retryWrites() {
        guard writer == nil, !pending.isEmpty else { return }
        writer = Task { @MainActor in
            defer { writer = nil }
            while let row = pending.first {
                do {
                    try await store.upsert(row)
                    pending.removeFirst()
                    writeError = nil
                } catch {
                    writeError = "Playback settings have not been saved. Your edits remain in this session. Retry saving before closing the app."
                    return
                }
            }
        }
    }

    func waitForWrites() async { await writer?.value }
}

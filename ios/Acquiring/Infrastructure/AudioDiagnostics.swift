import Foundation
import SwiftUI
import UIKit

/// Local, allow-listed facts only. Never serialize NSError.userInfo, port names,
/// song identifiers, microphone samples, or any device/user identifier.
struct AudioDiagnosticEvent: Codable {
    struct Failure: Codable, Equatable {
        let domain: String
        let code: Int
    }
    let timestamp: Date
    let operation: String
    let state: [String: String]
    let errors: [Failure]

    init(operation: String, state: [String: String], error: (any Error)? = nil) {
        timestamp = Date()
        self.operation = operation
        self.state = state
        var chain: [Failure] = []
        var current = error.map { $0 as NSError }
        // A malformed/cyclic underlying-error chain must stay bounded too.
        for _ in 0..<4 {
            guard let value = current else { break }
            chain.append(Failure(domain: value.domain, code: value.code))
            current = value.userInfo[NSUnderlyingErrorKey] as? NSError
        }
        errors = chain
    }
}

@MainActor
final class AudioDiagnostics {
    struct Report: Codable {
        let schemaVersion: Int
        let failure: AudioDiagnosticEvent?
        let precedingEvents: [AudioDiagnosticEvent]
        var subsequentEvents: [AudioDiagnosticEvent]
        var recoveryEvents: [AudioDiagnosticEvent] = []
    }

    static let eventLimit = 128
    private let fileURL: URL
    private var events: [AudioDiagnosticEvent] = []
    private(set) var report: Report?
    private(set) var persistenceError: String?
    var isRecovering = false

    init(fileURL: URL? = nil) {
        self.fileURL = fileURL ?? URL.applicationSupportDirectory
            .appendingPathComponent("AudioDiagnostics", isDirectory: true)
            .appendingPathComponent("latest-failure.json")
        if let data = try? Data(contentsOf: self.fileURL), data.count <= 1_000_000 {
            report = try? JSONDecoder().decode(Report.self, from: data)
        }
    }

    func record(_ event: AudioDiagnosticEvent) {
        if !event.errors.isEmpty, !isRecovering {
            report = Report(schemaVersion: 1, failure: event, precedingEvents: events, subsequentEvents: [])
        } else if report != nil {
            report?.subsequentEvents.append(event)
            if let count = report?.subsequentEvents.count, count > Self.eventLimit {
                report?.subsequentEvents.removeFirst(count - Self.eventLimit)
            }
        }
        if isRecovering, report != nil {
            report?.recoveryEvents.append(event)
            if let count = report?.recoveryEvents.count, count > Self.eventLimit {
                report?.recoveryEvents.removeFirst(count - Self.eventLimit)
            }
        }
        events.append(event)
        if events.count > Self.eventLimit { events.removeFirst(events.count - Self.eventLimit) }
        if let report {
            do {
                try write(report, to: fileURL)
                persistenceError = nil
            } catch {
                persistenceError = "The report could not be saved across restarts. Share it before closing the app."
            }
        }
    }

    func beginRecovery() {
        isRecovering = true
        if report == nil {
            report = Report(schemaVersion: 1, failure: nil, precedingEvents: events, subsequentEvents: [])
        }
        report?.recoveryEvents = []
    }

    func export() throws -> URL {
        let value = report ?? Report(schemaVersion: 1, failure: nil, precedingEvents: events, subsequentEvents: [])
        let url = URL.temporaryDirectory.appendingPathComponent("AudioDiagnosticsExports", isDirectory: true).appendingPathComponent("Acquiring-Audio-Diagnostics.json")
        try write(value, to: url)
        return url
    }

    private func write(_ report: Report, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        // Keep the same date representation in the persistent and exported report.
        try encoder.encode(report).write(to: url, options: [.atomic, .completeFileProtectionUnlessOpen])
        var directory = url.deletingLastPathComponent()
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
    }
}

/// One explicit experiment, with cancellation/ownership checks between stages.
/// Injected steps let tests prove failure and cleanup behavior without hardware.
@MainActor
enum AudioRecoveryExperiment {
    struct Step {
        let name: String
        let run: @MainActor () async throws -> Void
    }

    static func run(
        isCurrent: @MainActor () -> Bool,
        steps: [Step],
        record: @MainActor (String, (any Error)?) -> Void
    ) async throws {
        for step in steps {
            do {
                try Task.checkCancellation()
                guard isCurrent() else { throw CancellationError() }
                record("recovery.\(step.name).begin", nil)
                try await step.run()
                record("recovery.\(step.name).succeeded", nil)
            } catch {
                record("recovery.\(step.name).\(error is CancellationError ? "cancelled" : "failed")", error is CancellationError ? nil : error)
                throw error
            }
            await Task.yield()
        }
    }
}

struct AudioDiagnosticsSheet: View {
    let audio: AppAudioSystem
    @Environment(\.dismiss) private var dismiss
    @State private var file: URL?
    @State private var failure: String?

    var body: some View {
        Group {
            if let file {
                AudioDiagnosticsActivitySheet(file: file)
            } else if let failure {
                VStack(spacing: 16) {
                    Text("Unable to Share Audio Diagnostics").font(.headline)
                    Text(failure)
                    Button("Close") { dismiss() }
                }.padding()
            } else {
                ProgressView("Preparing audio diagnostics…")
            }
        }
        .task {
            do { file = try audio.exportDiagnostics() }
            catch { failure = error.localizedDescription }
        }
    }
}

private struct AudioDiagnosticsActivitySheet: UIViewControllerRepresentable {
    let file: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [file], applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

struct AudioDiagnosticsSettingsSection: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var showsShare = false

    var body: some View {
        Section {
            Button("Share Audio Diagnostics") { showsShare = true }
                .accessibilityIdentifier("settings.shareAudioDiagnostics")
                .sheet(isPresented: $showsShare) { AudioDiagnosticsSheet(audio: environment.audio) }
        } header: {
            Text("Audio Diagnostics")
        } footer: {
            Text("Save the report and attach it to the support conversation. Include whether playback was audible. Reports stay on this phone until you share them; no audio is recorded.")
        }
    }
}

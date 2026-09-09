@preconcurrency import AVFoundation
import AcquiringAudio
import AcquiringCore
import MediaPlayer
import OSLog
import UIKit

@MainActor
struct AudioHardwareOperations {
    var startEngine: (AVAudioEngine) throws -> Void = { try $0.start() }
    var setSessionActive: (Bool) throws -> Void = {
        try AVAudioSession.sharedInstance().setActive($0, options: $0 ? [] : .notifyOthersOnDeactivation)
    }
    var requestRecordPermission: () async -> Bool = { await AVAudioApplication.requestRecordPermission() }
    var isAppActive: () -> Bool = { UIApplication.shared.applicationState == .active }
}

@MainActor
final class AppAudioSystem: PreviewAudio, QuizTransport, PitchSource {
    struct QuizPlaybackOwner: Equatable, Sendable {
        fileprivate let generation: UInt64
    }

    private let hardware: AudioHardwareOperations
    let diagnostics: AudioDiagnostics
    private var recoveryInProgress = false
    private var audioRecoveryGeneration: UInt64 = 0
    private var failedPreview: (request: PreviewRequest, token: UInt64)?
    private var appIsActive = true

    private let logger = Logger(subsystem: "com.acquiring.ios", category: "audio")
    private var engine: AVAudioEngine
    private var player: AVAudioPlayerNode
    private let playbackFormat: AVAudioFormat
    private let quizRenderer: LockedQuizRenderer
    private var sourceNode: AVAudioSourceNode
    private var transportState = TransportState(phase: .stopped)
    private var stateContinuations: [UUID: AsyncStream<TransportState>.Continuation] = [:]
    private var pendingMicrophone: PendingMicrophone?
    private var activeMicrophone: ActiveMicrophone?
    private var notificationTasks: [Task<Void, Never>] = []
    private var transportPollTask: Task<Void, Never>?
    private var quizTimelineLoaded = false
    /// Requested playback is separate from the physical renderer state: a
    /// zero-tempo Quiz is paused but resumes when a positive tempo returns.
    private var quizPlaybackRequested = false
    private var quizContext: QuizAudioContext?
    private var sessionInstrument: SynthWaveform = .clarinet
    private var quizRevision: UInt64 = 0
    private var quizPlaybackOwnerGeneration: UInt64 = 0
    private var quizPlaybackOwnerIsActive = false
    private var quizLoadPendingRevision: UInt64?
    private let previewGeneration = PreviewPlaybackGeneration()
    private var previewRender: (token: UInt64, task: Task<[Float], any Error>)?
    private var shouldResumeAfterInterruption = false
    /// AVAudioEngine cannot be asked whether its input node exists, and merely
    /// reading `engine.inputNode` instantiates it permanently: there is no way to
    /// detach one. An engine whose graph holds an input node cannot start again
    /// while the session category is `.playback`, because input is unavailable and
    /// `start()` throws 'what' (2003329396) for the life of that instance. Track
    /// the transition explicitly so the graph can be replaced before it is needed.
    private var engineHasInputNode = false
    /// Capture leaves a 16 kHz sample rate and a hop-sized IO buffer duration on
    /// the shared session. Arm the cleanup only when capture actually set them, so
    /// a user who never sings pays no extra session calls and no extra events.
    private var needsPlaybackCapturePreferenceReset = false
    /// Guards against a seam re-entering the automatic retry from inside itself.
    private var isRetryingEngineStart = false

    /// A start failure that nothing explains is rebuilt and retried exactly once,
    /// the way the manual reset does it. The DEBUG injection below derives its
    /// failure budget from this so the two cannot drift apart.
    private static let automaticEngineStartRetries = 1

    init(diagnostics: AudioDiagnostics? = nil, hardware: AudioHardwareOperations = .init()) {
        var resolvedHardware = hardware
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing") {
            // A start failure is now rebuilt and retried automatically, so an
            // injected outage has to outlast the retry to reach the user-visible
            // alert. Sizing the budget from the retry policy keeps the two in step:
            // testAutomaticRetryIsBoundedToOneRebuildPerStartAttempt pins the bound.
            // The `once` variant injects a single failure instead, so a UI test can
            // prove the silent self-heal end to end.
            let arguments = ProcessInfo.processInfo.arguments
            var remainingFailures = 0
            if arguments.contains("--ui-testing-audio-start-failure") {
                remainingFailures = AppAudioSystem.automaticEngineStartRetries + 1
            } else if arguments.contains("--ui-testing-audio-start-failure-once") {
                remainingFailures = 1
            }
            if remainingFailures > 0 {
                let start = hardware.startEngine
                var budget = remainingFailures
                resolvedHardware.startEngine = { engine in
                    if budget > 0 {
                        budget -= 1
                        throw NSError(domain: "com.apple.coreaudio.avfaudio", code: 2003329396)
                    }
                    try start(engine)
                }
            }
        }
        #endif
        self.hardware = resolvedHardware
        self.diagnostics = diagnostics ?? AudioDiagnostics()
        let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1)!
        playbackFormat = format
        let renderer = LockedQuizRenderer(sampleRate: format.sampleRate)
        quizRenderer = renderer
        engine = AVAudioEngine()
        player = AVAudioPlayerNode()
        sourceNode = Self.makeSourceNode(format: format, renderer: renderer)
        engine.attach(player)
        engine.attach(sourceNode)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        engine.connect(sourceNode, to: engine.mainMixerNode, format: format)
        // The app previously published persistent media controls. Clear any
        // metadata retained by this process while keeping playback foreground-only.
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        appIsActive = hardware.isAppActive()
        recordAudioEvent("app.audioInitialized")
        observeAudioSession()
    }

    func setSessionInstrument(_ waveform: SynthWaveform) {
        guard sessionInstrument != waveform else { return }
        sessionInstrument = waveform
        if let context = quizContext,
           context.soundConfiguration.waveform != waveform {
            let soundConfiguration = context.soundConfiguration.replacing(waveform: waveform)
            quizContext = QuizAudioContext(
                songID: context.songID,
                sectionID: context.sectionID,
                tempoPercent: context.tempoPercent,
                soundConfiguration: soundConfiguration
            )
            if quizTimelineLoaded {
                quizRenderer.setSoundConfiguration(soundConfiguration)
            }
        }
        invalidatePreviewPlayback()
    }

    func play(_ request: PreviewRequest) async throws {
        try Task.checkCancellation()
        guard !recoveryInProgress else { throw CancellationError() }
        recordAudioEvent("preview.request")
        let token = await beginPreviewPlayback()
        _ = try await schedulePreview(request, token: token)
    }

    func playQuizCardPreview(
        midiNotes: [Int],
        asInterval: Bool = false,
        duration: Duration = .milliseconds(450)
    ) async throws {
        try Task.checkCancellation()
        guard !recoveryInProgress else { throw CancellationError() }
        recordAudioEvent("preview.cardRequest")
        guard !midiNotes.isEmpty, midiNotes.allSatisfy({ (0...127).contains($0) }) else {
            throw AcquiringAudioError.invalidRequest("Quiz card previews require valid MIDI notes.")
        }
        let noteGroups: [[Int]]
        if asInterval, midiNotes.count >= 2 {
            let previous = midiNotes[0]
            let current = midiNotes[1]
            let together = previous == current ? [previous] : [previous, current]
            noteGroups = [[previous], [current], together]
        } else {
            noteGroups = [midiNotes]
        }

        let token = await beginPreviewPlayback()
        do {
            for (index, notes) in noteGroups.enumerated() {
                try Task.checkCancellation()
                guard previewGeneration.isCurrent(token) else { return }
                let frequencies = notes.map(Self.frequency(forMIDINote:))
                let didSchedule = try await schedulePreview(
                    PreviewRequest(frequenciesHz: frequencies, duration: duration),
                    token: token
                )
                guard didSchedule else { return }
                if index < noteGroups.count - 1 {
                    try await Task.sleep(for: max(duration, .milliseconds(1)))
                }
            }
        } catch is CancellationError {
            await stopPreviewPlayback(ifCurrent: token)
        }
    }

    func cancelQuizCardPreview() {
        invalidatePreviewPlayback()
    }

    @discardableResult
    func cancelQuizCardPreview(revision: UInt64, owner: QuizPlaybackOwner) -> Bool {
        guard ownsQuiz(revision: revision, owner: owner) else { return false }
        invalidatePreviewPlayback()
        return true
    }

    private func beginPreviewPlayback() async -> UInt64 {
        let token = previewGeneration.begin()
        previewRender?.task.cancel()
        previewRender = nil
        await retirePreviewPlayback(ifCurrent: token)
        return token
    }

    private func schedulePreview(_ sourceRequest: PreviewRequest, token: UInt64) async throws -> Bool {
        // The shared instrument is applied to every preview here. Musical callers supply
        // source pitches and also take the absolute transpose; measured microphone pitches
        // opt out of that alone.
        let request = configuredPreview(sourceRequest)
        guard previewGeneration.isCurrent(token), !Task.isCancelled else { return false }
        previewRender?.task.cancel()
        previewRender = nil
        let sampleRate = playbackFormat.sampleRate
        let generation = previewGeneration
        let renderTask = Task.detached(priority: .userInitiated) {
            try StaticPCMRenderer.render(
                request: request,
                sampleRate: sampleRate,
                shouldCancel: { Task.isCancelled || !generation.isCurrent(token) }
            )
        }
        previewRender = (token, renderTask)
        let samples: [Float]
        do {
            samples = try await withTaskCancellationHandler {
                try await renderTask.value
            } onCancel: {
                renderTask.cancel()
                generation.invalidate(ifCurrent: token)
            }
        } catch is CancellationError {
            clearPreviewRender(ifToken: token)
            return false
        } catch {
            clearPreviewRender(ifToken: token)
            guard generation.isCurrent(token), !Task.isCancelled else { return false }
            generation.invalidate(ifCurrent: token)
            throw error
        }
        clearPreviewRender(ifToken: token)
        guard generation.isCurrent(token), !Task.isCancelled else {
            return false
        }
        guard !recoveryInProgress || (appIsActive && hardware.isAppActive()) else { throw CancellationError() }
        failedPreview = (sourceRequest, token)
        try configureSessionForCurrentNeeds()
        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: playbackFormat,
            frameCapacity: AVAudioFrameCount(samples.count)
        ),
              let channel = buffer.floatChannelData?[0]
        else { throw AcquiringAudioError.engine("Could not allocate a preview buffer.") }
        buffer.frameLength = buffer.frameCapacity
        samples.withUnsafeBufferPointer { source in
            channel.update(from: source.baseAddress!, count: samples.count)
        }
        guard generation.isCurrent(token), !Task.isCancelled else { return false }
        // Start before scheduling: starting may replace the engine, and a buffer
        // queued on the outgoing player would be discarded along with it, leaving
        // `play()` running against an empty queue and a silent preview.
        try startEngineIfNeeded(operation: "preview.engineStart")
        player.scheduleBuffer(buffer, completionHandler: nil)
        player.play()
        failedPreview = nil
        recordAudioEvent("preview.started")
        return true
    }

    func stop(channel: AudioPlaybackChannel) async {
        recordAudioEvent("preview.stop")
        failedPreview = nil
        invalidatePreviewPlayback()
    }

    func states() async -> AsyncStream<TransportState> {
        let id = UUID()
        return AsyncStream { continuation in
            stateContinuations[id] = continuation
            continuation.yield(transportState)
            continuation.onTermination = { [weak self] _ in
                Task { @MainActor in self?.stateContinuations[id] = nil }
            }
        }
    }

    func load(_ timeline: QuizTimeline, position: QuizLoadPosition) async throws {
        transportPollTask?.cancel()
        let shouldContinuePlaying = quizPlaybackRequested && !isQuizTempoPaused
        let snapshot = quizRenderer.configure(
            timeline,
            playbackRate: 1,
            preserveProgress: position == .preserveProgress
        )
        quizTimelineLoaded = true
        publish(TransportState(
            phase: .paused,
            elapsed: .seconds(snapshot.elapsed),
            duration: .seconds(snapshot.duration)
        ))
        if shouldContinuePlaying { try await play() }
    }

    /// Invalidates every queued command for the previous quiz and silences it
    /// before the replacement timeline is built. The replacement intentionally
    /// starts paused even when the old section was playing.
    func beginQuizReplacement(
        songID: String,
        sectionID: String,
        tempoPercent: Double,
        soundConfiguration: QuizSoundConfiguration = .init()
    ) -> UInt64 {
        invalidateQuizPlaybackOwner()
        quizRevision &+= 1
        quizLoadPendingRevision = quizRevision
        transportPollTask?.cancel()
        invalidatePreviewPlayback()
        quizRenderer.stop()
        quizTimelineLoaded = false
        quizPlaybackRequested = false
        quizContext = QuizAudioContext(
            songID: songID,
            sectionID: sectionID,
            tempoPercent: tempoPercent,
            soundConfiguration: soundConfiguration
        )
        let snapshot = quizRenderer.snapshot()
        publish(TransportState(
            phase: .stopped,
            elapsed: .zero,
            duration: .seconds(snapshot.duration)
        ))
        return quizRevision
    }

    /// A same-section settings change keeps its progress and requested playback
    /// state, while still superseding an older queued rebuild.
    func beginQuizReload(
        songID: String,
        sectionID: String,
        tempoPercent: Double,
        soundConfiguration: QuizSoundConfiguration = .init()
    ) -> UInt64 {
        guard quizContext?.songID == songID,
              quizContext?.sectionID == sectionID,
              quizTimelineLoaded
        else {
            return beginQuizReplacement(
                songID: songID,
                sectionID: sectionID,
                tempoPercent: tempoPercent,
                soundConfiguration: soundConfiguration
            )
        }
        quizRevision &+= 1
        quizLoadPendingRevision = quizRevision
        quizContext = QuizAudioContext(
            songID: songID,
            sectionID: sectionID,
            tempoPercent: tempoPercent,
            soundConfiguration: soundConfiguration
        )
        if isQuizTempoPaused { pauseQuizForZeroTempo() }
        return quizRevision
    }

    func loadQuiz(
        _ timeline: QuizTimeline,
        songID: String,
        sectionID: String,
        tempoPercent: Double,
        position: QuizLoadPosition,
        revision: UInt64,
        soundConfiguration: QuizSoundConfiguration = .init()
    ) async throws {
        try Task.checkCancellation()
        guard isCurrentQuiz(
            songID: songID,
            sectionID: sectionID,
            tempoPercent: tempoPercent,
            revision: revision,
            soundConfiguration: soundConfiguration
        ) else {
            throw CancellationError()
        }
        transportPollTask?.cancel()
        let shouldContinuePlaying = position == .preserveProgress
            && quizPlaybackRequested
            && !isQuizTempoPaused
        let snapshot = quizRenderer.configure(
            timeline,
            playbackRate: tempoPercent / 100,
            preserveProgress: position == .preserveProgress,
            soundConfiguration: soundConfiguration
        )
        guard isCurrentQuiz(
            songID: songID,
            sectionID: sectionID,
            tempoPercent: tempoPercent,
            revision: revision,
            soundConfiguration: soundConfiguration
        ) else {
            throw CancellationError()
        }
        quizTimelineLoaded = true
        quizLoadPendingRevision = nil
        publish(TransportState(
            phase: .paused,
            elapsed: .seconds(snapshot.elapsed),
            duration: .seconds(snapshot.duration)
        ))
        if shouldContinuePlaying {
            try startQuizPlayback(expectedRevision: revision)
        }
    }

    /// Applies a same-section tempo change directly to the musical clock. This
    /// supersedes stale UI commands without rebuilding the timeline, voices,
    /// audio session, or engine.
    func updateQuizTempo(
        songID: String,
        sectionID: String,
        tempoPercent: Double,
        revision: UInt64
    ) -> UInt64? {
        guard revision == quizRevision,
              quizTimelineLoaded,
              quizLoadPendingRevision == nil,
              let context = quizContext,
              context.songID == songID,
              context.sectionID == sectionID
        else { return nil }

        let previousState = transportState
        let wasTempoPaused = isQuizTempoPaused
        let normalizedTempo = tempoPercent.isFinite
            ? min(max(tempoPercent, 0), 200)
            : 100
        quizRevision &+= 1
        quizContext = QuizAudioContext(
            songID: songID,
            sectionID: sectionID,
            tempoPercent: normalizedTempo,
            soundConfiguration: context.soundConfiguration
        )
        quizRenderer.setPlaybackRate(normalizedTempo / 100)

        if normalizedTempo <= 0 {
            transportPollTask?.cancel()
            quizRenderer.pause()
            let snapshot = quizRenderer.snapshot()
            publish(TransportState(
                phase: .paused,
                elapsed: .seconds(snapshot.elapsed),
                duration: .seconds(snapshot.duration)
            ))
        } else if quizPlaybackRequested, wasTempoPaused, engine.isRunning {
            quizRenderer.play()
            let snapshot = quizRenderer.snapshot()
            publish(TransportState(
                phase: .playing,
                elapsed: .seconds(snapshot.elapsed),
                duration: .seconds(snapshot.duration)
            ))
            beginTransportPolling()
        } else {
            let snapshot = quizRenderer.snapshot()
            publish(TransportState(
                phase: previousState.phase,
                elapsed: .seconds(snapshot.elapsed),
                duration: .seconds(snapshot.duration),
                errorDescription: previousState.errorDescription
            ))
        }
        return quizRevision
    }

    func restorableQuizRevision(
        songID: String,
        sectionID: String,
        tempoPercent: Double,
        soundConfiguration: QuizSoundConfiguration = .init()
    ) -> UInt64? {
        guard quizTimelineLoaded,
              quizLoadPendingRevision == nil,
              quizContext == QuizAudioContext(
                songID: songID,
                sectionID: sectionID,
                tempoPercent: tempoPercent,
                soundConfiguration: soundConfiguration
              )
        else { return nil }
        return quizRevision
    }

    /// Sound changes are renderer commands, not timeline reloads. They retain
    /// the requested play state (including a tempo-zero pause) and playhead.
    func updateQuizSoundConfiguration(
        songID: String,
        sectionID: String,
        soundConfiguration: QuizSoundConfiguration,
        revision: UInt64
    ) -> UInt64? {
        guard revision == quizRevision,
              quizTimelineLoaded,
              quizLoadPendingRevision == nil,
              let context = quizContext,
              context.songID == songID,
              context.sectionID == sectionID
        else { return nil }
        quizRevision &+= 1
        quizContext = QuizAudioContext(
            songID: songID,
            sectionID: sectionID,
            tempoPercent: context.tempoPercent,
            soundConfiguration: soundConfiguration
        )
        invalidatePreviewPlayback()
        quizRenderer.setSoundConfiguration(soundConfiguration)
        return quizRevision
    }

    func activateQuizPlaybackOwner(revision: UInt64) -> QuizPlaybackOwner? {
        guard revision == quizRevision,
              quizTimelineLoaded,
              quizLoadPendingRevision == nil
        else { return nil }
        quizPlaybackOwnerGeneration &+= 1
        quizPlaybackOwnerIsActive = true
        return QuizPlaybackOwner(generation: quizPlaybackOwnerGeneration)
    }

    func playQuiz(revision: UInt64, owner: QuizPlaybackOwner) async throws {
        try Task.checkCancellation()
        guard !recoveryInProgress else { throw CancellationError() }
        recordAudioEvent("quiz.playRequest")
        guard ownsQuiz(revision: revision, owner: owner) else { throw CancellationError() }
        try startQuizPlayback(expectedRevision: revision, expectedOwner: owner)
    }

    func pauseQuiz(revision: UInt64, owner: QuizPlaybackOwner) async {
        guard ownsQuiz(revision: revision, owner: owner) else { return }
        await pause()
    }

    @discardableResult
    func pauseQuizForLifecycle(revision: UInt64, owner: QuizPlaybackOwner) -> Bool {
        guard ownsQuiz(revision: revision, owner: owner) else { return false }
        pauseForLifecycle()
        return true
    }

    func pauseForAppInactivity() {
        pauseForLifecycle()
    }

    func resetQuiz(revision: UInt64, owner: QuizPlaybackOwner) async {
        guard ownsQuiz(revision: revision, owner: owner) else { return }
        await reset()
    }

    /// Pauses a loaded quiz synchronously and returns the playback intent that a
    /// matching scrub completion may restore. Keeping this handoff on the main
    /// actor prevents a queued pause from landing after the scrub has moved on.
    func pauseQuizForScrubbing(revision: UInt64, owner: QuizPlaybackOwner) -> Bool? {
        guard ownsQuiz(revision: revision, owner: owner),
              quizTimelineLoaded,
              quizLoadPendingRevision == nil
        else { return nil }

        let shouldResume = quizPlaybackRequested
        transportPollTask?.cancel()
        invalidatePreviewPlayback()
        quizRenderer.pause()
        let snapshot = quizRenderer.snapshot()
        publish(TransportState(
            phase: .paused,
            elapsed: .seconds(snapshot.elapsed),
            duration: .seconds(snapshot.duration)
        ))
        return shouldResume
    }

    /// Restores playback only while the scrub's quiz revision is still current.
    func resumeQuizAfterScrubbing(revision: UInt64, owner: QuizPlaybackOwner) throws {
        guard ownsQuiz(revision: revision, owner: owner),
              quizTimelineLoaded,
              quizLoadPendingRevision == nil
        else { throw CancellationError() }
        try startQuizPlayback(expectedRevision: revision, expectedOwner: owner)
    }

    /// Seeks the current quiz without changing its requested transport state.
    /// The revision check makes a tap queued against a previous section a no-op.
    @discardableResult
    func seekQuiz(to progress: Double, revision: UInt64) -> Bool {
        guard revision == quizRevision,
              quizTimelineLoaded,
              quizLoadPendingRevision == nil
        else { return false }

        // A preview should never continue over the newly selected quiz position.
        invalidatePreviewPlayback()
        // Replace the poller so a sample captured before the seek cannot publish
        // over the new position after it completes.
        transportPollTask?.cancel()
        let bounded = min(max(progress, 0), 1)
        quizRenderer.seek(progress: bounded)
        let snapshot = quizRenderer.snapshot()
        let phase = transportState.phase
        publish(TransportState(
            phase: phase,
            elapsed: .seconds(snapshot.elapsed),
            duration: .seconds(snapshot.duration)
        ))
        if phase == .playing {
            beginTransportPolling()
        }
        return true
    }

    @discardableResult
    func seekQuiz(to progress: Double, revision: UInt64, owner: QuizPlaybackOwner) -> Bool {
        guard ownsQuiz(revision: revision, owner: owner) else { return false }
        return seekQuiz(to: progress, revision: revision)
    }

    func play() async throws {
        guard !recoveryInProgress else { throw CancellationError() }
        recordAudioEvent("transport.playRequest")
        try startQuizPlayback(expectedRevision: nil)
    }

    private func startQuizPlayback(
        expectedRevision: UInt64?,
        expectedOwner: QuizPlaybackOwner? = nil
    ) throws {
        if let expectedRevision, expectedRevision != quizRevision {
            throw CancellationError()
        }
        if let expectedOwner,
           !ownsQuiz(revision: expectedRevision ?? quizRevision, owner: expectedOwner) {
            throw CancellationError()
        }
        guard quizTimelineLoaded else {
            throw AcquiringAudioError.invalidRequest("Load a quiz timeline before starting playback.")
        }

        quizPlaybackRequested = true
        guard !isQuizTempoPaused else {
            pauseQuizForZeroTempo()
            return
        }

        transportPollTask?.cancel()
        let startingSnapshot = quizRenderer.snapshot()
        publish(TransportState(
            phase: .buffering,
            elapsed: .seconds(startingSnapshot.elapsed),
            duration: .seconds(startingSnapshot.duration)
        ))

        do {
            try configureSessionForCurrentNeeds()
            try startEngineIfNeeded(operation: "quiz.engineStart")
            if let expectedRevision, expectedRevision != quizRevision {
                throw CancellationError()
            }
            quizRenderer.play()
            let playingSnapshot = quizRenderer.snapshot()
            publish(TransportState(
                phase: .playing,
                elapsed: .seconds(playingSnapshot.elapsed),
                duration: .seconds(playingSnapshot.duration)
            ))
            beginTransportPolling()
        } catch {
            quizRenderer.pause()
            let failedSnapshot = quizRenderer.snapshot()
            publish(TransportState(
                phase: .failed,
                elapsed: .seconds(failedSnapshot.elapsed),
                duration: .seconds(failedSnapshot.duration),
                errorDescription: error.localizedDescription
            ))
            throw error
        }
    }

    func pause() async {
        quizPlaybackRequested = false
        shouldResumeAfterInterruption = false
        transportPollTask?.cancel()
        quizRenderer.pause()
        let snapshot = quizRenderer.snapshot()
        publish(TransportState(phase: .paused, elapsed: .seconds(snapshot.elapsed), duration: .seconds(snapshot.duration)))
    }

    private func pauseForLifecycle() {
        recordAudioEvent("quiz.lifecyclePause")
        invalidateQuizPlaybackOwner()
        quizPlaybackRequested = false
        shouldResumeAfterInterruption = false
        transportPollTask?.cancel()
        invalidatePreviewPlayback()
        player.stop()
        player.volume = 1
        quizRenderer.pause()
        guard quizTimelineLoaded else { return }
        let snapshot = quizRenderer.snapshot()
        publish(TransportState(
            phase: .paused,
            elapsed: .seconds(snapshot.elapsed),
            duration: .seconds(snapshot.duration)
        ))
    }

    private func ownsQuiz(revision: UInt64, owner: QuizPlaybackOwner) -> Bool {
        revision == quizRevision
            && quizPlaybackOwnerIsActive
            && owner.generation == quizPlaybackOwnerGeneration
    }

    private func invalidateQuizPlaybackOwner() {
        quizPlaybackOwnerGeneration &+= 1
        quizPlaybackOwnerIsActive = false
    }

    func reset() async {
        quizPlaybackRequested = false
        shouldResumeAfterInterruption = false
        transportPollTask?.cancel()
        invalidatePreviewPlayback()
        quizRenderer.stop()
        let snapshot = quizRenderer.snapshot()
        publish(TransportState(
            phase: .stopped,
            elapsed: .zero,
            duration: .seconds(snapshot.duration)
        ))
    }

    func seek(to progress: Double) async {
        _ = seekQuiz(to: progress, revision: quizRevision)
    }

    func stop() async {
        quizPlaybackRequested = false
        shouldResumeAfterInterruption = false
        transportPollTask?.cancel()
        invalidatePreviewPlayback()
        quizRenderer.stop()
        stopAllMicrophoneCapture()
        let snapshot = quizRenderer.snapshot()
        publish(TransportState(
            phase: .stopped,
            elapsed: .zero,
            duration: .seconds(snapshot.duration)
        ))
    }

    func readings(profile: PitchTrackingProfile) async -> AsyncThrowingStream<PitchReading, any Error> {
        do {
            return try await acquireMicrophone(owner: .singingTool, profile: profile).readings
        } catch {
            return AsyncThrowingStream { $0.finish(throwing: error) }
        }
    }

    /// Transfers the single microphone to a new interaction. Transfer happens
    /// before the permission request so an older owner cannot keep publishing
    /// while a replacement is waiting on the system prompt.
    func acquireMicrophone(
        owner: MicrophoneOwner,
        profile: PitchTrackingProfile
    ) async throws -> MicrophoneLease {
        try Task.checkCancellation()
        guard !recoveryInProgress else { throw CancellationError() }
        recordAudioEvent("microphone.acquire")
        let id = UUID()
        let (stream, continuation) = AsyncThrowingStream<PitchReading, any Error>.makeStream()
        let lease = MicrophoneLease(id: id, readings: stream)

        supersedeMicrophone(with: id)
        pendingMicrophone = PendingMicrophone(id: id, owner: owner, profile: profile, continuation: continuation)
        continuation.onTermination = { [weak self] _ in
            Task { @MainActor in self?.releaseMicrophone(id: id) }
        }

        do {
            guard await hardware.requestRecordPermission() else {
                throw AcquiringAudioError.microphonePermissionDenied
            }
            try Task.checkCancellation()
            guard pendingMicrophone?.id == id else { throw CancellationError() }

            var attachment = try await attachMicrophoneInput(id: id, profile: profile)
            do {
                try startEngineIfNeeded(operation: "microphone.engineStart")
            } catch let startFailure {
                // This start is the one path with neither the preventive rebuild
                // nor the automatic retry: both refuse while a capture is in
                // flight, so they do not pull the input node out from under an
                // acquisition that is still settling. That reasoning holds
                // *before* a start; once one has failed the graph is unusable
                // either way, and refusing to rebuild here is what puts a raw
                // 'what' (2003329396) in front of a singer.
                //
                // The rebuild discards the input node and tap this acquisition
                // just installed, so the attachment has to be made again on the
                // replacement graph rather than merely retried.
                guard canRebuildForMicrophoneStart() else { throw startFailure }
                recordAudioEvent("microphone.rebuildAfterStartFailure")
                attachment.detach()
                rebuildAudioEngine()
                guard pendingMicrophone?.id == id else { throw CancellationError() }
                attachment = try await attachMicrophoneInput(id: id, profile: profile)
                do {
                    try startEngineIfNeeded(operation: "microphone.engineStart.retryAfterRebuild")
                } catch {
                    // Both attempts are in the diagnostic history with their
                    // original NSErrors; the singer gets something they can act on.
                    attachment.detach()
                    throw AcquiringAudioError.engine(Self.microphoneStartFailureMessage)
                }
            }

            guard pendingMicrophone?.id == id else {
                attachment.detach()
                throw CancellationError()
            }
            pendingMicrophone = nil
            activeMicrophone = ActiveMicrophone(
                id: id,
                owner: owner,
                continuation: continuation,
                pipeline: attachment.pipeline,
                profile: profile,
                sampleRate: attachment.format.sampleRate,
                channelCount: attachment.format.channelCount
            )
            let format = attachment.format
            logger.info("Microphone pitch capture started at \(format.sampleRate, privacy: .public) Hz")
            return lease
        } catch {
            failMicrophone(id: id, error: error)
            throw error
        }
    }

    /// Releases only the capture represented by this capability. This is the
    /// cleanup path practice features should use; `stop()` intentionally remains
    /// the global transport stop required by the shared protocol surface.
    func releaseMicrophone(_ lease: MicrophoneLease) {
        releaseMicrophone(id: lease.id)
    }

    /// The only place in this file that may name `engine.inputNode`. Reading that
    /// property is itself the state transition that poisons the graph for playback,
    /// so the read and the bookkeeping have to be the same operation — a bare read
    /// anywhere else would set the trap without recording it.
    private func instantiatedInputNode() -> AVAudioInputNode {
        engineHasInputNode = true
        return engine.inputNode
    }

    /// A tap can only live on an input node that this engine actually instantiated,
    /// so when there is none there is nothing to remove — and calling through would
    /// instantiate one, re-poisoning a graph that is still clean. Teardown runs on
    /// paths that may never have installed a tap at all, including a cancelled
    /// acquisition, which is exactly when the bare call did the damage.
    private func removeMicrophoneTapIfInstalled() {
        guard engineHasInputNode else { return }
        instantiatedInputNode().removeTap(onBus: 0)
    }

    #if DEBUG
    /// Instantiating the input node is the one state transition that stops an engine
    /// starting under `.playback`, and AVAudioEngine offers no way to observe or undo
    /// it. Tests need to reach that state without real capture hardware, whose
    /// availability differs between simulators.
    func instantiateInputNodeForTesting() {
        _ = instantiatedInputNode()
    }
    #endif

    /// Hardware input can remain disabled on an engine first used for playback.
    /// Re-query the real route, then rebuild that engine once if its cached input
    /// still has no format. Never invent a sample rate for an unavailable device.
    /// The input node, its tap and the pitch pipeline, held together so a failed
    /// engine start can tear the whole thing down and build it again on a
    /// replacement graph. `detach` is idempotent and safe on a graph that has
    /// already been thrown away.
    private struct MicrophoneAttachment {
        let input: AVAudioInputNode
        let format: AVAudioFormat
        let pipeline: PitchPipeline

        func detach() {
            input.removeTap(onBus: 0)
            pipeline.deactivate()
        }
    }

    /// Prepares the input node, installs the tap, and wires the pitch pipeline.
    /// Split out of `acquireMicrophone` so it can be run a second time against a
    /// rebuilt engine: a rebuild replaces the graph wholesale, so the node and
    /// tap from the first attempt do not survive it.
    private func attachMicrophoneInput(
        id: UUID,
        profile: PitchTrackingProfile
    ) async throws -> MicrophoneAttachment {
        let (input, format) = try await prepareMicrophoneInput(id: id, profile: profile)

        let pipeline = try PitchPipeline(inputFormat: format, profile: profile) { [weak self] reading, capturedAt in
            Task { @MainActor in
                guard let self,
                      self.activeMicrophone?.id == id,
                      profile.acceptsDelivery(capturedAt: capturedAt)
                else { return }
                self.activeMicrophone?.continuation.yield(reading)
            }
        }
        input.removeTap(onBus: 0)
        let requestedTapFrames = AVAudioFrameCount(max(
            Int(ceil(Double(profile.analysisHopSize) * format.sampleRate / 16_000)),
            1
        ))
        // AVAudioEngine invokes taps on its audio queue. An unannotated
        // closure here inherits MainActor and traps when the first buffer arrives.
        input.installTap(onBus: 0, bufferSize: requestedTapFrames, format: format) { @Sendable buffer, _ in
            pipeline.consume(buffer)
        }
        let attachment = MicrophoneAttachment(input: input, format: format, pipeline: pipeline)
        guard pendingMicrophone?.id == id else {
            attachment.detach()
            throw CancellationError()
        }
        return attachment
    }

    /// The rebuild that follows a failed capture start. Recovery owns the graph
    /// while it runs, and a rebuild racing a session the system is tearing down
    /// would only trade one failure for another, so both are refused here. Unlike
    /// `canRetryEngineStartAfterRebuild`, this deliberately permits an in-flight
    /// microphone: this *is* that microphone's own start, and re-attaching is the
    /// point of the rebuild.
    private func canRebuildForMicrophoneStart() -> Bool {
        guard !recoveryInProgress, !isRetryingEngineStart else { return false }
        return appIsActive && hardware.isAppActive()
    }

    private func prepareMicrophoneInput(
        id: UUID,
        profile: PitchTrackingProfile
    ) async throws -> (AVAudioInputNode, AVAudioFormat) {
        let session = AVAudioSession.sharedInstance()
        for attempt in 0..<4 {
            try Task.checkCancellation()
            guard let pending = pendingMicrophone, pending.id == id else { throw CancellationError() }
            try configureSession(
                category: .playAndRecord,
                captureProfile: profile,
                captureOwner: pending.owner
            )

            if session.currentRoute.inputs.isEmpty,
               let builtIn = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
                try audioOperation("microphone.preferredInput") { try session.setPreferredInput(builtIn) }
            }
            let input = instantiatedInputNode()
            let hardware = input.inputFormat(forBus: 0)
            let format = input.outputFormat(forBus: 0)
            recordAudioEvent("microphone.inputFormatObserved", details: [
                "inputSampleRate": String(hardware.sampleRate), "inputChannels": String(hardware.channelCount),
                "tapSampleRate": String(format.sampleRate), "tapChannels": String(format.channelCount)
            ])
            if hardware.sampleRate.isFinite, hardware.sampleRate > 0, hardware.channelCount > 0,
               format.sampleRate.isFinite, format.sampleRate > 0, format.channelCount > 0 {
                return (input, format)
            }
            let routes = session.currentRoute.inputs.map { $0.portType.rawValue }.joined(separator: ",")
            logger.warning("Microphone input not ready (attempt \(attempt + 1)): hardware \(hardware.sampleRate) Hz / \(hardware.channelCount) ch; tap \(format.sampleRate) Hz / \(format.channelCount) ch; routes \(routes, privacy: .public)")
            if attempt == 1 {
                // Keeps the renderer's quiz position/settings, replacing only the
                // device graph that may have cached a playback-only input node.
                invalidatePreviewPlayback()
                rebuildAudioEngine()
            }
            if attempt < 3 { try await Task.sleep(for: .milliseconds(150)) }
        }
        throw AcquiringAudioError.engine(Self.microphoneStartFailureMessage)
    }

    /// Both ways a capture can fail to start — no usable input format, and an
    /// engine start that survives a rebuild — say the same thing to the singer,
    /// because from the dock they are the same event. One constant so the two
    /// cannot drift into near-identical variants.
    static let microphoneStartFailureMessage =
        "The iPhone microphone could not start. Try recording again; if it persists, close and reopen the app."

    /// `.measurement` is the closest iOS has to Android's UNPROCESSED input, and the
    /// interval tool wants it: it pauses the song, owns the device alone, and is
    /// measuring a sung pitch to the cent.
    ///
    /// It cannot be used for persistent monitoring. The mode is a property of the whole
    /// session, not of its input, so it strips processing from the *output* too - the
    /// song keeps playing underneath monitoring, and in measurement mode it plays thin
    /// and far too quiet. Default mode also gives that capture echo cancellation, which
    /// monitoring specifically needs: without it the detector hears the backing track
    /// through the speaker and tracks the song rather than the singer.
    private func captureMode(for owner: MicrophoneOwner?) -> AVAudioSession.Mode {
        switch owner {
        case .singingTool: .measurement
        case .persistentPractice, nil: .default
        }
    }

    private func configureSession(
        category: AVAudioSession.Category,
        captureProfile: PitchTrackingProfile? = nil,
        captureOwner: MicrophoneOwner? = nil
    ) throws {
        recordAudioEvent("session.configure", details: ["requestedCategory": category.rawValue])
        let session = AVAudioSession.sharedInstance()
        let options: AVAudioSession.CategoryOptions = category == .playAndRecord
            ? [.defaultToSpeaker, .allowAirPlay, .allowBluetoothA2DP, .allowBluetoothHFP]
            : []
        let owner = captureOwner ?? activeMicrophone?.owner ?? pendingMicrophone?.owner
        let mode: AVAudioSession.Mode = category == .playAndRecord ? captureMode(for: owner) : .default

        if session.category != category || session.mode != mode || session.categoryOptions != options {
            // Leaving a recording category while this engine still holds an input node is
            // refused with '!pri', and the refusal sticks: every later preview and quiz
            // start re-attempts the same change, fails the same way, and the device has no
            // sound until the app is restarted. AVAudioEngine cannot detach an input node,
            // so the graph has to go before the category can.
            if category != .playAndRecord { retireInputNodeBeforeCategoryChange() }
            do {
                try audioOperation("session.setCategory") { try session.setCategory(category, mode: mode, options: options) }
            } catch {
                logger.error(
                    "Audio session category setup failed for \(category.rawValue, privacy: .public): \(error.localizedDescription, privacy: .public)"
                )
                throw AcquiringAudioError.session(error.localizedDescription)
            }
        }

        if category == .playAndRecord {
            let profile = captureProfile ?? activeMicrophone?.profile ?? .standard
            // Capture is about to leave preferences on the session that only make
            // sense for capture; arm the cleanup that playback performs later.
            needsPlaybackCapturePreferenceReset = true
            do {
                // These are preferences, not assumptions. The tap's resolved format
                // is always converted to the Android-equivalent 16 kHz analysis stream.
                if abs(session.preferredSampleRate - 16_000) > 0.5 {
                    try audioOperation("session.preferredSampleRate") { try session.setPreferredSampleRate(16_000) }
                }
                let preferredDuration = Double(profile.analysisHopSize) / 16_000
                if abs(session.preferredIOBufferDuration - preferredDuration) > 0.000_001 {
                    try audioOperation("session.preferredIOBufferDuration") { try session.setPreferredIOBufferDuration(preferredDuration) }
                }
            } catch {
                logger.info(
                    "Audio capture preference was unavailable; using resolved hardware format: \(error.localizedDescription, privacy: .public)"
                )
            }
        } else if category == .playback, needsPlaybackCapturePreferenceReset {
            // A field report showed a 16 kHz capture preference still standing on a
            // playback session hours later. Zero restores the system default for
            // both preferences capture set. Disarm first so a device that refuses
            // the request cannot re-record the attempt on every later playback
            // start, and attempt each independently so one refusal cannot strand
            // the other.
            needsPlaybackCapturePreferenceReset = false
            do {
                try audioOperation("session.resetPlaybackSampleRate") { try session.setPreferredSampleRate(0) }
            } catch {
                logger.info(
                    "Playback sample rate reset was unavailable; using resolved hardware format: \(error.localizedDescription, privacy: .public)"
                )
            }
            do {
                try audioOperation("session.resetPlaybackIOBufferDuration") { try session.setPreferredIOBufferDuration(0) }
            } catch {
                logger.info(
                    "Playback IO buffer reset was unavailable; using resolved hardware duration: \(error.localizedDescription, privacy: .public)"
                )
            }
        }

        do {
            try audioOperation("session.activate") { try hardware.setSessionActive(true) }
        } catch {
            logger.error(
                "Audio session activation failed for \(category.rawValue, privacy: .public): \(error.localizedDescription, privacy: .public)"
            )
            throw AcquiringAudioError.session(error.localizedDescription)
        }
    }

    private func configureSessionForCurrentNeeds() throws {
        if let activeMicrophone {
            try configureSession(
                category: .playAndRecord,
                captureProfile: activeMicrophone.profile,
                captureOwner: activeMicrophone.owner
            )
        } else if let pendingMicrophone {
            // Playback/previews must not turn input off while acquisition is settling.
            try configureSession(
                category: .playAndRecord,
                captureProfile: pendingMicrophone.profile,
                captureOwner: pendingMicrophone.owner
            )
        } else {
            try configureSession(category: .playback)
        }
    }

    /// Retires a graph holding an input node so the session can leave `.playAndRecord`.
    ///
    /// Distinct from `replaceEngineIfInputNodeBlocksPlayback`, which runs before a start on
    /// an already-stopped engine. This one runs on whatever is there, including a running
    /// capture graph, because the category change is refused otherwise. `rebuildAudioEngine`
    /// stops the engine first, so it cannot cut audio mid-render; an in-flight preview is
    /// retired with it, which the category change would have broken anyway.
    private func retireInputNodeBeforeCategoryChange() {
        guard engineHasInputNode, pendingMicrophone == nil, activeMicrophone == nil else { return }
        recordAudioEvent("engine.replaceBeforeCategoryChange")
        invalidatePreviewPlayback()
        rebuildAudioEngine()
    }

    private static func makeSourceNode(
        format: AVAudioFormat,
        renderer: LockedQuizRenderer
    ) -> AVAudioSourceNode {
        AVAudioSourceNode(format: format) { @Sendable _, _, frameCount, audioBufferList in
            renderer.render(frameCount: frameCount, audioBufferList: audioBufferList)
        }
    }

    private func rebuildAudioEngine() {
        recordAudioEvent("engine.rebuild.begin")
        engine.stop()
        player.stop()
        let replacementEngine = AVAudioEngine()
        let replacementPlayer = AVAudioPlayerNode()
        let replacementSource = Self.makeSourceNode(format: playbackFormat, renderer: quizRenderer)
        replacementEngine.attach(replacementPlayer)
        replacementEngine.attach(replacementSource)
        replacementEngine.connect(replacementPlayer, to: replacementEngine.mainMixerNode, format: playbackFormat)
        replacementEngine.connect(replacementSource, to: replacementEngine.mainMixerNode, format: playbackFormat)
        engine = replacementEngine
        player = replacementPlayer
        sourceNode = replacementSource
        // The replacement graph has never had its input node read, which is the
        // whole point of building one: this is the only way the flag clears.
        engineHasInputNode = false
        recordAudioEvent("engine.rebuild.succeeded")
    }

    private func supersedeMicrophone(with id: UUID) {
        recordAudioEvent("microphone.transfer")
        if let pending = pendingMicrophone, pending.id != id {
            pendingMicrophone = nil
            pending.continuation.finish(throwing: CancellationError())
        }
        guard let active = activeMicrophone, active.id != id else { return }
        activeMicrophone = nil
        removeMicrophoneTapIfInstalled()
        active.pipeline.deactivate()
        active.continuation.finish()
        transitionSessionAfterMicrophoneRelease()
        logger.info("Microphone ownership transferred")
    }

    private func releaseMicrophone(id: UUID) {
        recordAudioEvent("microphone.release")
        if let pending = pendingMicrophone, pending.id == id {
            pendingMicrophone = nil
            pending.continuation.finish()
            transitionSessionAfterMicrophoneRelease()
            return
        }
        guard let active = activeMicrophone, active.id == id else { return }
        activeMicrophone = nil
        removeMicrophoneTapIfInstalled()
        active.pipeline.deactivate()
        active.continuation.finish()
        transitionSessionAfterMicrophoneRelease()
        logger.info("Microphone pitch capture stopped")
    }

    private func failMicrophone(id: UUID, error: any Error) {
        if let pending = pendingMicrophone, pending.id == id {
            pendingMicrophone = nil
            pending.continuation.finish(throwing: error)
            transitionSessionAfterMicrophoneRelease()
            return
        }
        guard let active = activeMicrophone, active.id == id else { return }
        activeMicrophone = nil
        removeMicrophoneTapIfInstalled()
        active.pipeline.deactivate()
        active.continuation.finish(throwing: error)
        transitionSessionAfterMicrophoneRelease()
        logger.error("Microphone pitch capture failed: \(error.localizedDescription, privacy: .public)")
    }

    private func stopAllMicrophoneCapture() {
        recordAudioEvent("microphone.stopAll")
        if let pending = pendingMicrophone {
            pendingMicrophone = nil
            pending.continuation.finish()
        }
        if let active = activeMicrophone {
            activeMicrophone = nil
            removeMicrophoneTapIfInstalled()
            active.pipeline.deactivate()
            active.continuation.finish()
            logger.info("Microphone pitch capture stopped")
        }
        transitionSessionAfterMicrophoneRelease()
    }

    private func failAllMicrophoneCapture(
        _ error: any Error,
        transitionSession: Bool = true
    ) {
        recordAudioEvent("microphone.finishAll")
        if let pending = pendingMicrophone {
            pendingMicrophone = nil
            pending.continuation.finish(throwing: error)
        }
        if let active = activeMicrophone {
            activeMicrophone = nil
            removeMicrophoneTapIfInstalled()
            active.pipeline.deactivate()
            active.continuation.finish(throwing: error)
            logger.error("Microphone pitch capture ended: \(error.localizedDescription, privacy: .public)")
        }
        if transitionSession { transitionSessionAfterMicrophoneRelease() }
    }

    private func transitionSessionAfterMicrophoneRelease() {
        do {
            if let pendingMicrophone {
                try configureSession(
                    category: .playAndRecord,
                    captureProfile: pendingMicrophone.profile,
                    captureOwner: pendingMicrophone.owner
                )
                return
            }
            if quizPlaybackRequested || player.isPlaying {
                try configureSession(category: .playback)
                if quizPlaybackRequested { try startEngineIfNeeded(operation: "microphone.release.engineStart") }
            } else {
                engine.stop()
                try audioOperation("session.deactivateAfterCapture") {
                    try hardware.setSessionActive(false)
                }
            }
        } catch {
            logger.error("Audio session transition after capture failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func isCurrentQuiz(
        songID: String,
        sectionID: String,
        tempoPercent: Double,
        revision: UInt64,
        soundConfiguration: QuizSoundConfiguration
    ) -> Bool {
        revision == quizRevision
            && quizContext == QuizAudioContext(
                songID: songID,
                sectionID: sectionID,
                tempoPercent: tempoPercent,
                soundConfiguration: soundConfiguration
            )
    }

    /// Every preview the app plays uses the instrument currently selected, the singing
    /// tool's exact replays included - the instrument is a global choice, and a tool that
    /// answered in a different timbre from the cards beside it read as a bug. Only the
    /// quiz transpose is opt-in, because those replays are of measured frequencies and
    /// shifting them would answer a question the singer did not ask.
    private func configuredPreview(_ request: PreviewRequest) -> PreviewRequest {
        let transposeSemitones = request.appliesQuizTranspose
            ? (quizContext?.soundConfiguration.transposeSemitones ?? 0)
            : 0
        let pitchRatio = pow(2, Double(transposeSemitones) / 12)
        return PreviewRequest(
            frequenciesHz: request.frequenciesHz.map { $0 * pitchRatio },
            duration: request.duration,
            arpeggiates: request.arpeggiates,
            arpeggioStep: request.arpeggioStep,
            waveform: sessionInstrument,
            gain: request.gain,
            appliesQuizTranspose: false
        )
    }

    private var isQuizTempoPaused: Bool {
        (quizContext?.tempoPercent ?? 100) <= 0
    }

    private func pauseQuizForZeroTempo() {
        transportPollTask?.cancel()
        quizRenderer.pause()
        let snapshot = quizRenderer.snapshot()
        publish(TransportState(
            phase: .paused,
            elapsed: .seconds(snapshot.elapsed),
            duration: .seconds(snapshot.duration)
        ))
    }

    private func clearPreviewRender(ifToken token: UInt64) {
        if previewRender?.token == token { previewRender = nil }
    }

    private func invalidatePreviewPlayback() {
        let token = previewGeneration.begin()
        previewRender?.task.cancel()
        previewRender = nil
        Task { @MainActor [weak self] in
            await self?.retirePreviewPlayback(ifCurrent: token)
        }
    }

    private func stopPreviewPlayback(ifCurrent token: UInt64) async {
        guard previewGeneration.isCurrent(token) else { return }
        previewRender?.task.cancel()
        previewRender = nil
        await retirePreviewPlayback(ifCurrent: token)
        previewGeneration.invalidate(ifCurrent: token)
    }

    private func retirePreviewPlayback(ifCurrent token: UInt64) async {
        guard previewGeneration.isCurrent(token) else { return }
        guard player.isPlaying, player.volume > 0 else {
            player.stop()
            player.volume = 1
            return
        }

        let startingVolume = player.volume
        let stepCount = 6
        for step in 1...stepCount {
            try? await Task.sleep(for: .milliseconds(4))
            guard previewGeneration.isCurrent(token) else { return }
            player.volume = startingVolume * (1 - Float(step) / Float(stepCount))
        }
        guard previewGeneration.isCurrent(token) else { return }
        player.stop()
        player.volume = 1
    }

    private static func frequency(forMIDINote midiNote: Int) -> Double {
        440 * pow(2, Double(midiNote - 69) / 12)
    }

    private func publish(_ state: TransportState) {
        transportState = state
        for continuation in stateContinuations.values { continuation.yield(state) }
    }

    private func beginTransportPolling() {
        transportPollTask?.cancel()
        transportPollTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(50))
                guard let self, !Task.isCancelled else { return }
                let snapshot = quizRenderer.snapshot()
                publish(TransportState(
                    phase: .playing,
                    elapsed: .seconds(snapshot.elapsed),
                    duration: .seconds(snapshot.duration)
                ))
            }
        }
    }

    private func observeAudioSession() {
        notificationTasks = [
            Task { @MainActor [weak self] in
                for await notification in NotificationCenter.default.notifications(named: AVAudioSession.interruptionNotification) {
                    guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                          let type = AVAudioSession.InterruptionType(rawValue: raw)
                    else { continue }
                    if type == .began {
                        self?.handleInterruptionBegan()
                    } else {
                        let rawOptions = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                        let options = AVAudioSession.InterruptionOptions(rawValue: rawOptions)
                        self?.handleInterruptionEnded(systemAllowsResume: options.contains(.shouldResume))
                    }
                }
            },
            Task { @MainActor [weak self] in
                for await notification in NotificationCenter.default.notifications(named: AVAudioSession.routeChangeNotification) {
                    let rawReason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
                    self?.handleRouteChange(AVAudioSession.RouteChangeReason(rawValue: rawReason) ?? .unknown)
                }
            },
            Task { @MainActor [weak self] in
                for await notification in NotificationCenter.default.notifications(named: .AVAudioEngineConfigurationChange) {
                    guard let self, notification.object as? AVAudioEngine === self.engine else { continue }
                    self.handleEngineConfigurationChange()
                }
            },
            Task { @MainActor [weak self] in
                for await _ in NotificationCenter.default.notifications(named: AVAudioSession.mediaServicesWereResetNotification) {
                    self?.handleMediaServicesReset()
                }
            },
            Task { @MainActor [weak self] in
                for await _ in NotificationCenter.default.notifications(named: UIApplication.willResignActiveNotification) {
                    self?.appIsActive = false
                    self?.recordAudioEvent("app.willResignActive")
                }
            },
            Task { @MainActor [weak self] in
                for await _ in NotificationCenter.default.notifications(named: UIApplication.didBecomeActiveNotification) {
                    self?.handleAppBecameActive()
                }
            },
            Task { @MainActor [weak self] in
                for await _ in NotificationCenter.default.notifications(named: UIApplication.didEnterBackgroundNotification) {
                    guard let self else { continue }
                    self.appIsActive = false
                    self.recordAudioEvent("app.didEnterBackground")
                    guard self.pendingMicrophone != nil || self.activeMicrophone != nil else { continue }
                    self.stopAllMicrophoneCapture()
                    self.logger.info("Microphone capture stopped in the background")
                }
            }
        ]
    }

    /// iOS does not guarantee an `.ended` interruption notification, and a field
    /// report showed two `session.interruptionBegan` with no `.ended` ever arriving.
    /// Foregrounding is the point at which a latched resume can no longer honestly
    /// be honored, so retire it here rather than leave it standing to authorize a
    /// later, unrelated `.ended`.
    ///
    /// This deliberately does not resume playback. Backgrounding already runs
    /// `pauseForAppInactivity()`, which clears both this latch and the playback
    /// request, and the app's design is that returning to the foreground requires an
    /// explicit Play.
    ///
    /// `didBecomeActive` and the interruption notification are independent streams
    /// with no ordering guarantee, so this could in principle retire a latch just as
    /// a genuine `.ended` arrives. That race is benign here: reaching this method at
    /// all means the app went inactive, and every route out of active runs
    /// `pauseForAppInactivity()`, which has already cleared the playback request
    /// that `handleInterruptionEnded` requires before it will resume. An interruption
    /// the app stays active through — the only kind `.ended` can still resume — never
    /// reaches this method. So this is hygiene against a flag outliving its meaning,
    /// not a change to any currently reachable playback behavior.
    func handleAppBecameActive() {
        appIsActive = true
        recordAudioEvent("app.didBecomeActive")
        guard shouldResumeAfterInterruption else { return }
        shouldResumeAfterInterruption = false
        recordAudioEvent("session.staleResumeRetired")
    }

    func handleInterruptionBegan() {
        audioRecoveryGeneration &+= 1
        recordAudioEvent("session.interruptionBegan")
        shouldResumeAfterInterruption = quizPlaybackRequested
            && (transportState.phase == .playing || transportState.phase == .buffering)
        transportPollTask?.cancel()
        invalidatePreviewPlayback()
        failAllMicrophoneCapture(
            AcquiringAudioError.session("Microphone capture was interrupted."),
            transitionSession: false
        )
        quizRenderer.pause()
        let snapshot = quizRenderer.snapshot()
        publish(TransportState(
            phase: .paused,
            elapsed: .seconds(snapshot.elapsed),
            duration: .seconds(snapshot.duration)
        ))
        logger.info("Audio interruption began")
    }

    private func handleInterruptionEnded(systemAllowsResume: Bool) {
        recordAudioEvent("session.interruptionEnded", details: ["systemAllowsResume": String(systemAllowsResume)])
        guard !recoveryInProgress else { return }
        let playbackWasAwaitingResume = shouldResumeAfterInterruption
        let shouldResume = systemAllowsResume
            && playbackWasAwaitingResume
            && quizPlaybackRequested
            && quizTimelineLoaded
            && !isQuizTempoPaused
        shouldResumeAfterInterruption = false
        if playbackWasAwaitingResume, !systemAllowsResume {
            quizPlaybackRequested = false
        }
        logger.info("Audio interruption ended; resume allowed: \(shouldResume, privacy: .public)")
        guard shouldResume else { return }
        do {
            try startQuizPlayback(expectedRevision: quizRevision)
        } catch {
            publishPlaybackFailure(error)
        }
    }

    private func handleRouteChange(_ reason: AVAudioSession.RouteChangeReason) {
        recordAudioEvent("session.routeChanged", details: ["reason": String(reason.rawValue)])
        logger.info("Audio route changed: \(reason.rawValue, privacy: .public)")
        guard reason == .oldDeviceUnavailable else { return }
        audioRecoveryGeneration &+= 1
        shouldResumeAfterInterruption = false
        quizPlaybackRequested = false
        transportPollTask?.cancel()
        invalidatePreviewPlayback()
        failAllMicrophoneCapture(AcquiringAudioError.session("The audio input route was disconnected."))
        quizRenderer.pause()
        let snapshot = quizRenderer.snapshot()
        publish(TransportState(
            phase: .paused,
            elapsed: .seconds(snapshot.elapsed),
            duration: .seconds(snapshot.duration)
        ))
    }

    private func handleEngineConfigurationChange() {
        recordAudioEvent("engine.configurationChanged")
        guard !recoveryInProgress else { return }
        invalidatePreviewPlayback()
        if let activeMicrophone {
            let inputFormat = instantiatedInputNode().outputFormat(forBus: 0)
            if abs(inputFormat.sampleRate - activeMicrophone.sampleRate) > 0.5
                || inputFormat.channelCount != activeMicrophone.channelCount {
                failAllMicrophoneCapture(
                    AcquiringAudioError.engine("The audio input format changed. Start listening again."),
                    transitionSession: false
                )
            }
        }
        guard quizPlaybackRequested, quizTimelineLoaded, !isQuizTempoPaused else { return }
        do {
            try configureSessionForCurrentNeeds()
            try startEngineIfNeeded(operation: "configurationChange.engineStart")
            quizRenderer.play()
            let snapshot = quizRenderer.snapshot()
            publish(TransportState(
                phase: .playing,
                elapsed: .seconds(snapshot.elapsed),
                duration: .seconds(snapshot.duration)
            ))
            beginTransportPolling()
        } catch {
            publishPlaybackFailure(error)
        }
    }

    private func handleMediaServicesReset() {
        audioRecoveryGeneration &+= 1
        recordAudioEvent("session.mediaServicesReset")
        if recoveryInProgress {
            invalidateQuizPlaybackOwner()
            invalidatePreviewPlayback()
            return
        }
        transportPollTask?.cancel()
        invalidatePreviewPlayback()
        failAllMicrophoneCapture(
            AcquiringAudioError.session("Audio services restarted. Start listening again."),
            transitionSession: false
        )
        quizRenderer.pause()
        rebuildAudioEngine()
        guard quizPlaybackRequested, quizTimelineLoaded, !isQuizTempoPaused else {
            let snapshot = quizRenderer.snapshot()
            publish(TransportState(
                phase: transportState.phase == .stopped ? .stopped : .paused,
                elapsed: .seconds(snapshot.elapsed),
                duration: .seconds(snapshot.duration)
            ))
            return
        }
        do {
            try startQuizPlayback(expectedRevision: quizRevision)
        } catch {
            publishPlaybackFailure(error)
        }
    }

    func exportDiagnostics() throws -> URL {
        recordAudioEvent("diagnostics.export")
        return try diagnostics.export()
    }

    /// Once `engine.inputNode` has been instantiated, that engine can never start
    /// again while the session category is `.playback`: input is unavailable, the
    /// input route is empty, and `start()` throws 'what' (2003329396) for the life
    /// of the instance. AVAudioEngine cannot detach an input node, so a replacement
    /// graph is the only cure — this is what the manual Reset Audio and Retry was
    /// really doing when a tester confirmed it restored sound.
    ///
    /// Doing it here rather than at the microphone release is deliberate. The
    /// caller has already established that the engine is stopped, and a stopped
    /// engine cannot be rendering, so replacing it can never cut audible audio. An
    /// eager rebuild at release time would run while a preview was still playing.
    ///
    /// Unlike `canRetryEngineStartAfterRebuild()`, this deliberately does not test
    /// whether the app is active. That guard exists to stop a *reactive* rebuild
    /// from racing a session the system is already tearing down, after a start has
    /// failed. This one runs before a start that a poisoned graph would fail
    /// anyway, on an engine that is already stopped, so refusing it here would only
    /// convert a start that could have succeeded into a user-visible alert.
    private func replaceEngineIfInputNodeBlocksPlayback() {
        guard engineHasInputNode else { return }
        // Capture still owns the graph it is settling into; replacing it here would
        // pull the input node out from under an acquisition that is mid-flight.
        guard pendingMicrophone == nil, activeMicrophone == nil else { return }
        recordAudioEvent("engine.replaceBeforePlaybackStart")
        rebuildAudioEngine()
    }

    /// The explicit reset experiment owns the rebuild while it runs; a second
    /// rebuild inside its own retry step would race its stages and hide the outcome
    /// the tester is trying to send us.
    private func canRetryEngineStartAfterRebuild() -> Bool {
        guard !recoveryInProgress, !isRetryingEngineStart else { return false }
        guard pendingMicrophone == nil, activeMicrophone == nil else { return false }
        return appIsActive && hardware.isAppActive()
    }

    private func startEngineIfNeeded(operation: String) throws {
        guard !engine.isRunning else { return }
        replaceEngineIfInputNodeBlocksPlayback()
        do {
            try audioOperation(operation) { try hardware.startEngine(engine) }
        } catch let startFailure {
            // One rebuild, one retry, written straight-line: there is no call back
            // into this function and no loop, so a third attempt is unreachable by
            // construction rather than by a counter that could drift.
            guard canRetryEngineStartAfterRebuild() else { throw startFailure }
            isRetryingEngineStart = true
            // The retry's own failure must not displace the report. `record`
            // latches any non-recovery error event as the new failure, wiping
            // `subsequentEvents`, so without this the exported report would head
            // itself with a graph rebuilt milliseconds earlier -- whose
            // `engineInputNodeInstantiated` is false by construction -- and lose
            // the first failure, the only one that describes what went wrong.
            diagnostics.isRetrying = true
            defer {
                isRetryingEngineStart = false
                diagnostics.isRetrying = false
            }
            rebuildAudioEngine()
            do {
                try audioOperation(operation + ".retryAfterRebuild") {
                    try hardware.startEngine(engine)
                }
            } catch {
                // Both attempts are already in the diagnostic history. Surface the
                // first failure, because that is the one describing the state the
                // rebuild was trying to cure.
                throw startFailure
            }
        }
    }

    private func audioOperation(_ operation: String, _ body: () throws -> Void) throws {
        recordAudioEvent(operation + ".begin")
        do {
            try body()
            recordAudioEvent(operation + ".succeeded")
        } catch {
            // Capture the original NSError before callers wrap it for display.
            recordAudioEvent(operation + ".failed", error: error)
            throw error
        }
    }

    private func recordAudioEvent(
        _ operation: String,
        details: [String: String] = [:],
        error: (any Error)? = nil
    ) {
        let session = AVAudioSession.sharedInstance()
        let output = engine.outputNode.outputFormat(forBus: 0)
        let mixer = engine.mainMixerNode.outputFormat(forBus: 0)
        var system = utsname()
        uname(&system)
        let model = withUnsafePointer(to: &system.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: MemoryLayout.size(ofValue: utsname().machine)) {
                String(cString: $0)
            }
        }
        var state: [String: String] = [
            "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
            "version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
            "deviceModel": model,
            "iOSVersion": UIDevice.current.systemVersion,
            "appState": String(UIApplication.shared.applicationState.rawValue),
            "category": session.category.rawValue,
            "mode": session.mode.rawValue,
            "categoryOptions": String(session.categoryOptions.rawValue),
            "inputPortTypes": session.currentRoute.inputs.map { $0.portType.rawValue }.joined(separator: ","),
            "outputPortTypes": session.currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ","),
            "sampleRate": String(session.sampleRate),
            "preferredSampleRate": String(session.preferredSampleRate),
            "ioBufferDuration": String(session.ioBufferDuration),
            "outputSampleRate": String(output.sampleRate),
            "outputChannels": String(output.channelCount),
            "mixerSampleRate": String(mixer.sampleRate),
            "mixerChannels": String(mixer.channelCount),
            "playbackSampleRate": String(playbackFormat.sampleRate),
            "engineRunning": String(engine.isRunning),
            "previewPlaying": String(player.isPlaying),
            "quizRequested": String(quizPlaybackRequested),
            "microphonePending": String(pendingMicrophone != nil),
            "microphoneActive": String(activeMicrophone != nil),
            "recoveryInProgress": String(recoveryInProgress),
            // The exact condition behind the field failure, readable straight from
            // the next exported report instead of inferred from the event order.
            "engineInputNodeInstantiated": String(engineHasInputNode),
            "preferredIOBufferDuration": String(session.preferredIOBufferDuration)
        ]
        // Read the input node only on a graph that already has one. Testing
        // `engineHasInputNode` too is what keeps recording an event from being
        // the thing that poisons a graph: `rebuildAudioEngine` clears the flag
        // and then records `engine.rebuild.succeeded`, so an active microphone
        // here would otherwise re-instantiate the node on the replacement and
        // set the flag straight back to true.
        if activeMicrophone != nil, engineHasInputNode {
            let inputNode = instantiatedInputNode()
            let input = inputNode.inputFormat(forBus: 0)
            let tap = inputNode.outputFormat(forBus: 0)
            state["inputSampleRate"] = String(input.sampleRate)
            state["inputChannels"] = String(input.channelCount)
            state["tapSampleRate"] = String(tap.sampleRate)
            state["tapChannels"] = String(tap.channelCount)
        }
        state.merge(details) { _, new in new }
        diagnostics.record(AudioDiagnosticEvent(operation: operation, state: state, error: error))
    }

    func resetAudioAndRetryQuiz(revision: UInt64, owner: QuizPlaybackOwner) async throws {
        try await recoverAudio(
            isCurrent: { self.ownsQuiz(revision: revision, owner: owner) },
            retry: { try self.startQuizPlayback(expectedRevision: revision, expectedOwner: owner) }
        )
    }

    func resetAudioAndRetryPreview() async throws {
        guard let failedPreview else { throw CancellationError() }
        var token = failedPreview.token
        try await recoverAudio(
            isCurrent: { self.previewGeneration.isCurrent(token) },
            afterCleanup: { token = self.previewGeneration.begin() },
            retry: {
                guard try await self.schedulePreview(failedPreview.request, token: token) else { throw CancellationError() }
            }
        )
    }

    private func recoverAudio(
        isCurrent: @escaping @MainActor () -> Bool,
        afterCleanup: @escaping @MainActor () -> Void = {},
        retry: @escaping @MainActor () async throws -> Void
    ) async throws {
        guard !recoveryInProgress, isCurrent(), appIsActive,
              hardware.isAppActive() else { throw CancellationError() }
        try Task.checkCancellation()
        recoveryInProgress = true
        diagnostics.beginRecovery()
        let generation = audioRecoveryGeneration
        defer {
            recordAudioEvent("recovery.finished")
            recoveryInProgress = false
            diagnostics.isRecovering = false
        }
        do {
            try await AudioRecoveryExperiment.run(
                isCurrent: {
                    isCurrent() && self.appIsActive && self.audioRecoveryGeneration == generation
                        && self.hardware.isAppActive()
                },
                steps: [
                    .init(name: "cleanup", run: {
                        self.quizPlaybackRequested = false
                        self.shouldResumeAfterInterruption = false
                        self.transportPollTask?.cancel()
                        self.invalidatePreviewPlayback()
                        self.failedPreview = nil
                        self.quizRenderer.pause()
                        self.failAllMicrophoneCapture(
                            AcquiringAudioError.session("Audio was reset. Start listening again."),
                            transitionSession: false
                        )
                        self.engine.stop()
                        self.player.stop()
                        afterCleanup()
                    }),
                    .init(name: "deactivate", run: {
                        try self.hardware.setSessionActive(false)
                    }),
                    .init(name: "rebuild", run: { self.rebuildAudioEngine() }),
                    .init(name: "activate", run: { try self.configureSessionForCurrentNeeds() }),
                    .init(name: "retry", run: retry)
                ],
                record: { self.recordAudioEvent($0, error: $1) }
            )
        } catch {
            self.quizPlaybackRequested = false
            self.shouldResumeAfterInterruption = false
            self.transportPollTask?.cancel()
            self.invalidatePreviewPlayback()
            self.player.stop()
            self.quizRenderer.pause()
            if error is CancellationError {
                let snapshot = self.quizRenderer.snapshot()
                self.publish(TransportState(phase: .paused, elapsed: .seconds(snapshot.elapsed), duration: .seconds(snapshot.duration)))
            } else {
                self.publishPlaybackFailure(error)
            }
            throw error
        }
    }

    private func publishPlaybackFailure(_ error: any Error) {
        quizRenderer.pause()
        let snapshot = quizRenderer.snapshot()
        publish(TransportState(
            phase: .failed,
            elapsed: .seconds(snapshot.elapsed),
            duration: .seconds(snapshot.duration),
            errorDescription: error.localizedDescription
        ))
        logger.error("Audio output recovery failed: \(error.localizedDescription, privacy: .public)")
    }
}

private struct PendingMicrophone {
    let id: UUID
    let owner: MicrophoneOwner
    let profile: PitchTrackingProfile
    let continuation: AsyncThrowingStream<PitchReading, any Error>.Continuation
}

private struct ActiveMicrophone {
    let id: UUID
    let owner: MicrophoneOwner
    let continuation: AsyncThrowingStream<PitchReading, any Error>.Continuation
    let pipeline: PitchPipeline
    let profile: PitchTrackingProfile
    let sampleRate: Double
    let channelCount: AVAudioChannelCount
}

private struct QuizAudioContext: Equatable {
    let songID: String
    let sectionID: String
    let tempoPercent: Double
    let soundConfiguration: QuizSoundConfiguration
}

final class PreviewPlaybackGeneration: @unchecked Sendable {
    private let lock = NSLock()
    private var value: UInt64 = 0

    func begin() -> UInt64 {
        lock.withLock {
            value &+= 1
            return value
        }
    }

    func isCurrent(_ candidate: UInt64) -> Bool {
        lock.withLock { value == candidate }
    }

    func invalidate() {
        lock.withLock { value &+= 1 }
    }

    @discardableResult
    func invalidate(ifCurrent candidate: UInt64) -> Bool {
        lock.withLock {
            guard value == candidate else { return false }
            value &+= 1
            return true
        }
    }
}

private final class LockedQuizRenderer: @unchecked Sendable {
    private let lock = NSLock()
    private let renderer: QuizPCMRenderer

    init(sampleRate: Double) {
        renderer = QuizPCMRenderer(sampleRate: sampleRate)
    }

    func configure(
        _ timeline: QuizTimeline,
        playbackRate: Double,
        preserveProgress: Bool,
        soundConfiguration: QuizSoundConfiguration? = nil
    ) -> (elapsed: Double, duration: Double) {
        lock.withLock {
            let progress = renderer.progress
            renderer.configure(timeline)
            if let soundConfiguration { renderer.setSoundConfiguration(soundConfiguration) }
            renderer.setPlaybackRate(playbackRate)
            if preserveProgress { renderer.seek(progress: progress) }
            return (renderer.progress * renderer.durationSeconds, renderer.durationSeconds)
        }
    }

    func play() { lock.withLock { renderer.play() } }
    func pause() { lock.withLock { renderer.pause() } }
    func stop() { lock.withLock { renderer.stop() } }
    func seek(progress: Double) { lock.withLock { renderer.seek(progress: progress) } }
    func setPlaybackRate(_ rate: Double) { lock.withLock { renderer.setPlaybackRate(rate) } }
    func setSoundConfiguration(_ configuration: QuizSoundConfiguration) {
        lock.withLock { renderer.setSoundConfiguration(configuration) }
    }

    func snapshot() -> (elapsed: Double, duration: Double) {
        lock.withLock { (renderer.progress * renderer.durationSeconds, renderer.durationSeconds) }
    }

    func render(frameCount: AVAudioFrameCount, audioBufferList: UnsafeMutablePointer<AudioBufferList>) -> OSStatus {
        let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
        guard let first = buffers.first, let data = first.mData else { return noErr }
        let count = min(Int(frameCount), Int(first.mDataByteSize) / MemoryLayout<Float>.size)
        let pointer = data.bindMemory(to: Float.self, capacity: count)
        lock.withLock {
            renderer.render(into: UnsafeMutableBufferPointer(start: pointer, count: count))
        }
        if buffers.count > 1 {
            for index in 1..<buffers.count {
                if let destination = buffers[index].mData {
                    memcpy(destination, data, min(Int(buffers[index].mDataByteSize), count * MemoryLayout<Float>.size))
                }
            }
        }
        return noErr
    }
}

private final class PitchPipeline: @unchecked Sendable {
    private let inputFormat: AVAudioFormat
    private let inputChannelCount: Int
    private let outputFormat: AVAudioFormat
    private let converter: AVAudioConverter
    private let queue = DispatchQueue(label: "com.acquiring.ios.pitch-pipeline", qos: .userInitiated)
    private let lifecycleLock = NSLock()
    private var active = true
    private let publish: @Sendable (PitchReading, ContinuousClock.Instant) -> Void
    private let analysisWindowSize: Int
    private let hopSize: Int
    private var smoother: PitchSmoother
    private var samples: [Int16] = []
    private var sampleCaptureTimes: [ContinuousClock.Instant] = []
    private var samplesSinceValidEstimate = 0

    init(
        inputFormat: AVAudioFormat,
        profile: PitchTrackingProfile,
        publish: @escaping @Sendable (PitchReading, ContinuousClock.Instant) -> Void
    ) throws {
        guard inputFormat.sampleRate.isFinite,
              inputFormat.sampleRate > 0,
              inputFormat.channelCount > 0,
              let monoInputFormat = AVAudioFormat(
                commonFormat: .pcmFormatFloat32,
                sampleRate: inputFormat.sampleRate,
                channels: 1,
                interleaved: false
              ),
              let outputFormat = AVAudioFormat(
                commonFormat: .pcmFormatFloat32,
                sampleRate: 16_000,
                channels: 1,
                interleaved: false
              ),
              let converter = AVAudioConverter(from: monoInputFormat, to: outputFormat)
        else { throw AcquiringAudioError.engine("Could not initialize the 16 kHz microphone converter.") }
        self.inputFormat = monoInputFormat
        inputChannelCount = Int(inputFormat.channelCount)
        self.outputFormat = outputFormat
        self.converter = converter
        self.publish = publish
        switch profile {
        case .standard:
            analysisWindowSize = 2_048
            hopSize = 512
            smoother = PitchSmoother(targetMIDI: 0, configuration: .standard)
        case .melodyFast:
            analysisWindowSize = 1_024
            hopSize = 256
            smoother = PitchSmoother(targetMIDI: 0, configuration: .melodyFast)
        }
        samples.reserveCapacity(4_096)
        sampleCaptureTimes.reserveCapacity(4_096)
    }

    func consume(_ buffer: AVAudioPCMBuffer) {
        guard isActive else { return }
        // Timestamp the end of this captured block before it enters the worker
        // queue. Fast tracking can then reject queued audio rather than treating
        // an old detection as fresh merely because it was delivered recently.
        let capturedAt = ContinuousClock.now
        guard let channels = buffer.floatChannelData else { return }
        let frameCount = Int(buffer.frameLength)
        let availableChannels = min(Int(buffer.format.channelCount), inputChannelCount)
        guard frameCount > 0, availableChannels > 0 else { return }
        var values = [Float](repeating: 0, count: frameCount)
        // Android requests CHANNEL_IN_MONO. The equivalent boundary on iOS is
        // an equal-power-neutral average when a route exposes multiple channels.
        for channelIndex in 0..<availableChannels {
            let channel = channels[channelIndex]
            for frame in 0..<frameCount { values[frame] += channel[frame] }
        }
        if availableChannels > 1 {
            let divisor = Float(availableChannels)
            for frame in values.indices { values[frame] /= divisor }
        }
        let monoValues = values
        queue.async { [self] in
            guard isActive else { return }
            convert(monoValues, capturedAt: capturedAt)
        }
    }

    func deactivate() {
        lifecycleLock.withLock { active = false }
    }

    private func convert(_ values: [Float], capturedAt: ContinuousClock.Instant) {
        guard isActive else { return }
        guard let input = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: AVAudioFrameCount(values.count)),
              let inputChannel = input.floatChannelData?[0]
        else { return }
        input.frameLength = input.frameCapacity
        values.withUnsafeBufferPointer { pointer in
            inputChannel.update(from: pointer.baseAddress!, count: values.count)
        }
        let ratio = outputFormat.sampleRate / inputFormat.sampleRate
        let capacity = AVAudioFrameCount(ceil(Double(values.count) * ratio) + 8)
        guard let output = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else { return }
        let supplier = ConverterInputSupplier(buffer: input)
        var conversionError: NSError?
        converter.convert(to: output, error: &conversionError) { _, status in
            supplier.next(status: status)
        }
        guard conversionError == nil, let channel = output.floatChannelData?[0] else { return }
        for value in UnsafeBufferPointer(start: channel, count: Int(output.frameLength)) {
            // A malformed route/converter sample must behave like silence; converting
            // NaN or infinity directly to Int would trap before the detector gates it.
            let bounded = value.isFinite ? min(max(value, -1), 1) : 0
            let pcm16: Int16
            if bounded <= -1 {
                pcm16 = .min
            } else if bounded >= 1 {
                pcm16 = .max
            } else {
                pcm16 = Int16(clamping: Int((bounded * 32_768).rounded()))
            }
            samples.append(pcm16)
            sampleCaptureTimes.append(capturedAt)
        }
        while isActive, samples.count >= analysisWindowSize {
            let window = Array(samples.prefix(analysisWindowSize))
            let windowCapturedAt = sampleCaptureTimes[analysisWindowSize - 1]
            let estimate = PitchDetector.estimate(samples: window, sampleRate: 16_000)
            let rawMIDI = AcquiringCore.MusicTheory.midi(frequency: estimate.frequencyHz)
            let isAcceptedEstimate = estimate.frequencyHz > 0
                && estimate.frequencyHz.isFinite
                && estimate.confidence >= 0.4
                && estimate.confidence.isFinite
                && estimate.rms >= 0.0005
                && estimate.rms.isFinite
                && rawMIDI.isFinite
            if isAcceptedEstimate {
                samplesSinceValidEstimate = 0
            } else {
                samplesSinceValidEstimate += hopSize
                if Double(samplesSinceValidEstimate) / 16_000 > 0.2 {
                    // Android discards smoothing history after 200 ms without an
                    // accepted YIN frame. Silence remains absence on this stream.
                    smoother.reset()
                }
            }
            if isAcceptedEstimate,
               estimate.frequencyHz.isFinite,
               let smoothed = smoother.accept(
                midi: rawMIDI,
                confidence: estimate.confidence
               ),
               smoothed.midi.isFinite,
               smoothed.confidence.isFinite,
               isActive {
                let reading = PitchReading(
                    midi: smoothed.midi,
                    confidence: smoothed.confidence,
                    rms: estimate.rms
                )
                if reading.midi.isFinite,
                   reading.confidence.isFinite,
                   reading.rms.isFinite,
                   isActive {
                    publish(reading, windowCapturedAt)
                }
            }
            samples.removeFirst(min(hopSize, samples.count))
            sampleCaptureTimes.removeFirst(min(hopSize, sampleCaptureTimes.count))
        }
    }

    private var isActive: Bool {
        lifecycleLock.withLock { active }
    }
}

private final class ConverterInputSupplier: @unchecked Sendable {
    private let lock = NSLock()
    private let buffer: AVAudioPCMBuffer
    private var supplied = false

    init(buffer: AVAudioPCMBuffer) {
        self.buffer = buffer
    }

    func next(status: UnsafeMutablePointer<AVAudioConverterInputStatus>) -> AVAudioBuffer? {
        lock.lock()
        defer { lock.unlock() }
        guard !supplied else {
            status.pointee = .noDataNow
            return nil
        }
        supplied = true
        status.pointee = .haveData
        return buffer
    }
}

private extension Duration {
    var secondsValue: Double {
        let parts = components
        return Double(parts.seconds) + Double(parts.attoseconds) / 1e18
    }
}

private extension PitchTrackingProfile {
    var analysisHopSize: Int {
        switch self {
        case .standard: 512
        case .melodyFast: 256
        }
    }

    func acceptsDelivery(capturedAt: ContinuousClock.Instant) -> Bool {
        switch self {
        case .standard:
            true
        case .melodyFast:
            capturedAt.duration(to: ContinuousClock.now) <= .milliseconds(48)
        }
    }
}

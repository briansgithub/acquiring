@preconcurrency import AVFoundation
import AcquiringAudio
import AcquiringCore
import MediaPlayer
import OSLog
import UIKit

@MainActor
final class AppAudioSystem: PreviewAudio, QuizTransport, PitchSource {
    private let logger = Logger(subsystem: "com.acquiring.ios", category: "audio")
    private var engine: AVAudioEngine
    private var player: AVAudioPlayerNode
    private let playbackFormat: AVAudioFormat
    private let quizRenderer: LockedQuizRenderer
    private var sourceNode: AVAudioSourceNode
    private var transportState = TransportState(phase: .stopped)
    private var stateContinuations: [UUID: AsyncStream<TransportState>.Continuation] = [:]
    private var remoteCommandsInstalled = false
    private var remoteCommandTargets: [(command: MPRemoteCommand, target: Any)] = []
    private var pendingMicrophone: PendingMicrophone?
    private var activeMicrophone: ActiveMicrophone?
    private var notificationTasks: [Task<Void, Never>] = []
    private var transportPollTask: Task<Void, Never>?
    private var quizTimelineLoaded = false
    /// Requested playback is separate from the physical renderer state: a
    /// zero-tempo Quiz is paused but resumes when a positive tempo returns.
    private var quizPlaybackRequested = false
    private var quizContext: QuizAudioContext?
    private var quizRevision: UInt64 = 0
    private var quizLoadPendingRevision: UInt64?
    private let previewGeneration = PreviewPlaybackGeneration()
    private var previewRender: (token: UInt64, task: Task<[Float], any Error>)?
    private var nowPlayingSong: CatalogSong?
    private var nowPlayingSectionName = ""
    private var shouldResumeAfterInterruption = false

    init() {
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
        installRemoteCommandsIfNeeded()
        observeAudioSession()
    }

    func play(_ request: PreviewRequest) async throws {
        try Task.checkCancellation()
        let token = await beginPreviewPlayback()
        _ = try await schedulePreview(request, token: token)
    }

    func playQuizCardPreview(
        midiNotes: [Int],
        asInterval: Bool = false,
        duration: Duration = .milliseconds(450)
    ) async throws {
        try Task.checkCancellation()
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

    private func beginPreviewPlayback() async -> UInt64 {
        let token = previewGeneration.begin()
        previewRender?.task.cancel()
        previewRender = nil
        await retirePreviewPlayback(ifCurrent: token)
        return token
    }

    private func schedulePreview(_ sourceRequest: PreviewRequest, token: UInt64) async throws -> Bool {
        // Musical callers supply source pitches. Apply the shared instrument
        // and absolute transpose once here; measured microphone pitches opt out.
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
        player.scheduleBuffer(buffer, completionHandler: nil)
        if !engine.isRunning { try engine.start() }
        player.play()
        return true
    }

    func stop(channel: AudioPlaybackChannel) async {
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

    func playQuiz(revision: UInt64) async throws {
        try Task.checkCancellation()
        guard revision == quizRevision else { throw CancellationError() }
        try startQuizPlayback(expectedRevision: revision)
    }

    func pauseQuiz(revision: UInt64) async {
        guard revision == quizRevision else { return }
        await pause()
    }

    func resetQuiz(revision: UInt64) async {
        guard revision == quizRevision else { return }
        await reset()
    }

    /// Pauses a loaded quiz synchronously and returns the playback intent that a
    /// matching scrub completion may restore. Keeping this handoff on the main
    /// actor prevents a queued pause from landing after the scrub has moved on.
    func pauseQuizForScrubbing(revision: UInt64) -> Bool? {
        guard revision == quizRevision,
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
    func resumeQuizAfterScrubbing(revision: UInt64) throws {
        guard revision == quizRevision,
              quizTimelineLoaded,
              quizLoadPendingRevision == nil
        else { throw CancellationError() }
        try startQuizPlayback(expectedRevision: revision)
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

    func play() async throws {
        try startQuizPlayback(expectedRevision: nil)
    }

    private func startQuizPlayback(expectedRevision: UInt64?) throws {
        if let expectedRevision, expectedRevision != quizRevision {
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
            if !engine.isRunning { try engine.start() }
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
        let id = UUID()
        let (stream, continuation) = AsyncThrowingStream<PitchReading, any Error>.makeStream()
        let lease = MicrophoneLease(id: id, readings: stream)

        supersedeMicrophone(with: id)
        pendingMicrophone = PendingMicrophone(id: id, owner: owner, continuation: continuation)
        continuation.onTermination = { [weak self] _ in
            Task { @MainActor in self?.releaseMicrophone(id: id) }
        }

        do {
            guard await AVAudioApplication.requestRecordPermission() else {
                throw AcquiringAudioError.microphonePermissionDenied
            }
            try Task.checkCancellation()
            guard pendingMicrophone?.id == id else { throw CancellationError() }

            try configureSession(category: .playAndRecord, captureProfile: profile)
            guard pendingMicrophone?.id == id else { throw CancellationError() }

            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate.isFinite,
                  format.sampleRate > 0,
                  format.channelCount > 0
            else {
                throw AcquiringAudioError.engine("No microphone input format is available.")
            }

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
            guard pendingMicrophone?.id == id else {
                input.removeTap(onBus: 0)
                pipeline.deactivate()
                throw CancellationError()
            }

            pendingMicrophone = nil
            activeMicrophone = ActiveMicrophone(
                id: id,
                owner: owner,
                continuation: continuation,
                pipeline: pipeline,
                profile: profile,
                sampleRate: format.sampleRate,
                channelCount: format.channelCount
            )
            if !engine.isRunning { try engine.start() }
            guard activeMicrophone?.id == id else { throw CancellationError() }
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

    private func configureSession(
        category: AVAudioSession.Category,
        captureProfile: PitchTrackingProfile? = nil
    ) throws {
        let session = AVAudioSession.sharedInstance()
        let options: AVAudioSession.CategoryOptions = category == .playAndRecord
            ? [.defaultToSpeaker, .allowAirPlay, .allowBluetoothA2DP, .allowBluetoothHFP]
            : []
        let mode: AVAudioSession.Mode = category == .playAndRecord ? .measurement : .default

        if session.category != category || session.mode != mode || session.categoryOptions != options {
            do {
                try session.setCategory(category, mode: mode, options: options)
            } catch {
                logger.error(
                    "Audio session category setup failed for \(category.rawValue, privacy: .public): \(error.localizedDescription, privacy: .public)"
                )
                throw AcquiringAudioError.session(error.localizedDescription)
            }
        }

        if category == .playAndRecord {
            let profile = captureProfile ?? activeMicrophone?.profile ?? .standard
            do {
                // These are preferences, not assumptions. The tap's resolved format
                // is always converted to the Android-equivalent 16 kHz analysis stream.
                if abs(session.preferredSampleRate - 16_000) > 0.5 {
                    try session.setPreferredSampleRate(16_000)
                }
                let preferredDuration = Double(profile.analysisHopSize) / 16_000
                if abs(session.preferredIOBufferDuration - preferredDuration) > 0.000_001 {
                    try session.setPreferredIOBufferDuration(preferredDuration)
                }
            } catch {
                logger.info(
                    "Audio capture preference was unavailable; using resolved hardware format: \(error.localizedDescription, privacy: .public)"
                )
            }
        }

        do {
            try session.setActive(true)
        } catch {
            logger.error(
                "Audio session activation failed for \(category.rawValue, privacy: .public): \(error.localizedDescription, privacy: .public)"
            )
            throw AcquiringAudioError.session(error.localizedDescription)
        }
    }

    private func configureSessionForCurrentNeeds() throws {
        if let activeMicrophone {
            try configureSession(category: .playAndRecord, captureProfile: activeMicrophone.profile)
        } else {
            try configureSession(category: .playback)
        }
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
    }

    private func supersedeMicrophone(with id: UUID) {
        if let pending = pendingMicrophone, pending.id != id {
            pendingMicrophone = nil
            pending.continuation.finish(throwing: CancellationError())
        }
        guard let active = activeMicrophone, active.id != id else { return }
        activeMicrophone = nil
        engine.inputNode.removeTap(onBus: 0)
        active.pipeline.deactivate()
        active.continuation.finish()
        transitionSessionAfterMicrophoneRelease()
        logger.info("Microphone ownership transferred")
    }

    private func releaseMicrophone(id: UUID) {
        if let pending = pendingMicrophone, pending.id == id {
            pendingMicrophone = nil
            pending.continuation.finish()
            return
        }
        guard let active = activeMicrophone, active.id == id else { return }
        activeMicrophone = nil
        engine.inputNode.removeTap(onBus: 0)
        active.pipeline.deactivate()
        active.continuation.finish()
        transitionSessionAfterMicrophoneRelease()
        logger.info("Microphone pitch capture stopped")
    }

    private func failMicrophone(id: UUID, error: any Error) {
        if let pending = pendingMicrophone, pending.id == id {
            pendingMicrophone = nil
            pending.continuation.finish(throwing: error)
            return
        }
        guard let active = activeMicrophone, active.id == id else { return }
        activeMicrophone = nil
        engine.inputNode.removeTap(onBus: 0)
        active.pipeline.deactivate()
        active.continuation.finish(throwing: error)
        transitionSessionAfterMicrophoneRelease()
        logger.error("Microphone pitch capture failed: \(error.localizedDescription, privacy: .public)")
    }

    private func stopAllMicrophoneCapture() {
        if let pending = pendingMicrophone {
            pendingMicrophone = nil
            pending.continuation.finish()
        }
        if let active = activeMicrophone {
            activeMicrophone = nil
            engine.inputNode.removeTap(onBus: 0)
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
        if let pending = pendingMicrophone {
            pendingMicrophone = nil
            pending.continuation.finish(throwing: error)
        }
        if let active = activeMicrophone {
            activeMicrophone = nil
            engine.inputNode.removeTap(onBus: 0)
            active.pipeline.deactivate()
            active.continuation.finish(throwing: error)
            logger.error("Microphone pitch capture ended: \(error.localizedDescription, privacy: .public)")
        }
        if transitionSession { transitionSessionAfterMicrophoneRelease() }
    }

    private func transitionSessionAfterMicrophoneRelease() {
        do {
            if quizPlaybackRequested || player.isPlaying {
                try configureSession(category: .playback)
            } else {
                engine.stop()
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
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

    private func configuredPreview(_ request: PreviewRequest) -> PreviewRequest {
        guard request.usesMusicalConfiguration,
              let sound = quizContext?.soundConfiguration
        else { return request }
        let pitchRatio = pow(2, Double(sound.transposeSemitones) / 12)
        return PreviewRequest(
            frequenciesHz: request.frequenciesHz.map { $0 * pitchRatio },
            duration: request.duration,
            arpeggiates: request.arpeggiates,
            arpeggioStep: request.arpeggioStep,
            waveform: sound.waveform,
            gain: request.gain,
            usesMusicalConfiguration: false
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
        publishNowPlaying(state)
    }

    func updateNowPlaying(song: CatalogSong, sectionName: String) {
        nowPlayingSong = song
        nowPlayingSectionName = sectionName.trimmingCharacters(in: .whitespacesAndNewlines)
        publishNowPlaying(transportState)
    }

    private func publishNowPlaying(_ state: TransportState) {
        let song = nowPlayingSong
        let duration = state.duration.secondsValue
        let elapsed = state.elapsed.secondsValue
        let rate = state.phase == .playing
            ? max((quizContext?.tempoPercent ?? 100) / 100, 0)
            : 0
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: song?.displayTitle ?? "Acquiring Quiz",
            MPMediaItemPropertyArtist: song?.displayArtist ?? "",
            MPMediaItemPropertyPlaybackDuration: duration.isFinite ? max(duration, 0) : 0,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsed.isFinite ? max(elapsed, 0) : 0,
            MPNowPlayingInfoPropertyPlaybackRate: rate.isFinite ? rate : 0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: 1,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
            MPNowPlayingInfoPropertyIsLiveStream: false
        ]
        if !nowPlayingSectionName.isEmpty {
            info[MPMediaItemPropertyAlbumTitle] = nowPlayingSectionName
        }
        if let song {
            info[MPNowPlayingInfoPropertyExternalContentIdentifier] = song.id
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func seek(toElapsedSeconds seconds: Double) {
        let duration = quizRenderer.snapshot().duration
        guard duration.isFinite, duration > 0, seconds.isFinite else { return }
        _ = seekQuiz(to: min(max(seconds / duration, 0), 1), revision: quizRevision)
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

    private func installRemoteCommandsIfNeeded() {
        guard !remoteCommandsInstalled else { return }
        remoteCommandsInstalled = true
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.isEnabled = true
        center.pauseCommand.isEnabled = true
        center.stopCommand.isEnabled = true
        center.togglePlayPauseCommand.isEnabled = true
        center.changePlaybackPositionCommand.isEnabled = true
        center.previousTrackCommand.isEnabled = true

        let playTarget = center.playCommand.addTarget { [weak self] _ in
            Task { try? await self?.play() }
            return .success
        }
        remoteCommandTargets.append((center.playCommand, playTarget))
        let pauseTarget = center.pauseCommand.addTarget { [weak self] _ in
            Task { await self?.pause() }
            return .success
        }
        remoteCommandTargets.append((center.pauseCommand, pauseTarget))
        let stopTarget = center.stopCommand.addTarget { [weak self] _ in
            Task { await self?.stop() }
            return .success
        }
        remoteCommandTargets.append((center.stopCommand, stopTarget))
        let toggleTarget = center.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if self.transportState.phase == .playing || self.quizPlaybackRequested {
                    await self.pause()
                } else {
                    try? await self.play()
                }
            }
            return .success
        }
        remoteCommandTargets.append((center.togglePlayPauseCommand, toggleTarget))
        let positionTarget = center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let position = event as? MPChangePlaybackPositionCommandEvent,
                  position.positionTime.isFinite
            else { return .commandFailed }
            Task { @MainActor in self?.seek(toElapsedSeconds: position.positionTime) }
            return .success
        }
        remoteCommandTargets.append((center.changePlaybackPositionCommand, positionTarget))
        let beginningTarget = center.previousTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.seek(toElapsedSeconds: 0) }
            return .success
        }
        remoteCommandTargets.append((center.previousTrackCommand, beginningTarget))
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
                for await _ in NotificationCenter.default.notifications(named: UIApplication.didEnterBackgroundNotification) {
                    guard let self, self.pendingMicrophone != nil || self.activeMicrophone != nil else { continue }
                    self.stopAllMicrophoneCapture()
                    self.logger.info("Microphone capture stopped in the background")
                }
            }
        ]
    }

    private func handleInterruptionBegan() {
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
        logger.info("Audio route changed: \(reason.rawValue, privacy: .public)")
        guard reason == .oldDeviceUnavailable else { return }
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
        invalidatePreviewPlayback()
        if let activeMicrophone {
            let inputFormat = engine.inputNode.outputFormat(forBus: 0)
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
            if !engine.isRunning { try engine.start() }
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

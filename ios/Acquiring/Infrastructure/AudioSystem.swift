@preconcurrency import AVFoundation
import AcquiringAudio
import AcquiringCore
import MediaPlayer
import OSLog

@MainActor
final class AppAudioSystem: PreviewAudio, QuizTransport, PitchSource {
    private let logger = Logger(subsystem: "com.acquiring.ios", category: "audio")
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let quizRenderer: LockedQuizRenderer
    private let sourceNode: AVAudioSourceNode
    private var transportState = TransportState(phase: .stopped)
    private var stateContinuations: [UUID: AsyncStream<TransportState>.Continuation] = [:]
    private var remoteCommandsInstalled = false
    private var pitchContinuation: AsyncThrowingStream<PitchReading, any Error>.Continuation?
    private var pitchPipeline: PitchPipeline?
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

    init() {
        let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1)!
        let renderer = LockedQuizRenderer(sampleRate: format.sampleRate)
        quizRenderer = renderer
        sourceNode = AVAudioSourceNode(format: format) { @Sendable _, _, frameCount, audioBufferList in
            renderer.render(frameCount: frameCount, audioBufferList: audioBufferList)
        }
        engine.attach(player)
        engine.attach(sourceNode)
        engine.connect(player, to: engine.mainMixerNode, format: nil)
        engine.connect(sourceNode, to: engine.mainMixerNode, format: format)
        observeAudioSession()
    }

    func play(_ request: PreviewRequest) async throws {
        // Musical callers supply source pitches. Apply the shared instrument
        // and absolute transpose once here; measured microphone pitches opt out.
        let request = configuredPreview(request)
        let token = previewGeneration.begin()
        previewRender?.task.cancel()
        previewRender = nil
        // A replacement is a deterministic stop/schedule handoff. The rendered
        // buffer keeps its attack/release envelopes; a mixer crossfade needs a
        // separate output-lifecycle design and is intentionally not improvised here.
        player.stop()
        let sampleRate = AVAudioSession.sharedInstance().sampleRate > 0
            ? AVAudioSession.sharedInstance().sampleRate
            : 48_000
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
            generation.invalidate(ifCurrent: token)
            return
        } catch {
            clearPreviewRender(ifToken: token)
            guard generation.isCurrent(token), !Task.isCancelled else { return }
            generation.invalidate(ifCurrent: token)
            throw error
        }
        clearPreviewRender(ifToken: token)
        guard generation.isCurrent(token), !Task.isCancelled else {
            generation.invalidate(ifCurrent: token)
            return
        }
        try configureSession(category: .playback)
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
              let channel = buffer.floatChannelData?[0]
        else { throw AcquiringAudioError.engine("Could not allocate a preview buffer.") }
        buffer.frameLength = buffer.frameCapacity
        samples.withUnsafeBufferPointer { source in
            channel.update(from: source.baseAddress!, count: samples.count)
        }
        guard generation.isCurrent(token) else { return }
        player.scheduleBuffer(buffer, completionHandler: nil)
        if !engine.isRunning { try engine.start() }
        player.play()
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
            try configureSession(category: .playback)
            installRemoteCommandsIfNeeded()
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
        transportPollTask?.cancel()
        quizRenderer.pause()
        let snapshot = quizRenderer.snapshot()
        publish(TransportState(phase: .paused, elapsed: .seconds(snapshot.elapsed), duration: .seconds(snapshot.duration)))
    }

    func reset() async {
        quizPlaybackRequested = false
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
        transportPollTask?.cancel()
        invalidatePreviewPlayback()
        quizRenderer.stop()
        stopPitchCapture()
        publish(TransportState(phase: .stopped))
    }

    func readings(profile: PitchTrackingProfile) async -> AsyncThrowingStream<PitchReading, any Error> {
        guard pitchContinuation == nil else {
            return AsyncThrowingStream { $0.finish(throwing: AcquiringAudioError.microphoneInUse) }
        }
        return AsyncThrowingStream { continuation in
            pitchContinuation = continuation
            continuation.onTermination = { [weak self] _ in
                Task { @MainActor in self?.stopPitchCapture() }
            }
            Task { @MainActor [weak self] in
                do { try await self?.startPitchCapture(continuation: continuation, profile: profile) }
                catch {
                    continuation.finish(throwing: error)
                    self?.stopPitchCapture()
                }
            }
        }
    }

    private func configureSession(category: AVAudioSession.Category) throws {
        let session = AVAudioSession.sharedInstance()
        let options: AVAudioSession.CategoryOptions = category == .playAndRecord
            ? [.allowAirPlay, .allowBluetoothA2DP]
            : []

        do {
            try session.setCategory(category, mode: .default, options: options)
        } catch {
            logger.error(
                "Audio session category setup failed for \(category.rawValue, privacy: .public): \(error.localizedDescription, privacy: .public)"
            )
            throw AcquiringAudioError.session(error.localizedDescription)
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
        previewGeneration.invalidate()
        previewRender?.task.cancel()
        previewRender = nil
        player.stop()
    }

    private func startPitchCapture(
        continuation: AsyncThrowingStream<PitchReading, any Error>.Continuation,
        profile: PitchTrackingProfile
    ) async throws {
        guard await AVAudioApplication.requestRecordPermission() else {
            throw AcquiringAudioError.microphonePermissionDenied
        }
        try configureSession(category: .playAndRecord)
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw AcquiringAudioError.engine("No microphone input format is available.")
        }
        let pipeline = try PitchPipeline(inputFormat: format, profile: profile) { reading in
            continuation.yield(reading)
        }
        pitchPipeline = pipeline
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1_024, format: format) { buffer, _ in
            pipeline.consume(buffer)
        }
        if !engine.isRunning { try engine.start() }
        logger.info("Microphone pitch capture started at \(format.sampleRate, privacy: .public) Hz")
    }

    private func stopPitchCapture() {
        guard pitchContinuation != nil || pitchPipeline != nil else { return }
        engine.inputNode.removeTap(onBus: 0)
        pitchPipeline = nil
        pitchContinuation?.finish()
        pitchContinuation = nil
        logger.info("Microphone pitch capture stopped")
    }

    private func publish(_ state: TransportState) {
        transportState = state
        for continuation in stateContinuations.values { continuation.yield(state) }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: "Acquiring Quiz",
            MPNowPlayingInfoPropertyElapsedPlaybackTime: state.elapsed.secondsValue,
            MPMediaItemPropertyPlaybackDuration: state.duration.secondsValue,
            MPNowPlayingInfoPropertyPlaybackRate: state.phase == .playing ? 1 : 0
        ]
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
        center.playCommand.addTarget { [weak self] _ in
            Task { try? await self?.play() }
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            Task { await self?.pause() }
            return .success
        }
        center.stopCommand.addTarget { [weak self] _ in
            Task { await self?.stop() }
            return .success
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
                        self?.transportPollTask?.cancel()
                        self?.invalidatePreviewPlayback()
                        self?.quizRenderer.pause()
                        self?.publish(TransportState(phase: .paused))
                        self?.logger.info("Audio interruption began")
                    } else {
                        self?.logger.info("Audio interruption ended")
                    }
                }
            },
            Task { @MainActor [weak self] in
                for await _ in NotificationCenter.default.notifications(named: AVAudioSession.routeChangeNotification) {
                    self?.logger.info("Audio route changed")
                }
            }
        ]
    }
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
    private let outputFormat: AVAudioFormat
    private let converter: AVAudioConverter
    private let queue = DispatchQueue(label: "com.acquiring.ios.pitch-pipeline", qos: .userInitiated)
    private let publish: @Sendable (PitchReading) -> Void
    private let analysisWindowSize: Int
    private let hopSize: Int
    private var smoother: PitchSmoother
    private var samples: [Int16] = []

    init(
        inputFormat: AVAudioFormat,
        profile: PitchTrackingProfile,
        publish: @escaping @Sendable (PitchReading) -> Void
    ) throws {
        self.inputFormat = inputFormat
        guard let outputFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16_000, channels: 1, interleaved: false),
              let converter = AVAudioConverter(from: inputFormat, to: outputFormat)
        else { throw AcquiringAudioError.engine("Could not initialize the 16 kHz microphone converter.") }
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
    }

    func consume(_ buffer: AVAudioPCMBuffer) {
        guard let source = buffer.floatChannelData?[0] else { return }
        let values = Array(UnsafeBufferPointer(start: source, count: Int(buffer.frameLength)))
        queue.async { [self] in convert(values) }
    }

    private func convert(_ values: [Float]) {
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
            samples.append(Int16(clamping: Int((min(max(value, -1), 1) * Float(Int16.max)).rounded())))
        }
        while samples.count >= analysisWindowSize {
            let window = Array(samples.prefix(analysisWindowSize))
            let estimate = PitchDetector.estimate(samples: window, sampleRate: 16_000)
            if estimate.frequencyHz > 0,
               estimate.confidence >= 0.4,
               estimate.rms >= 0.0005,
               let smoothed = smoother.accept(
                midi: AcquiringCore.MusicTheory.midi(frequency: estimate.frequencyHz),
                confidence: estimate.confidence
               ) {
                publish(PitchReading(
                    midi: smoothed.midi,
                    confidence: smoothed.confidence,
                    rms: estimate.rms
                ))
            }
            samples.removeFirst(min(hopSize, samples.count))
        }
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

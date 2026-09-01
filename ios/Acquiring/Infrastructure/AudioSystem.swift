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

    init() {
        let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1)!
        let renderer = LockedQuizRenderer(sampleRate: format.sampleRate)
        quizRenderer = renderer
        sourceNode = AVAudioSourceNode(format: format) { _, _, frameCount, audioBufferList in
            renderer.render(frameCount: frameCount, audioBufferList: audioBufferList)
        }
        engine.attach(player)
        engine.attach(sourceNode)
        engine.connect(player, to: engine.mainMixerNode, format: nil)
        engine.connect(sourceNode, to: engine.mainMixerNode, format: format)
        observeAudioSession()
    }

    func play(_ request: PreviewRequest) async throws {
        let sampleRate = AVAudioSession.sharedInstance().sampleRate > 0
            ? AVAudioSession.sharedInstance().sampleRate
            : 48_000
        let samples = try await Task.detached(priority: .userInitiated) {
            try StaticPCMRenderer.render(request: request, sampleRate: sampleRate)
        }.value
        try configureSession(category: .playback)
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
              let channel = buffer.floatChannelData?[0]
        else { throw AcquiringAudioError.engine("Could not allocate a preview buffer.") }
        buffer.frameLength = buffer.frameCapacity
        samples.withUnsafeBufferPointer { source in
            channel.update(from: source.baseAddress!, count: samples.count)
        }
        player.stop()
        Task { @MainActor in await player.scheduleBuffer(buffer) }
        if !engine.isRunning { try engine.start() }
        player.play()
    }

    func stop(channel: AudioPlaybackChannel) async {
        player.stop()
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
        let shouldContinuePlaying = transportState.phase == .playing || transportState.phase == .buffering
        let snapshot = quizRenderer.configure(
            timeline,
            preserveProgress: position == .preserveProgress
        )
        publish(TransportState(
            phase: .paused,
            elapsed: .seconds(snapshot.elapsed),
            duration: .seconds(snapshot.duration)
        ))
        if shouldContinuePlaying { try await play() }
    }

    func play() async throws {
        try configureSession(category: .playback)
        installRemoteCommandsIfNeeded()
        if !engine.isRunning { try engine.start() }
        quizRenderer.play()
        publish(TransportState(phase: .playing, elapsed: transportState.elapsed, duration: transportState.duration))
        beginTransportPolling()
    }

    func pause() async {
        transportPollTask?.cancel()
        quizRenderer.pause()
        let snapshot = quizRenderer.snapshot()
        publish(TransportState(phase: .paused, elapsed: .seconds(snapshot.elapsed), duration: .seconds(snapshot.duration)))
    }

    func seek(to progress: Double) async {
        let bounded = min(max(progress, 0), 1)
        quizRenderer.seek(progress: bounded)
        let seconds = transportState.duration.secondsValue * bounded
        publish(TransportState(phase: transportState.phase, elapsed: .seconds(seconds), duration: transportState.duration))
    }

    func stop() async {
        transportPollTask?.cancel()
        player.stop()
        quizRenderer.stop()
        stopPitchCapture()
        publish(TransportState(phase: .stopped))
    }

    func readings() async -> AsyncThrowingStream<PitchReading, any Error> {
        guard pitchContinuation == nil else {
            return AsyncThrowingStream { $0.finish(throwing: AcquiringAudioError.microphoneInUse) }
        }
        return AsyncThrowingStream { continuation in
            pitchContinuation = continuation
            continuation.onTermination = { [weak self] _ in
                Task { @MainActor in self?.stopPitchCapture() }
            }
            Task { @MainActor [weak self] in
                do { try await self?.startPitchCapture(continuation: continuation) }
                catch {
                    continuation.finish(throwing: error)
                    self?.stopPitchCapture()
                }
            }
        }
    }

    private func configureSession(category: AVAudioSession.Category) throws {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(category, mode: .default, options: [.allowAirPlay, .allowBluetoothA2DP])
            try session.setActive(true)
        } catch {
            logger.error("Audio session setup failed: \(error.localizedDescription, privacy: .public)")
            throw AcquiringAudioError.session(error.localizedDescription)
        }
    }

    private func startPitchCapture(
        continuation: AsyncThrowingStream<PitchReading, any Error>.Continuation
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
        let pipeline = try PitchPipeline(inputFormat: format) { estimate in
            guard estimate.frequencyHz > 0, estimate.confidence >= 0.4, estimate.rms >= 0.0005 else { return }
            continuation.yield(PitchReading(
                midi: AcquiringCore.MusicTheory.midi(frequency: estimate.frequencyHz),
                confidence: estimate.confidence,
                rms: estimate.rms
            ))
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
                        self?.player.pause()
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

private final class LockedQuizRenderer: @unchecked Sendable {
    private let lock = NSLock()
    private let renderer: QuizPCMRenderer

    init(sampleRate: Double) {
        renderer = QuizPCMRenderer(sampleRate: sampleRate)
    }

    func configure(_ timeline: QuizTimeline, preserveProgress: Bool) -> (elapsed: Double, duration: Double) {
        lock.withLock {
            let progress = renderer.progress
            renderer.configure(timeline)
            if preserveProgress { renderer.seek(progress: progress) }
            return (renderer.progress * renderer.durationSeconds, renderer.durationSeconds)
        }
    }

    func play() { lock.withLock { renderer.play() } }
    func pause() { lock.withLock { renderer.pause() } }
    func stop() { lock.withLock { renderer.stop() } }
    func seek(progress: Double) { lock.withLock { renderer.seek(progress: progress) } }

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
    private let publish: @Sendable (PitchEstimate) -> Void
    private var samples: [Int16] = []

    init(inputFormat: AVAudioFormat, publish: @escaping @Sendable (PitchEstimate) -> Void) throws {
        self.inputFormat = inputFormat
        guard let outputFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16_000, channels: 1, interleaved: false),
              let converter = AVAudioConverter(from: inputFormat, to: outputFormat)
        else { throw AcquiringAudioError.engine("Could not initialize the 16 kHz microphone converter.") }
        self.outputFormat = outputFormat
        self.converter = converter
        self.publish = publish
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
        while samples.count >= 2_048 {
            let window = Array(samples.prefix(2_048))
            publish(PitchDetector.estimate(samples: window, sampleRate: 16_000))
            samples.removeFirst(min(512, samples.count))
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

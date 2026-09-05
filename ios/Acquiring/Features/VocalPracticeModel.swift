import AcquiringAudio
import AcquiringCore
import Foundation
import Observation

struct VocalPitchSample: Equatable, Sendable {
    let rawMIDI: Double
    let pitch: SpelledPitch
    let centsFromReference: Double

    var frequencyHz: Double { MusicTheory.frequency(midi: rawMIDI) }
    var pitchLabel: String { pitch.displayName }
    var centsLabel: String { PersistentPitchFeedback.formatCentsError(centsFromReference) }
}

enum TessituraCalibrationState: Equatable, Sendable {
    case idle
    case requestingPermission
    case capturing(remainingMilliseconds: Int, hasSignal: Bool)
    case failed(String)
}

enum VocalPersistentPhase: Equatable, Sendable {
    case idle
    case listening
    case failed(String)
}

/// App-lifetime coordinator for all Quiz vocal-practice surfaces. The audio system owns
/// permission and exclusive microphone arbitration; this model owns only the lease it was
/// given and never stops the shared transport or another microphone consumer.
@MainActor
@Observable
final class VocalPracticeModel {
    private enum ManualOperation: Equatable {
        case capture(slot: Int)
        case listen(slot: Int)
        case flipFlop
    }

    private let audio: AppAudioSystem
    private let clock = ContinuousClock()

    var isExpanded = false
    private(set) var slot1: VocalPitchSample?
    private(set) var slot2: VocalPitchSample?
    private(set) var recordingSlot: Int?
    private(set) var listeningSlot: Int?
    private(set) var captureRemainingMilliseconds = 0
    private(set) var manualHasSignal = false
    private(set) var isFlipFlopEnabled = false
    private(set) var targetRequest: SingingTargetRequest?
    private(set) var calibrationState: TessituraCalibrationState = .idle
    private(set) var comfortablePitchMIDI: Double?
    private(set) var persistentSelection: PersistentPitchSelection?
    private(set) var persistentPhase: VocalPersistentPhase = .idle
    private(set) var persistentMeasuredMIDI: Double?
    private(set) var liveCentsError: Double?
    private(set) var melodyRunScores: [Int: MelodyRunScoreOutcome] = [:]
    private(set) var errorMessage: String?

    @ObservationIgnored private var tessituraSession = TessituraSession()
    @ObservationIgnored private var songID: String?
    @ObservationIgnored private var sectionID: String?
    private var transpose = 0
    private var rootTarget: QuizPitchCardTarget?
    private var melodyTarget: QuizPitchCardTarget?
    private var chordToneTargets: [QuizPitchCardTarget] = []
    private var currentMelodyRun: MelodyTimelinePitchRun?
    private var isTransportPlaying = false
    @ObservationIgnored private var currentBeat = 0.0

    @ObservationIgnored private var microphoneTask: Task<Void, Never>?
    @ObservationIgnored private var previewTask: Task<Void, Never>?
    @ObservationIgnored private var activeLease: MicrophoneLease?
    @ObservationIgnored private var operationGeneration: UInt64 = 0
    @ObservationIgnored private var manualOperation: ManualOperation?
    @ObservationIgnored private var latestReading: PitchReading?
    @ObservationIgnored private var latestReadingInstant: ContinuousClock.Instant?
    @ObservationIgnored private var latestReadingSequence: UInt64 = 0
    @ObservationIgnored private var microphoneStreamEnded = false
    @ObservationIgnored private var microphoneStreamError: String?
    @ObservationIgnored private var scoringSession = MelodyRunScoringSession()
    @ObservationIgnored private var scoringRun: MelodyTimelinePitchRun?
    @ObservationIgnored private var scoringRunSourceMIDI: Int?
    @ObservationIgnored private var scoringRunTargetMIDI: Int?
    @ObservationIgnored private var lastScoredReadingSequence: UInt64 = 0

    init(audio: AppAudioSystem) {
        self.audio = audio
    }

    var displayedSlot1: VocalPitchSample? { displayedSample(slot: 1, captured: slot1) }
    var displayedSlot2: VocalPitchSample? { displayedSample(slot: 2, captured: slot2) }

    var measuredInterval: MeasuredInterval? {
        guard let slot1, let slot2 else { return nil }
        return IntervalAnalysis.measured(fromMIDI: slot1.rawMIDI, toMIDI: slot2.rawMIDI)
    }

    var comfortablePitchLabel: String? {
        comfortablePitchMIDI.map { SpelledPitch.fromMIDI(Int($0.rounded())).displayName }
    }

    var persistentTarget: ResolvedPersistentPitchTarget? {
        PersistentPitchTargets.resolve(
            selection: persistentSelection,
            simpleRoot: rootTarget,
            chordTones: chordToneTargets,
            melody: melodyTarget
        )
    }

    var persistentTargetMIDI: Int? {
        persistentTarget?.effectiveTargetMIDI(
            transpose: transpose,
            comfortablePitchMIDI: comfortablePitchMIDI,
            lastSourceMIDI: tessituraSession.lastSourceMIDI,
            lastTargetMIDI: tessituraSession.lastTargetMIDI
        )
    }

    var persistentFeedbackBand: PitchFeedbackBand? {
        liveCentsError.map(PersistentPitchFeedback.band)
    }

    /// A finite, bounded offset for timeline renderers. The view performs its final
    /// geometry clamp against the actual melody-lane bounds.
    var liveMarkerStaffSteps: Double? {
        liveCentsError.map {
            min(max(PersistentPitchFeedback.timelineStaffSteps(centsError: $0), -7), 7)
        }
    }

    var persistentLiveMarkerStaffSteps: Double? { liveMarkerStaffSteps }

    var persistentLivePercentageText: String? {
        guard let liveCentsError,
              PersistentPitchFeedback.showsLiveErrorPercentage(centsError: liveCentsError)
        else { return nil }
        return PersistentPitchFeedback.formatLiveErrorPercentage(centsError: liveCentsError)
    }

    var manualStatusText: String? {
        if let recordingSlot {
            if !manualHasSignal { return "Hum note \(recordingSlot)… waiting for pitch" }
            return "Listening for pitch \(recordingSlot)… \(secondsRemainingText)"
        }
        if let listeningSlot {
            return "Sing target \(listeningSlot)… \(secondsRemainingText)"
        }
        if isFlipFlopEnabled { return "Flip-Flop active" }
        return nil
    }

    func score(forRunID runID: Int) -> MelodyRunScoreOutcome? {
        melodyRunScores[runID]
    }

    func expand() {
        isExpanded = true
    }

    func collapse() {
        isExpanded = false
        cancelManualPractice()
        targetRequest = nil
        slot1 = nil
        slot2 = nil
    }

    func toggleRecording(slot: Int) {
        guard slot == 1 || slot == 2 else { return }
        if recordingSlot == slot || listeningSlot == slot {
            cancelManualPractice()
            return
        }
        if targetNote(for: slot) != nil {
            startListening(slot: slot)
        } else {
            startCapture(slot: slot)
        }
    }

    func playSlot(_ slot: Int) {
        guard let sample = slot == 1 ? slot1 : slot == 2 ? slot2 : nil else { return }
        cancelMicrophoneActivity(resetPersistentSelection: true)
        clearManualActivityState()
        beginPreview {
            try await self.audio.play(self.exactPreview(frequencies: [sample.frequencyHz], duration: .seconds(1)))
        }
    }

    func playPair() {
        let resolvedTargets = targetRequest.map {
            SingingTargets.resolve(
                request: $0,
                transpose: transpose,
                comfortablePitchMIDI: comfortablePitchMIDI
            )
        }
        let frequencies: (Double, Double)?
        if let first = resolvedTargets?.first, let second = resolvedTargets?.second {
            frequencies = (
                MusicTheory.frequency(midi: Double(first)),
                MusicTheory.frequency(midi: Double(second))
            )
        } else if let slot1, let slot2 {
            frequencies = (slot1.frequencyHz, slot2.frequencyHz)
        } else {
            frequencies = nil
        }
        guard let frequencies else { return }

        cancelMicrophoneActivity(resetPersistentSelection: true)
        clearManualActivityState()
        beginPreview {
            try await self.audio.play(self.exactPreview(frequencies: [frequencies.0], duration: .seconds(1)))
            try await Task.sleep(for: .seconds(1))
            try Task.checkCancellation()
            try await self.audio.play(self.exactPreview(frequencies: [frequencies.1], duration: .seconds(1)))
            try await Task.sleep(for: .seconds(1))
            try Task.checkCancellation()
            try await self.audio.play(self.exactPreview(frequencies: [frequencies.0, frequencies.1], duration: .seconds(1)))
        }
    }

    func setFlipFlopEnabled(_ enabled: Bool) {
        if !enabled {
            cancelManualPractice()
            return
        }
        targetRequest = nil
        isExpanded = true
        beginManualOperation(.flipFlop)
    }

    func cancelManualPractice() {
        guard manualOperation != nil || isFlipFlopEnabled else { return }
        cancelMicrophoneActivity(resetPersistentSelection: false)
        clearManualActivityState()
    }

    func requestSingBack(_ request: SingingTargetRequest) {
        cancelActivity()
        errorMessage = nil
        targetRequest = request
        slot1 = nil
        slot2 = nil
        isExpanded = true
        audio.cancelQuizCardPreview()

        let resolved = SingingTargets.resolve(
            request: request,
            transpose: transpose,
            comfortablePitchMIDI: comfortablePitchMIDI
        )
        previewTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                await self.audio.pause()
                try Task.checkCancellation()
                for target in [resolved.first, resolved.second].compactMap({ $0 }) {
                    try Task.checkCancellation()
                    let sourceFrequency = MusicTheory.frequency(midi: Double(target - self.transpose))
                    try await self.audio.play(PreviewRequest(
                        frequenciesHz: [sourceFrequency],
                        duration: .milliseconds(450),
                        usesMusicalConfiguration: true
                    ))
                    try await Task.sleep(for: .milliseconds(600))
                }
                // Each scheduled 450 ms note plus its 150 ms settling gap, followed by
                // the remainder of Android's 300 ms expand + 500 ms auto-listen delay.
                try await Task.sleep(for: .milliseconds(200))
                try Task.checkCancellation()
                if request.first != nil {
                    self.startListening(slot: 1)
                } else if request.second != nil {
                    self.startListening(slot: 2)
                }
            } catch is CancellationError {
                return
            } catch {
                self.setError(error)
            }
        }
    }

    func requestSingingTargets(first: SingingTargetNote?, second: SingingTargetNote?) {
        requestSingBack(SingingTargetRequest(
            first: first,
            second: second,
            requestID: Int.random(in: Int.min...Int.max)
        ))
    }

    func clearSingingTargets() {
        cancelManualPractice()
        targetRequest = nil
    }

    func startCalibration() {
        cancelActivity()
        errorMessage = nil
        calibrationState = .requestingPermission
        operationGeneration &+= 1
        let generation = operationGeneration
        microphoneTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                await self.audio.pause()
                try Task.checkCancellation()
                let lease = try await self.audio.acquireMicrophone(owner: .tessitura, profile: .standard)
                guard self.isCurrent(generation) else {
                    self.audio.releaseMicrophone(lease)
                    return
                }
                self.activeLease = lease
                self.prepareReadingState()
                self.calibrationState = .capturing(remainingMilliseconds: 3_000, hasSignal: false)
                let reader = self.consume(lease: lease, generation: generation)
                defer {
                    reader.cancel()
                    self.releaseIfOwned(lease)
                }

                var capture = ComfortablePitchCapture()
                var lastTick = self.clock.now
                while self.isCurrent(generation), !capture.progress.isComplete, !self.microphoneStreamEnded {
                    try Task.checkCancellation()
                    try await Task.sleep(for: .milliseconds(16))
                    let now = self.clock.now
                    let elapsed = self.milliseconds(lastTick.duration(to: now))
                    lastTick = now
                    let reading = self.currentReading(maximumAge: .milliseconds(48))
                    let progress = capture.observe(elapsedMilliseconds: elapsed, midi: reading?.midi)
                    self.calibrationState = .capturing(
                        remainingMilliseconds: progress.remainingMilliseconds,
                        hasSignal: progress.hasSignal
                    )
                }

                guard self.isCurrent(generation) else { return }
                if let average = capture.averageMIDI {
                    self.tessituraSession.updateComfortablePitch(average)
                    self.comfortablePitchMIDI = average
                    self.calibrationState = .idle
                    self.refreshPersistentTarget(resetScoreForCurrentRun: true)
                } else if let microphoneStreamError = self.microphoneStreamError {
                    self.calibrationState = .failed(microphoneStreamError)
                } else {
                    self.calibrationState = .idle
                }
            } catch is CancellationError {
                return
            } catch {
                guard self.isCurrent(generation) else { return }
                self.calibrationState = .failed(error.localizedDescription)
                self.errorMessage = error.localizedDescription
            }
        }
    }

    func retryCalibration() {
        startCalibration()
    }

    func cancelCalibration() {
        guard calibrationState != .idle else { return }
        cancelMicrophoneActivity(resetPersistentSelection: false)
        calibrationState = .idle
    }

    func adjustComfortablePitch(semitones: Int) {
        guard semitones != 0, let comfortablePitchMIDI else { return }
        let adjusted = comfortablePitchMIDI + Double(semitones)
        tessituraSession.updateComfortablePitch(adjusted)
        self.comfortablePitchMIDI = adjusted
        refreshPersistentTarget(resetScoreForCurrentRun: true)
    }

    func adjustComfortablePitch(octaves: Int) {
        adjustComfortablePitch(semitones: octaves * 12)
    }

    func clearTessituraAdjustment() {
        tessituraSession.clearAdjustment()
        comfortablePitchMIDI = nil
        refreshPersistentTarget(resetScoreForCurrentRun: true)
    }

    func togglePersistent(_ selection: PersistentPitchSelection) {
        if persistentSelection == selection {
            stopPersistentPractice()
        } else {
            startPersistentPractice(selection)
        }
    }

    func startPersistentPractice(_ selection: PersistentPitchSelection) {
        let resolved = PersistentPitchTargets.resolve(
            selection: selection,
            simpleRoot: rootTarget,
            chordTones: chordToneTargets,
            melody: melodyTarget
        )
        guard resolved != nil else { return }

        cancelActivity()
        errorMessage = nil
        persistentSelection = selection
        persistentPhase = .listening
        operationGeneration &+= 1
        let generation = operationGeneration
        let profile: PitchTrackingProfile = selection == .melody ? .melodyFast : .standard
        microphoneTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let lease = try await self.audio.acquireMicrophone(owner: .persistentPractice, profile: profile)
                guard self.isCurrent(generation), self.persistentSelection == selection else {
                    self.audio.releaseMicrophone(lease)
                    return
                }
                self.activeLease = lease
                self.prepareReadingState()
                let reader = self.consume(lease: lease, generation: generation)
                defer {
                    reader.cancel()
                    self.releaseIfOwned(lease)
                }

                while self.isCurrent(generation), !self.microphoneStreamEnded {
                    try Task.checkCancellation()
                    self.updatePersistentReadingAndScore()
                    try await Task.sleep(for: .milliseconds(MelodyRunScoringSession.sampleIntervalMilliseconds))
                }
                guard self.isCurrent(generation) else { return }
                if let microphoneStreamError = self.microphoneStreamError {
                    self.persistentPhase = .failed(microphoneStreamError)
                    self.errorMessage = microphoneStreamError
                } else {
                    self.stopPersistentState()
                }
            } catch is CancellationError {
                return
            } catch {
                guard self.isCurrent(generation) else { return }
                self.persistentPhase = .failed(error.localizedDescription)
                self.persistentSelection = nil
                self.errorMessage = error.localizedDescription
            }
        }
        synchronizeScoringRun()
    }

    func stopPersistentPractice() {
        guard persistentSelection != nil || persistentPhase != .idle else { return }
        cancelMicrophoneActivity(resetPersistentSelection: true)
    }

    func updateContext(
        songID: String,
        sectionID: String,
        transpose: Int,
        root: QuizPitchCardTarget?,
        melody: QuizPitchCardTarget?,
        chordTones: [QuizPitchCardTarget],
        melodyRun: MelodyTimelinePitchRun?,
        isPlaying: Bool,
        beat: Double
    ) {
        enterSong(songID: songID, sectionID: sectionID)
        let pausedThisUpdate = isTransportPlaying && !isPlaying
        let runChanged = currentMelodyRun?.id != melodyRun?.id
        let selectedTargetChanged: Bool = switch persistentSelection {
        case .simpleRoot:
            rootTarget != root
        case .melody:
            melodyTarget != melody
        case let .chordTone(requestedIndex):
            PersistentPitchTargets.resolve(
                selection: .chordTone(requestedIndex: requestedIndex),
                simpleRoot: nil,
                chordTones: chordToneTargets,
                melody: nil
            ) != PersistentPitchTargets.resolve(
                selection: .chordTone(requestedIndex: requestedIndex),
                simpleRoot: nil,
                chordTones: chordTones,
                melody: nil
            )
        case nil:
            false
        }
        let targetInputsChanged = self.transpose != transpose || selectedTargetChanged
        if pausedThisUpdate {
            discardActiveScore()
        } else if isTransportPlaying, isPlaying, runChanged {
            // Finish while the outgoing source/target are still installed. A rest is
            // a real run boundary; explicit seeks call handleTransportDiscontinuity first.
            finishActiveScore()
        }
        self.transpose = transpose
        rootTarget = root
        melodyTarget = melody
        chordToneTargets = chordTones
        currentMelodyRun = melodyRun
        isTransportPlaying = isPlaying
        currentBeat = beat
        refreshPersistentTarget(resetScoreForCurrentRun: targetInputsChanged && !runChanged)
        synchronizeScoringRun()
    }

    func enterSong(songID: String, sectionID: String) {
        if self.songID != songID {
            if self.songID != nil {
                cancelActivity()
                tessituraSession.clearSession()
                comfortablePitchMIDI = nil
                melodyRunScores.removeAll()
            }
            self.songID = songID
        }
        if self.sectionID != sectionID {
            self.sectionID = sectionID
            tessituraSession.enter("\(songID)|\(sectionID)")
            discardActiveScore()
            melodyRunScores.removeAll()
        }
    }

    func handleTransportDiscontinuity() {
        discardActiveScore()
        liveCentsError = nil
        persistentMeasuredMIDI = nil
    }

    /// Stops microphone and preview activity while retaining the song's tessitura anchor,
    /// captured slots, and completed melody scores.
    func cancelActivity() {
        cancelPreview()
        cancelMicrophoneActivity(resetPersistentSelection: true)
        calibrationState = .idle
        clearManualActivityState()
    }

    func handleSceneBackgrounded() {
        cancelActivity()
        isExpanded = false
        targetRequest = nil
    }

    func leaveSong() {
        cancelActivity()
        targetRequest = nil
        slot1 = nil
        slot2 = nil
        melodyRunScores.removeAll()
        discardActiveScore()
        tessituraSession.clearSession()
        comfortablePitchMIDI = nil
        songID = nil
        sectionID = nil
        rootTarget = nil
        melodyTarget = nil
        chordToneTargets = []
        currentMelodyRun = nil
        isTransportPlaying = false
    }

    func clearError() {
        errorMessage = nil
        if case .failed = persistentPhase { persistentPhase = .idle }
        if case .failed = calibrationState { calibrationState = .idle }
    }

    private var secondsRemainingText: String {
        String(format: "%.1fs", Double(captureRemainingMilliseconds) / 1_000)
    }

    private func targetNote(for slot: Int) -> SingingTargetNote? {
        slot == 1 ? targetRequest?.first : targetRequest?.second
    }

    private func resolvedTargetMIDI(for slot: Int) -> Int? {
        guard let targetRequest else { return nil }
        let resolved = SingingTargets.resolve(
            request: targetRequest,
            transpose: transpose,
            comfortablePitchMIDI: comfortablePitchMIDI
        )
        return slot == 1 ? resolved.first : resolved.second
    }

    private func displayedSample(slot: Int, captured: VocalPitchSample?) -> VocalPitchSample? {
        guard let target = resolvedTargetMIDI(for: slot) else { return captured }
        guard let captured else {
            return makeSample(rawMIDI: Double(target), slot: slot, referenceMIDI: Double(target))
        }
        return VocalPitchSample(
            rawMIDI: captured.rawMIDI,
            pitch: captured.pitch,
            centsFromReference: (captured.rawMIDI - Double(target)) * 100
        )
    }

    private func makeSample(rawMIDI: Double, slot: Int, referenceMIDI: Double? = nil) -> VocalPitchSample {
        let rounded = Int(rawMIDI.rounded())
        let pitch: SpelledPitch
        if slot == 2, let first = slot1 {
            pitch = SpelledPitch.spellRelative(from: first.pitch, toMIDI: rounded)
        } else {
            pitch = SpelledPitch.fromMIDI(rounded)
        }
        return VocalPitchSample(
            rawMIDI: rawMIDI,
            pitch: pitch,
            centsFromReference: (rawMIDI - (referenceMIDI ?? Double(rounded))) * 100
        )
    }

    private func startCapture(slot: Int) {
        beginManualOperation(.capture(slot: slot))
    }

    private func startListening(slot: Int) {
        guard resolvedTargetMIDI(for: slot) != nil else { return }
        beginManualOperation(.listen(slot: slot))
    }

    private func beginManualOperation(_ operation: ManualOperation) {
        cancelMicrophoneActivity(resetPersistentSelection: true)
        cancelPreview()
        clearManualActivityState()
        errorMessage = nil
        isExpanded = true
        manualOperation = operation
        isFlipFlopEnabled = operation == .flipFlop
        operationGeneration &+= 1
        let generation = operationGeneration
        microphoneTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                await self.audio.pause()
                try Task.checkCancellation()
                let lease = try await self.audio.acquireMicrophone(owner: .singingTool, profile: .standard)
                guard self.isCurrent(generation), self.manualOperation == operation else {
                    self.audio.releaseMicrophone(lease)
                    return
                }
                self.activeLease = lease
                self.prepareReadingState()
                let reader = self.consume(lease: lease, generation: generation)
                defer {
                    reader.cancel()
                    self.releaseIfOwned(lease)
                }

                switch operation {
                case let .capture(slot):
                    await self.capturePitch(slot: slot, generation: generation)
                case let .listen(slot):
                    await self.listenToTarget(slot: slot, generation: generation)
                case .flipFlop:
                    var slot = 1
                    while self.isCurrent(generation), self.manualOperation == .flipFlop,
                          !self.microphoneStreamEnded {
                        await self.capturePitch(slot: slot, generation: generation)
                        guard self.isCurrent(generation), !self.microphoneStreamEnded else { break }
                        if slot == 2 {
                            self.recordingSlot = nil
                            self.captureRemainingMilliseconds = 0
                            try await Task.sleep(for: .seconds(2))
                        }
                        slot = slot == 1 ? 2 : 1
                    }
                }

                guard self.isCurrent(generation) else { return }
                if let microphoneStreamError = self.microphoneStreamError {
                    self.errorMessage = microphoneStreamError
                }
                self.clearManualActivityState()
            } catch is CancellationError {
                return
            } catch {
                guard self.isCurrent(generation) else { return }
                self.setError(error)
                self.clearManualActivityState()
            }
        }
    }

    private func capturePitch(slot: Int, generation: UInt64) async {
        recordingSlot = slot
        listeningSlot = nil
        captureRemainingMilliseconds = 3_000
        manualHasSignal = false
        let deadline = clock.now.advanced(by: .seconds(3))
        var consumedSequence = latestReadingSequence
        var lastAcceptedReading: PitchReading?

        while isCurrent(generation), !microphoneStreamEnded, clock.now < deadline {
            captureRemainingMilliseconds = milliseconds(clock.now.duration(to: deadline))
            let reading = consumeFreshReading(after: &consumedSequence, maximumAge: .milliseconds(48))
            if let reading {
                manualHasSignal = true
                lastAcceptedReading = reading
                setSlot(slot, sample: makeSample(rawMIDI: reading.midi, slot: slot))
            }
            do { try await Task.sleep(for: .milliseconds(16)) } catch { return }
        }

        if isCurrent(generation), let lastAcceptedReading {
            setSlot(slot, sample: makeSample(rawMIDI: lastAcceptedReading.midi, slot: slot))
        } else if isCurrent(generation), (slot == 1 ? slot1 : slot2) == nil {
            errorMessage = "No voiced pitch was detected. Try recording again."
        }
        recordingSlot = nil
        captureRemainingMilliseconds = 0
        manualHasSignal = false
    }

    private func listenToTarget(slot: Int, generation: UInt64) async {
        guard let targetMIDI = resolvedTargetMIDI(for: slot) else { return }
        listeningSlot = slot
        recordingSlot = nil
        let deadline = clock.now.advanced(by: .seconds(3))
        var consumedSequence = latestReadingSequence
        while isCurrent(generation), !microphoneStreamEnded, clock.now < deadline {
            captureRemainingMilliseconds = milliseconds(clock.now.duration(to: deadline))
            if let reading = consumeFreshReading(after: &consumedSequence, maximumAge: .milliseconds(48)) {
                setSlot(slot, sample: makeSample(
                    rawMIDI: reading.midi,
                    slot: slot,
                    referenceMIDI: Double(targetMIDI)
                ))
            }
            do { try await Task.sleep(for: .milliseconds(16)) } catch { return }
        }
        listeningSlot = nil
        captureRemainingMilliseconds = 0
        manualHasSignal = false
    }

    private func setSlot(_ slot: Int, sample: VocalPitchSample) {
        if slot == 1 { slot1 = sample } else { slot2 = sample }
    }

    private func beginPreview(_ operation: @escaping @MainActor () async throws -> Void) {
        cancelPreview()
        previewTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await operation()
            } catch is CancellationError {
                return
            } catch {
                self.setError(error)
            }
        }
    }

    private func exactPreview(frequencies: [Double], duration: Duration) -> PreviewRequest {
        PreviewRequest(
            frequenciesHz: frequencies,
            duration: duration,
            usesMusicalConfiguration: false
        )
    }

    private func cancelPreview() {
        previewTask?.cancel()
        previewTask = nil
        audio.cancelQuizCardPreview()
    }

    private func cancelMicrophoneActivity(resetPersistentSelection: Bool) {
        operationGeneration &+= 1
        microphoneTask?.cancel()
        microphoneTask = nil
        if let activeLease {
            audio.releaseMicrophone(activeLease)
            self.activeLease = nil
        }
        prepareReadingState()
        discardActiveScore()
        if resetPersistentSelection { stopPersistentState() }
    }

    private func clearManualActivityState() {
        manualOperation = nil
        recordingSlot = nil
        listeningSlot = nil
        captureRemainingMilliseconds = 0
        isFlipFlopEnabled = false
        manualHasSignal = false
    }

    private func stopPersistentState() {
        persistentSelection = nil
        persistentPhase = .idle
        persistentMeasuredMIDI = nil
        liveCentsError = nil
        discardActiveScore()
    }

    private func prepareReadingState() {
        latestReading = nil
        latestReadingInstant = nil
        latestReadingSequence &+= 1
        lastScoredReadingSequence = latestReadingSequence
        microphoneStreamEnded = false
        microphoneStreamError = nil
    }

    private func consume(lease: MicrophoneLease, generation: UInt64) -> Task<Void, Never> {
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                for try await reading in lease.readings {
                    guard self.isCurrent(generation), self.activeLease?.id == lease.id else { break }
                    self.latestReading = reading
                    self.latestReadingInstant = self.clock.now
                    self.latestReadingSequence &+= 1
                }
            } catch is CancellationError {
                return
            } catch {
                guard self.isCurrent(generation), self.activeLease?.id == lease.id else { return }
                self.microphoneStreamError = error.localizedDescription
            }
            guard self.isCurrent(generation), self.activeLease?.id == lease.id else { return }
            self.microphoneStreamEnded = true
        }
    }

    private func consumeFreshReading(after sequence: inout UInt64, maximumAge: Duration) -> PitchReading? {
        guard latestReadingSequence != sequence,
              let latestReading,
              let latestReadingInstant,
              latestReadingInstant.duration(to: clock.now) <= maximumAge
        else { return nil }
        sequence = latestReadingSequence
        return latestReading
    }

    private func currentReading(maximumAge: Duration) -> PitchReading? {
        guard let latestReading, let latestReadingInstant,
              latestReadingInstant.duration(to: clock.now) <= maximumAge
        else { return nil }
        return latestReading
    }

    private func releaseIfOwned(_ lease: MicrophoneLease) {
        guard activeLease?.id == lease.id else { return }
        audio.releaseMicrophone(lease)
        activeLease = nil
    }

    private func isCurrent(_ generation: UInt64) -> Bool {
        generation == operationGeneration && !Task.isCancelled
    }

    private func refreshPersistentTarget(resetScoreForCurrentRun: Bool) {
        guard persistentSelection != nil else { return }
        if persistentTarget == nil {
            persistentMeasuredMIDI = nil
            liveCentsError = nil
        }
        if resetScoreForCurrentRun, scoringRun != nil {
            restartActiveScore()
        }
    }

    private func updatePersistentReadingAndScore() {
        guard persistentPhase == .listening, let targetMIDI = persistentTargetMIDI else {
            persistentMeasuredMIDI = nil
            liveCentsError = nil
            if scoringRun != nil { scoringSession.add(measuredMIDI: nil) }
            return
        }

        let age = latestReadingInstant.map { $0.duration(to: clock.now) }
        if let age, age <= .milliseconds(200), let latestReading {
            persistentMeasuredMIDI = latestReading.midi
            liveCentsError = (latestReading.midi - Double(targetMIDI)) * 100
        } else {
            persistentMeasuredMIDI = nil
            liveCentsError = nil
        }

        guard persistentSelection == .melody, scoringRun != nil else { return }
        if let age, age <= .milliseconds(48), latestReadingSequence != lastScoredReadingSequence,
           let latestReading {
            lastScoredReadingSequence = latestReadingSequence
            scoringSession.add(measuredMIDI: latestReading.midi)
        } else {
            scoringSession.add(measuredMIDI: nil)
        }
    }

    private func synchronizeScoringRun() {
        let desiredRun = persistentSelection == .melody
            && persistentPhase == .listening
            && isTransportPlaying ? currentMelodyRun : nil

        guard desiredRun?.id != scoringRun?.id else { return }
        finishActiveScore()
        guard let desiredRun, let targetMIDI = persistentTargetMIDI,
              let sourceMIDI = persistentTarget?.sourceMIDI else { return }
        scoringRun = desiredRun
        scoringRunSourceMIDI = sourceMIDI + transpose
        scoringRunTargetMIDI = targetMIDI
        scoringSession.begin(runID: desiredRun.id, targetMIDI: targetMIDI)
        melodyRunScores.removeValue(forKey: desiredRun.id)
        lastScoredReadingSequence = latestReadingSequence
    }

    private func restartActiveScore() {
        guard let scoringRun, let targetMIDI = persistentTargetMIDI,
              let sourceMIDI = persistentTarget?.sourceMIDI else {
            discardActiveScore()
            return
        }
        scoringRunSourceMIDI = sourceMIDI + transpose
        scoringRunTargetMIDI = targetMIDI
        scoringSession.begin(runID: scoringRun.id, targetMIDI: targetMIDI)
        melodyRunScores.removeValue(forKey: scoringRun.id)
        lastScoredReadingSequence = latestReadingSequence
    }

    private func finishActiveScore() {
        guard let scoringRun else { return }
        if let outcome = scoringSession.finish(runID: scoringRun.id) {
            melodyRunScores[scoringRun.id] = outcome
        }
        if let source = scoringRunSourceMIDI, let target = scoringRunTargetMIDI {
            tessituraSession.updateContinuity(source: source, target: target)
        }
        self.scoringRun = nil
        scoringRunSourceMIDI = nil
        scoringRunTargetMIDI = nil
    }

    private func discardActiveScore() {
        scoringSession.clear()
        scoringRun = nil
        scoringRunSourceMIDI = nil
        scoringRunTargetMIDI = nil
    }

    private func milliseconds(_ duration: Duration) -> Int {
        let components = duration.components
        guard components.seconds >= 0 else { return 0 }
        let whole = components.seconds.multipliedReportingOverflow(by: 1_000)
        guard !whole.overflow else { return Int.max }
        let fractional = components.attoseconds / 1_000_000_000_000_000
        return Int(clamping: whole.partialValue + fractional)
    }

    private func setError(_ error: any Error) {
        errorMessage = error.localizedDescription
    }
}

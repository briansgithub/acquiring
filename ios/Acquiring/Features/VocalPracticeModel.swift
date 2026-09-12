import AcquiringAudio
import AcquiringCore
import Foundation
import Observation
import UIKit

struct VocalPitchSample: Equatable, Sendable {
    let rawMIDI: Double
    let pitch: SpelledPitch
    let centsFromReference: Double

    var frequencyHz: Double { MusicTheory.frequency(midi: rawMIDI) }
    var pitchLabel: String { pitch.displayName }
    var centsLabel: String { PersistentPitchFeedback.formatCentsError(centsFromReference) }
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
    private(set) var octaveOffset = 0
    private(set) var persistentSelection: PersistentPitchSelection?
    private(set) var persistentPhase: VocalPersistentPhase = .idle
    private(set) var liveCentsError: Double?
    /// [liveCentsError] refreshed on a readable cadence, for the printed percentage. The
    /// marker itself keeps following the unsampled value.
    private(set) var sampledLiveCentsError: Double?
    private(set) var melodyRunScores: [Int: MelodyRunScoreOutcome] = [:]
    private(set) var errorMessage: String?

    @ObservationIgnored private var songID: String?
    @ObservationIgnored private var sectionID: String?
    private var transpose = 0
    private var rootTarget: QuizPitchCardTarget?
    private var melodyTarget: QuizPitchCardTarget?
    private var chordToneTargets: [QuizPitchCardTarget] = []
    private var melodyRuns: [MelodyTimelinePitchRun] = []
    @ObservationIgnored private var anchorBeat = PlaybackTiming.firstBeat
    @ObservationIgnored private var anchorInstant: ContinuousClock.Instant?
    @ObservationIgnored private var beatsPerSecond = 0.0
    @ObservationIgnored private var sectionEndBeat = PlaybackTiming.fallbackEndBeat
    private var isTransportPlaying = false


    @ObservationIgnored private var microphoneTask: Task<Void, Never>?
    @ObservationIgnored private var previewTask: Task<Void, Never>?
    @ObservationIgnored private var collapseClearTask: Task<Void, Never>?
    @ObservationIgnored private var activeLease: MicrophoneLease?
    @ObservationIgnored private var operationGeneration: UInt64 = 0
    @ObservationIgnored private var collapseClearGeneration: UInt64 = 0
    private var manualOperation: ManualOperation?
    @ObservationIgnored private var latestReading: PitchReading?
    @ObservationIgnored private var latestReadingInstant: ContinuousClock.Instant?
    @ObservationIgnored private var latestReadingSequence: UInt64 = 0
    @ObservationIgnored private var microphoneStreamEnded = false
    @ObservationIgnored private var microphoneStreamError: String?
    @ObservationIgnored private var scoringSession = MelodyRunScoringSession()
    @ObservationIgnored private var scoringRun: MelodyTimelinePitchRun?
    @ObservationIgnored private var lastScoredReadingSequence: UInt64 = 0
    @ObservationIgnored private var isScrubbing = false
    /// How long the current attempt has had no voiced frame. Only meaningful while paused,
    /// where a run boundary can no longer separate one attempt from the next.
    @ObservationIgnored private var silentMillisecondsInRun = 0
    @ObservationIgnored private var livePercentageSampler = LivePitchErrorSampler()
    @ObservationIgnored private var lifecycleTasks: [Task<Void, Never>] = []

    init(audio: AppAudioSystem) {
        self.audio = audio
        observeApplicationLifecycle()
    }

    /// Persistent monitoring holds the microphone with no on-screen control but the collapsed
    /// dock's Stop button, so it must never outlive the app being put away.
    ///
    /// `handleSceneBackgrounded` already covers this when the scene phase reaches the view that
    /// calls it. Observing the notifications here makes the stop the model's own, so it holds
    /// whatever is mounted at the time, and picks up termination, which no scene phase reports.
    private func observeApplicationLifecycle() {
        lifecycleTasks = [
            Task { @MainActor [weak self] in
                for await _ in NotificationCenter.default.notifications(
                    named: UIApplication.didEnterBackgroundNotification
                ) {
                    self?.stopPersistentPractice()
                }
            },
            Task { @MainActor [weak self] in
                for await _ in NotificationCenter.default.notifications(
                    named: UIApplication.willTerminateNotification
                ) {
                    self?.cancelActivity()
                }
            }
        ]
    }

    var isManualPracticeActive: Bool { manualOperation != nil }

    var displayedSlot1: VocalPitchSample? { displayedSample(slot: 1, captured: slot1) }
    var displayedSlot2: VocalPitchSample? { displayedSample(slot: 2, captured: slot2) }

    var measuredInterval: MeasuredInterval? {
        guard let slot1, let slot2 else { return nil }
        return IntervalAnalysis.measured(fromMIDI: slot1.rawMIDI, toMIDI: slot2.rawMIDI)
    }

    /// Always signed, zero included: the control states an offset, and a bare "0" beside a
    /// minus and a plus would read as a count of something.
    var octaveOffsetLabel: String {
        octaveOffset > 0 ? "+\(octaveOffset)" : "\(octaveOffset)"
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
        persistentTarget?.effectiveTargetMIDI(transpose: transpose, octaveOffset: octaveOffset)
    }

    /// Which card, if any, should be wearing the live pitch gauge right now.
    ///
    /// Deliberately the only practice value the card stack reads. It changes when the
    /// selection or the sounding event changes - never at frame rate - so reading it cannot
    /// pull `QuizCardsView` into the 16 ms redraw the gauge itself lives on.
    var gaugePosition: PersistentPitchCardPosition? {
        guard persistentPhase == .listening else { return nil }
        return persistentTarget?.position
    }

    /// Where the playhead is right now, projected forward from the last transport sample.
    ///
    /// The transport publishes every 50 ms. Choosing the run to score straight from that
    /// sample quantises every note boundary to 50 ms, so up to a fiftieth of a second of the
    /// next note's audio lands in the previous note's score. Projecting between samples puts
    /// the boundary where the audio clock actually has it.
    ///
    /// Deliberately a plain projection with no drift smoothing: the timeline smooths because a
    /// playhead that jitters is unpleasant to watch, whereas scoring wants the audio clock's
    /// own answer and re-anchors from it every 50 ms anyway.
    private var projectedBeat: Double {
        guard isTransportPlaying, beatsPerSecond > 0, let anchorInstant else { return anchorBeat }
        return PlaybackTiming.wrappedBeat(
            anchorBeat + max(seconds(anchorInstant.duration(to: clock.now)), 0) * beatsPerSecond,
            span: sectionEndBeat - PlaybackTiming.firstBeat
        )
    }

    private var activeMelodyRun: MelodyTimelinePitchRun? {
        MelodyTimelinePitchRuns.run(at: projectedBeat, in: melodyRuns)
    }

    /// A finite, bounded offset for timeline renderers. The view performs its final
    /// geometry clamp against the actual melody-lane bounds.
    var liveMarkerStaffSteps: Double? {
        liveCentsError.map {
            min(max(PersistentPitchFeedback.timelineStaffSteps(centsError: $0), -7), 7)
        }
    }

    var sampledFeedbackBand: PitchFeedbackBand? {
        sampledLiveCentsError.map(PersistentPitchFeedback.band)
    }

    /// The cents figure printed beside the timeline marker and in the card gauge's corner,
    /// on the readout's readable cadence rather than the detector's. Unlike the percentage it
    /// replaced, this never saturates, so there is no reading far enough out to withhold it.
    var sampledLiveCentsText: String? {
        sampledLiveCentsError.map(PersistentPitchFeedback.formatCentsError)
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

    /// Opening the tool ends persistent practice. The two are alternative uses of the one
    /// microphone and of the singer's attention, and persistent feedback is worn by the card
    /// and the timeline - both of which the open dock covers or crowds. Keeping the invariant
    /// absolute (open tool implies no monitoring) is also what lets the collapsed dock offer
    /// a bare Stop button with nothing to explain.
    func expand() {
        stopPersistentPractice()
        if collapseClearTask != nil {
            cancelPendingCollapseClear()
            clearManualPracticeContent()
        }
        isExpanded = true
    }

    /// Help reveals the controls without discarding a practice session, including
    /// when it is opened during the dock's delayed collapse cleanup.
    func expandForHelp() {
        stopPersistentPractice()
        cancelPendingCollapseClear()
        isExpanded = true
    }

    func minimize() {
        cancelPendingCollapseClear()
        cancelPreview()
        cancelManualPractice()
        isExpanded = false
        let generation = collapseClearGeneration
        collapseClearTask = Task { @MainActor [weak self] in
            do {
                try await Task.sleep(for: .milliseconds(220))
            } catch {
                return
            }
            guard let self,
                  self.collapseClearGeneration == generation,
                  !self.isExpanded
            else { return }
            self.clearManualPracticeContent()
            self.collapseClearTask = nil
        }
    }

    func collapse() {
        minimize()
    }

    func resetManualPractice() {
        cancelPendingCollapseClear()
        cancelPreview()
        cancelManualPractice()
        clearManualPracticeContent()
        errorMessage = nil
    }

    func toggleRecording(slot: Int) {
        guard (slot == 1 || slot == 2), !isFlipFlopEnabled else { return }
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
        guard !isFlipFlopEnabled else { return }
        guard let sample = slot == 1 ? slot1 : slot == 2 ? slot2 : nil else { return }
        cancelMicrophoneActivity(resetPersistentSelection: true)
        clearManualActivityState()
        beginPreview {
            try await self.audio.play(self.exactPreview(frequencies: [sample.frequencyHz], duration: .seconds(1)))
        }
    }

    func playPair() {
        guard let slot1, let slot2 else { return }
        let resolvedTargets = targetRequest.map {
            SingingTargets.resolve(request: $0, transpose: transpose, octaveOffset: octaveOffset)
        }
        let frequencies: (Double, Double)
        if let first = resolvedTargets?.first, let second = resolvedTargets?.second {
            frequencies = (
                MusicTheory.frequency(midi: Double(first)),
                MusicTheory.frequency(midi: Double(second))
            )
        } else {
            frequencies = (slot1.frequencyHz, slot2.frequencyHz)
        }

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
        cancelPendingCollapseClear()
        cancelActivity()
        errorMessage = nil
        targetRequest = request
        slot1 = nil
        slot2 = nil
        isExpanded = true
        audio.cancelQuizCardPreview()

        let autoListenDeadline = clock.now.advanced(by: .milliseconds(800))
        previewTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                await self.audio.pause()
                try Task.checkCancellation()
                try await self.clock.sleep(until: autoListenDeadline)
                try Task.checkCancellation()
                guard request.first != nil,
                      self.targetRequest?.requestID == request.requestID,
                      self.isExpanded,
                      self.manualOperation == nil
                else { return }
                self.previewTask = nil
                self.startListening(slot: 1)
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
        cancelPreview()
        cancelManualPractice()
        targetRequest = nil
    }

    /// The singer's octave adjustment, in octaves, scoped to the song being practised.
    ///
    /// Song-scoped on purpose: the register a melody sits in is a property of that song, so
    /// carrying an offset into the next one would silently move its targets. Entering a
    /// different song returns it to zero.
    func setOctaveOffset(_ offset: Int) {
        let clamped = SingingOctaveOffset.clamped(offset)
        guard clamped != octaveOffset else { return }
        octaveOffset = clamped
        refreshPersistentTarget(resetScoreForCurrentRun: true)
    }

    func adjustOctaveOffset(by delta: Int) {
        setOctaveOffset(octaveOffset + delta)
    }

    var canDecrementOctaveOffset: Bool { octaveOffset > SingingOctaveOffset.range.lowerBound }
    var canIncrementOctaveOffset: Bool { octaveOffset < SingingOctaveOffset.range.upperBound }

    func togglePersistent(_ selection: PersistentPitchSelection) {
        if persistentSelection == selection {
            stopPersistentPractice()
        } else {
            startPersistentPractice(selection)
        }
    }

    /// Starts monitoring whether or not a target resolves this instant.
    ///
    /// The header's microphone button is a standing mode, not an action on one card: pressed
    /// during a rest, or before the first melody note has sounded, it must still latch and
    /// pick the target up when the music reaches one. `refreshPersistentTarget` already
    /// tolerates the target coming and going underneath a running session, which is the same
    /// state this starts in.
    func startPersistentPractice(_ selection: PersistentPitchSelection) {
        cancelActivity()
        // Collapsing is what surfaces the dock's Stop button, which exists only in the
        // collapsed header - the mirror of `expand()` ending monitoring from the other side.
        if isExpanded { minimize() }
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

                let interval = Duration.milliseconds(MelodyRunScoringSession.sampleIntervalMilliseconds)
                var nextTick = self.clock.now
                var previousTick = self.clock.now
                while self.isCurrent(generation), !self.microphoneStreamEnded {
                    try Task.checkCancellation()
                    let now = self.clock.now
                    self.updatePersistentReadingAndScore(
                        elapsedMilliseconds: self.milliseconds(previousTick.duration(to: now))
                    )
                    previousTick = now
                    // `Task.sleep(for:)` is a floor, so sleeping a fixed interval makes every
                    // tick a little late and the lateness compounds. The scoring session counts
                    // elapsed audio in fixed 16 ms steps, so a loop that really runs at 20 ms
                    // would open the settle window at 187 ms of audio rather than 150 ms and
                    // cap it at 625 ms rather than 500 ms - the singer measured late, and short
                    // notes never scored at all. Holding the deadline against the clock keeps
                    // the nominal count and the wall clock together.
                    nextTick = nextTick.advanced(by: interval)
                    // More than one interval behind is a stall, not jitter. Re-base rather than
                    // burn through a backlog of instant ticks that would race the settle clock
                    // ahead of the audio it is supposed to describe.
                    if nextTick < now { nextTick = now.advanced(by: interval) }
                    try await Task.sleep(until: nextTick, clock: self.clock)
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
        melodyRuns: [MelodyTimelinePitchRun],
        isPlaying: Bool,
        isScrubbing: Bool,
        beat: Double,
        beatsPerSecond: Double,
        endBeat: Double
    ) {
        enterSong(songID: songID, sectionID: sectionID)
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
        // A drag or a coast sweeps the playhead across runs the singer never sang. Crossing
        // them must bank nothing, so scrubbing ends the active session and blocks the next
        // one from starting. Pausing does not: holding the playhead on a note to drill it is
        // the whole point of scoring while stopped.
        if isScrubbing, !self.isScrubbing { discardActiveScore() }
        self.isScrubbing = isScrubbing
        self.transpose = transpose
        rootTarget = root
        melodyTarget = melody
        chordToneTargets = chordTones
        self.melodyRuns = melodyRuns
        isTransportPlaying = isPlaying
        self.beatsPerSecond = beatsPerSecond.isFinite ? max(beatsPerSecond, 0) : 0
        sectionEndBeat = max(endBeat.isFinite ? endBeat : PlaybackTiming.fallbackEndBeat,
                             PlaybackTiming.firstBeat)
        // Re-anchor from the authoritative audio sample every time one lands.
        anchorBeat = min(max(beat, PlaybackTiming.firstBeat), sectionEndBeat)
        anchorInstant = clock.now
        // A run that is about to change gets a fresh scoring session from
        // `synchronizeScoringRun` regardless, so re-aiming it here as well would drop the
        // same samples twice.
        let runChanged = scoringRun?.id != activeMelodyRun?.id
        refreshPersistentTarget(resetScoreForCurrentRun: targetInputsChanged && !runChanged)
        synchronizeScoringRun()
    }

    func enterSong(songID: String, sectionID: String) {
        let contextChanged = self.songID != songID || self.sectionID != sectionID
        if contextChanged {
            cancelPendingCollapseClear()
            cancelActivity()
            clearManualPracticeContent()
        }
        if self.songID != songID {
            if self.songID != nil {
                // The octave a melody sits in belongs to its song, so the offset does not
                // travel to the next one. Section changes inside a song keep it.
                octaveOffset = 0
                melodyRunScores.removeAll()
            }
            self.songID = songID
        }
        if self.sectionID != sectionID {
            self.sectionID = sectionID
            discardActiveScore()
            melodyRunScores.removeAll()
        }
    }

    func handleTransportDiscontinuity() {
        discardActiveScore()
        liveCentsError = nil
        resetLivePercentageSampling()
    }

    /// Stops microphone and preview activity while retaining the song's octave offset,
    /// captured slots, and completed melody scores.
    func cancelActivity() {
        cancelPreview()
        cancelMicrophoneActivity(resetPersistentSelection: true)
        clearManualActivityState()
    }

    func handleSceneBackgrounded() {
        collapseForDeparture()
    }

    func leaveQuiz() {
        collapseForDeparture()
    }

    private func collapseForDeparture() {
        cancelPendingCollapseClear()
        cancelActivity()
        isExpanded = false
        clearManualPracticeContent()
    }

    func leaveSong() {
        collapseForDeparture()
        targetRequest = nil
        slot1 = nil
        slot2 = nil
        melodyRunScores.removeAll()
        discardActiveScore()
        octaveOffset = 0
        songID = nil
        sectionID = nil
        rootTarget = nil
        melodyTarget = nil
        chordToneTargets = []
        melodyRuns = []
        anchorInstant = nil
        beatsPerSecond = 0
        isTransportPlaying = false
    }

    /// Drops every banked run score without touching the microphone or the selection.
    ///
    /// Ordering matters at the call site: discard the session in flight first, or its own
    /// dispose banks a score straight back into the map that was just emptied.
    func clearMelodyRunScores() {
        discardActiveScore()
        melodyRunScores.removeAll()
    }

    func clearError() {
        errorMessage = nil
        if case .failed = persistentPhase { persistentPhase = .idle }
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
            octaveOffset: octaveOffset
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
        clearSlot(slot)
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
                } else if operation == .flipFlop, self.microphoneStreamEnded {
                    // The loop above exits on a finished stream, and
                    // `clearManualActivityState` then switches the toggle off. A
                    // clean finish carries no error, so without this the tool
                    // simply stops mid-cycle and the switch flips itself back --
                    // which reads as the feature breaking rather than as the
                    // microphone going away.
                    self.errorMessage =
                        "Flip-Flop stopped because the microphone became unavailable. Switch it back on to carry on."
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

    private func capturePitch(
        slot: Int,
        generation: UInt64
    ) async {
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

        // A silent capture leaves the slot empty, which the tool already shows; it is
        // not an error worth a banner the singer has to dismiss before retrying.
        if isCurrent(generation), let lastAcceptedReading {
            setSlot(slot, sample: makeSample(rawMIDI: lastAcceptedReading.midi, slot: slot))
        }
        recordingSlot = nil
        captureRemainingMilliseconds = 0
        manualHasSignal = false
    }

    private func listenToTarget(slot: Int, generation: UInt64) async {
        guard resolvedTargetMIDI(for: slot) != nil else { return }
        listeningSlot = slot
        recordingSlot = nil
        let deadline = clock.now.advanced(by: .seconds(3))
        var consumedSequence = latestReadingSequence
        while isCurrent(generation), !microphoneStreamEnded, clock.now < deadline {
            captureRemainingMilliseconds = milliseconds(clock.now.duration(to: deadline))
            if let reading = consumeFreshReading(after: &consumedSequence, maximumAge: .milliseconds(48)),
               let targetMIDI = resolvedTargetMIDI(for: slot) {
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

    private func clearSlot(_ slot: Int) {
        if slot == 1 { slot1 = nil } else { slot2 = nil }
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

    /// Replays exactly what was measured: no quiz transpose, so the pitch the singer
    /// hears is the pitch that was recorded. The instrument is not named here - the audio
    /// boundary plays every preview on the currently selected one.
    private func exactPreview(frequencies: [Double], duration: Duration) -> PreviewRequest {
        PreviewRequest(
            frequenciesHz: frequencies,
            duration: duration,
            appliesQuizTranspose: false
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

    private func cancelPendingCollapseClear() {
        collapseClearGeneration &+= 1
        collapseClearTask?.cancel()
        collapseClearTask = nil
    }

    private func clearManualPracticeContent() {
        targetRequest = nil
        slot1 = nil
        slot2 = nil
    }

    private func stopPersistentState() {
        persistentSelection = nil
        persistentPhase = .idle
        liveCentsError = nil
        resetLivePercentageSampling()
        discardActiveScore()
        melodyRunScores.removeAll()
    }

    private func resetLivePercentageSampling() {
        livePercentageSampler.reset()
        sampledLiveCentsError = nil
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
                self.microphoneStreamError = Self.practiceMessage(for: error)
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
            liveCentsError = nil
            resetLivePercentageSampling()
        }
        if resetScoreForCurrentRun, scoringRun != nil {
            restartActiveScore()
        }
    }

    /// - Parameter elapsedMilliseconds: real time since the previous tick. The readout's
    ///   250 ms cadence is a wall-clock intention; advancing it by the nominal tick length
    ///   would stretch to whatever the loop actually managed.
    private func updatePersistentReadingAndScore(elapsedMilliseconds: Int) {
        synchronizeScoringRun()
        defer {
            sampledLiveCentsError = livePercentageSampler.sample(
                centsError: liveCentsError,
                advancingBy: elapsedMilliseconds
            )
        }
        guard persistentPhase == .listening, let targetMIDI = persistentTargetMIDI else {
            liveCentsError = nil
            if scoringRun != nil { scoringSession.add(measuredMIDI: nil) }
            return
        }

        let age = latestReadingInstant.map { $0.duration(to: clock.now) }
        if let age, age <= .milliseconds(200), let latestReading {
            liveCentsError = (latestReading.midi - Double(targetMIDI)) * 100
        } else {
            liveCentsError = nil
        }

        guard persistentSelection == .melody, scoringRun != nil else { return }
        let isVoiced = age.map { $0 <= .milliseconds(48) } == true
            && latestReadingSequence != lastScoredReadingSequence
            && latestReading != nil

        // While the transport runs, a run boundary separates one attempt from the next. Paused
        // on a note there is no boundary, so silence has to do the separating: without this the
        // session's 500 ms settle cap and 512-sample ceiling would let one median cover the
        // first eight seconds of however many attempts the singer made, rather than scoring
        // each on its own. 400 ms is past the 200 ms display hold and the 96 ms settle window,
        // so it cannot be a consonant or a breath - only a stopped note.
        if !isTransportPlaying {
            if isVoiced {
                if silentMillisecondsInRun >= Self.pausedAttemptGapMilliseconds { restartActiveScore() }
                silentMillisecondsInRun = 0
            } else {
                silentMillisecondsInRun += elapsedMilliseconds
            }
        }

        if isVoiced, let latestReading {
            lastScoredReadingSequence = latestReadingSequence
            scoringSession.add(measuredMIDI: latestReading.midi)
        } else {
            scoringSession.add(measuredMIDI: nil)
        }
    }

    /// Silence that separates one paused attempt at a note from the next.
    private static let pausedAttemptGapMilliseconds = 400

    private func synchronizeScoringRun() {
        let desiredRun = persistentSelection == .melody
            && persistentPhase == .listening
            && !isScrubbing ? activeMelodyRun : nil

        guard desiredRun?.id != scoringRun?.id else { return }
        finishActiveScore()
        guard let desiredRun, let targetMIDI = persistentTargetMIDI else { return }
        scoringRun = desiredRun
        scoringSession.begin(runID: desiredRun.id, targetMIDI: targetMIDI)
        melodyRunScores.removeValue(forKey: desiredRun.id)
        lastScoredReadingSequence = latestReadingSequence
        silentMillisecondsInRun = 0
    }

    private func restartActiveScore() {
        guard let scoringRun, let targetMIDI = persistentTargetMIDI else {
            discardActiveScore()
            return
        }
        scoringSession.begin(runID: scoringRun.id, targetMIDI: targetMIDI)
        melodyRunScores.removeValue(forKey: scoringRun.id)
        lastScoredReadingSequence = latestReadingSequence
        silentMillisecondsInRun = 0
    }

    private func finishActiveScore() {
        guard let scoringRun else { return }
        if let outcome = scoringSession.finish(runID: scoringRun.id) {
            melodyRunScores[scoringRun.id] = outcome
        }
        self.scoringRun = nil
    }

    private func discardActiveScore() {
        scoringSession.clear()
        scoringRun = nil
    }

    private func seconds(_ duration: Duration) -> Double {
        let components = duration.components
        return Double(components.seconds) + Double(components.attoseconds) / 1e18
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
        errorMessage = Self.practiceMessage(for: error)
    }

    /// CoreAudio reports failures as an NSError whose `localizedDescription` is a
    /// FourCC in parentheses -- "The operation couldn't be completed.
    /// (com.apple.coreaudio.avfaudio error 2003329396.)" -- which tells a singer
    /// nothing and does not fit in the dock. Our own audio errors already read as
    /// sentences, so those pass through; anything from CoreAudio is replaced. The
    /// domain and code still reach the diagnostics report, which is where they are
    /// worth having.
    static func practiceMessage(for error: any Error) -> String {
        if let audioError = error as? AcquiringAudioError {
            switch audioError {
            case let .engine(message), let .session(message), let .invalidRequest(message):
                return message
            case .microphonePermissionDenied, .microphoneInUse:
                return audioError.errorDescription ?? unexpectedMicrophoneMessage
            }
        }
        let nsError = error as NSError
        guard nsError.domain.hasPrefix("com.apple.coreaudio")
            || nsError.domain == NSOSStatusErrorDomain
        else { return error.localizedDescription }
        return unexpectedMicrophoneMessage
    }

    private static let unexpectedMicrophoneMessage =
        "The microphone stopped unexpectedly. Try recording again; if it keeps happening, close and reopen the app."
}

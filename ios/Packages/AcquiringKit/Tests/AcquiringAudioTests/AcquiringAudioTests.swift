import XCTest
@testable import AcquiringAudio

final class AcquiringAudioTests: XCTestCase {
    func testSoundConfigurationAndPreviewOptOutNormalizeAtTheBoundary() {
        XCTAssertEqual(QuizSoundConfiguration().waveform, .sawtooth)
        XCTAssertEqual(QuizSoundConfiguration().melodyGain, 0.5)
        XCTAssertEqual(QuizSoundConfiguration().chordGain, 0.5)
        XCTAssertEqual(QuizSoundConfiguration().arpeggioOption, .off)

        let high = QuizSoundConfiguration(melodyChordBalance: 2, transposeSemitones: 99)
        XCTAssertEqual(high.melodyChordBalance, 1)
        XCTAssertEqual(high.chordGain, 0)
        XCTAssertEqual(high.transposeSemitones, 12)

        let invalid = QuizSoundConfiguration(melodyChordBalance: .nan, transposeSemitones: -99)
        XCTAssertEqual(invalid.melodyChordBalance, 0.5)
        XCTAssertEqual(invalid.transposeSemitones, -12)

        XCTAssertTrue(PreviewRequest(frequenciesHz: [440]).usesMusicalConfiguration)
        XCTAssertFalse(PreviewRequest(
            frequenciesHz: [440],
            usesMusicalConfiguration: false
        ).usesMusicalConfiguration)
    }

    func testArpeggioOptionsAndTimelineNativeTempoExposeStableBoundaryValues() {
        XCTAssertEqual(
            QuizArpeggioOption.allCases,
            [.quarter, .third, .half, .off, .one, .two, .three, .four]
        )
        XCTAssertEqual(QuizArpeggioOption.allCases.map(\.displayName), [
            "1/4", "1/3", "1/2", "off", "1", "2", "3", "4"
        ])
        XCTAssertEqual(QuizArpeggioOption.allCases.map(\.cyclesPerBeat), [
            0.25, 1.0 / 3.0, 0.5, 0, 1, 2, 3, 4
        ])

        XCTAssertEqual(QuizTimeline(durationSeconds: 1, events: []).nativeBeatsPerSecond, 2)
        XCTAssertEqual(
            QuizTimeline(durationSeconds: 1, events: [], nativeBeatsPerSecond: 2.5).nativeBeatsPerSecond,
            2.5
        )
        for invalidTempo in [Double.nan, -Double.infinity, 0, -1] {
            XCTAssertEqual(
                QuizTimeline(
                    durationSeconds: 1,
                    events: [],
                    nativeBeatsPerSecond: invalidTempo
                ).nativeBeatsPerSecond,
                2
            )
        }
    }

    func testWaveformDisplayNamesAreUniqueAndSynthLabelsAreExplicit() {
        XCTAssertEqual(Set(SynthWaveform.allCases.map(\.displayName)).count, SynthWaveform.allCases.count)
        for waveform in [
            SynthWaveform.flute, .clarinet, .oboe, .brass, .bell, .synthBass
        ] {
            XCTAssertTrue(waveform.displayName.hasPrefix("Synth "))
        }
    }

    func testEveryWaveformRendersFiniteBoundedSamples() throws {
        for waveform in SynthWaveform.allCases {
            let samples = try StaticPCMRenderer.render(
                request: PreviewRequest(frequenciesHz: [220, 277.18, 329.63], duration: .milliseconds(100), waveform: waveform),
                sampleRate: 48_000
            )
            XCTAssertEqual(samples.count, 4_800)
            XCTAssertTrue(samples.allSatisfy { $0.isFinite && (-1...1).contains($0) })
            XCTAssertEqual(samples.first, 0)
        }
    }

    func testArpeggioEndsOnSlotBoundary() throws {
        let samples = try StaticPCMRenderer.render(
            request: PreviewRequest(
                frequenciesHz: [220, 330, 440],
                duration: .seconds(2),
                arpeggiates: true,
                arpeggioStep: .milliseconds(100)
            ),
            sampleRate: 48_000
        )
        XCTAssertEqual(samples.count, 3 * 4_800)
    }

    func testPitchSmootherRejectsSingleOctaveSpike() {
        var smoother = PitchSmoother(targetMIDI: 69)
        XCTAssertNil(smoother.accept(midi: 69, confidence: 0.9))
        XCTAssertNil(smoother.accept(midi: 69.1, confidence: 0.9))
        XCTAssertNil(smoother.accept(midi: 68.9, confidence: 0.9))
        XCTAssertNotNil(smoother.accept(midi: 69, confidence: 0.9))
        XCTAssertNil(smoother.accept(midi: 81, confidence: 0.9))
        XCTAssertEqual(smoother.setTarget(70)?.centsError ?? 0, -100, accuracy: 5)
    }

    func testQuizRendererHonorsOnsetPauseSeekAndLoop() {
        let renderer = QuizPCMRenderer(sampleRate: 1_000)
        renderer.configure(QuizTimeline(
            durationSeconds: 1,
            events: [QuizEvent(onsetSeconds: 0.25, durationSeconds: 0.25, frequenciesHz: [100], waveform: .sine)]
        ))
        var samples = [Float](repeating: 1, count: 1_000)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(samples.allSatisfy { $0 == 0 })
        renderer.play()
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(samples.prefix(250).allSatisfy { $0 == 0 })
        XCTAssertTrue(samples[250..<500].contains { abs($0) > 0.01 })
        XCTAssertTrue(samples.suffix(500).allSatisfy { $0 == 0 })
        XCTAssertEqual(renderer.currentFrame, 0)
        renderer.seek(progress: 0.25)
        renderer.pause()
        var paused = [Float](repeating: 1, count: 32)
        paused.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(paused.allSatisfy { $0 == 0 })
    }

    func testQuizRendererReportsTransportProgress() {
        let renderer = QuizPCMRenderer(sampleRate: 100)
        renderer.configure(QuizTimeline(
            durationSeconds: 2,
            events: [QuizEvent(onsetSeconds: 0, durationSeconds: 2, frequenciesHz: [25], waveform: .sine)]
        ))
        renderer.play()
        var samples = [Float](repeating: 0, count: 50)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.durationSeconds, 2, accuracy: 0.001)
        XCTAssertEqual(renderer.progress, 0.25, accuracy: 0.001)
    }

    func testQuizRendererTempoRatePreservesPositionAndAdvancesFractionally() {
        let renderer = QuizPCMRenderer(sampleRate: 1_000)
        renderer.configure(QuizTimeline(
            durationSeconds: 2,
            events: [QuizEvent(onsetSeconds: 0, durationSeconds: 2, frequenciesHz: [100], waveform: .sine)]
        ))
        renderer.play()
        var samples = [Float](repeating: 0, count: 100)

        renderer.setPlaybackRate(0.755)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.progress, 75.5 / 2_000, accuracy: 1e-12)
        XCTAssertEqual(renderer.durationSeconds, 2.0 / 0.755, accuracy: 1e-12)

        let progressBeforeChange = renderer.progress
        renderer.setPlaybackRate(1.25)
        XCTAssertEqual(renderer.progress, progressBeforeChange, accuracy: 1e-12)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.progress, 200.5 / 2_000, accuracy: 1e-12)
        XCTAssertEqual(renderer.durationSeconds, 2.0 / 1.25, accuracy: 1e-12)
    }

    func testQuizRendererTempoChangePreservesSustainedVoiceAgeAndPhase() {
        let timeline = QuizTimeline(
            durationSeconds: 2,
            events: [QuizEvent(onsetSeconds: 0, durationSeconds: 2, frequenciesHz: [137], waveform: .marimba)]
        )
        let changed = QuizPCMRenderer(sampleRate: 1_000)
        let reference = QuizPCMRenderer(sampleRate: 1_000)
        changed.configure(timeline)
        reference.configure(timeline)
        changed.play()
        reference.play()
        var leadIn = [Float](repeating: 0, count: 100)
        leadIn.withUnsafeMutableBufferPointer { changed.render(into: $0) }
        leadIn.withUnsafeMutableBufferPointer { reference.render(into: $0) }

        changed.setPlaybackRate(2)
        var changedSamples = [Float](repeating: 0, count: 128)
        var referenceSamples = [Float](repeating: 0, count: 128)
        changedSamples.withUnsafeMutableBufferPointer { changed.render(into: $0) }
        referenceSamples.withUnsafeMutableBufferPointer { reference.render(into: $0) }

        for (changedSample, referenceSample) in zip(changedSamples, referenceSamples) {
            XCTAssertEqual(changedSample, referenceSample, accuracy: 1e-7)
        }
        XCTAssertEqual(changed.currentFrame, 356)
        XCTAssertEqual(reference.currentFrame, 228)
    }

    func testQuizRendererZeroAndPausedRateChangesDoNotMoveTransport() {
        let renderer = QuizPCMRenderer(sampleRate: 1_000)
        renderer.configure(QuizTimeline(
            durationSeconds: 1,
            events: [QuizEvent(onsetSeconds: 0, durationSeconds: 1, frequenciesHz: [100], waveform: .sine)]
        ))
        renderer.seek(progress: 0.25)
        renderer.setPlaybackRate(1.5)
        var samples = [Float](repeating: 1, count: 20)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.phase, .paused)
        XCTAssertEqual(renderer.progress, 0.25, accuracy: 1e-12)
        XCTAssertTrue(samples.allSatisfy { $0 == 0 })

        renderer.play()
        renderer.setPlaybackRate(0)
        samples = [Float](repeating: 1, count: 20)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.progress, 0.25, accuracy: 1e-12)
        XCTAssertTrue(samples.allSatisfy { $0 == 0 })

        renderer.pause()
        renderer.setPlaybackRate(0.5)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertEqual(renderer.phase, .paused)
        XCTAssertEqual(renderer.progress, 0.25, accuracy: 1e-12)
    }

    func testQuizRendererArpeggioUsesNativeTempoAndCyclesChordTonesInOrder() {
        let renderer = QuizPCMRenderer(sampleRate: 4_000)
        renderer.setSoundConfiguration(QuizSoundConfiguration(
            waveform: .sine,
            melodyChordBalance: 0,
            arpeggioOption: .one
        ))
        renderer.configure(QuizTimeline(
            durationSeconds: 1,
            events: [QuizEvent(
                onsetSeconds: 0,
                durationSeconds: 1,
                frequenciesHz: [100, 200],
                waveform: .sine,
                channel: .chord
            )],
            nativeBeatsPerSecond: 2.5
        ))
        renderer.play()

        var samples = [Float](repeating: 0, count: 2_400)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }

        let firstTone = zeroCrossings(in: samples[100..<700])
        let secondTone = zeroCrossings(in: samples[900..<1_500])
        let wrappedTone = zeroCrossings(in: samples[1_700..<2_300])
        XCTAssertGreaterThan(secondTone, firstTone * 3 / 2)
        XCTAssertEqual(wrappedTone, firstTone, accuracy: 2)
    }

    func testQuizRendererArpeggioUsesFractionalTransportAtSlotBoundary() {
        let renderer = QuizPCMRenderer(sampleRate: 1_000)
        renderer.setSoundConfiguration(QuizSoundConfiguration(
            waveform: .square,
            melodyChordBalance: 0,
            arpeggioOption: .four
        ))
        renderer.configure(QuizTimeline(
            durationSeconds: 1,
            events: [QuizEvent(
                onsetSeconds: 0,
                durationSeconds: 1,
                frequenciesHz: [100, 200],
                waveform: .square,
                channel: .chord
            )],
            nativeBeatsPerSecond: 2
        ))
        renderer.setPlaybackRate(0.5)
        renderer.play()

        var samples = [Float](repeating: 0, count: 127)
        samples.withUnsafeMutableBufferPointer { renderer.render(into: $0) }

        // 125 output frames place the fractional musical clock at source frame
        // 62.5, exactly at the next tone's slot boundary.
        XCTAssertEqual(samples[125], 0, accuracy: 1e-7)
        XCTAssertGreaterThan(abs(samples[126]), 0.005)
        XCTAssertEqual(renderer.progress, 63.5 / 1_000, accuracy: 1e-12)
    }

    func testQuizRendererTempoChangePreservesArpeggioVoicePhaseAndUsesMusicalPosition() {
        let timeline = QuizTimeline(
            durationSeconds: 2,
            events: [QuizEvent(
                onsetSeconds: 0,
                durationSeconds: 2,
                frequenciesHz: [100, 200],
                waveform: .sine,
                channel: .chord
            )],
            nativeBeatsPerSecond: 2
        )
        let configuration = QuizSoundConfiguration(
            waveform: .sine,
            melodyChordBalance: 0,
            arpeggioOption: .one
        )
        let changed = QuizPCMRenderer(sampleRate: 4_000)
        let reference = QuizPCMRenderer(sampleRate: 4_000)
        for renderer in [changed, reference] {
            renderer.setSoundConfiguration(configuration)
            renderer.configure(timeline)
            renderer.play()
        }
        var leadIn = [Float](repeating: 0, count: 1_137)
        leadIn.withUnsafeMutableBufferPointer { changed.render(into: $0) }
        leadIn.withUnsafeMutableBufferPointer { reference.render(into: $0) }

        changed.setPlaybackRate(2)
        var firstChanged = [Float](repeating: 0, count: 1)
        var firstReference = [Float](repeating: 0, count: 1)
        firstChanged.withUnsafeMutableBufferPointer { changed.render(into: $0) }
        firstReference.withUnsafeMutableBufferPointer { reference.render(into: $0) }
        XCTAssertGreaterThan(abs(firstReference[0]), 0.01)
        XCTAssertEqual(firstChanged[0], firstReference[0], accuracy: 1e-7)

        var changedTail = [Float](repeating: 0, count: 600)
        var referenceTail = [Float](repeating: 0, count: 600)
        changedTail.withUnsafeMutableBufferPointer { changed.render(into: $0) }
        referenceTail.withUnsafeMutableBufferPointer { reference.render(into: $0) }
        XCTAssertTrue(zip(changedTail, referenceTail).contains { abs($0 - $1) > 0.02 })
        XCTAssertEqual(changed.currentFrame, 2_339)
        XCTAssertEqual(reference.currentFrame, 1_738)
    }

    func testQuizRendererLiveArpeggioChangeCrossfadesFromOldMode() {
        let timeline = QuizTimeline(
            durationSeconds: 1,
            events: [QuizEvent(
                onsetSeconds: 0,
                durationSeconds: 1,
                frequenciesHz: [100, 200],
                waveform: .sine,
                channel: .chord
            )]
        )
        let sustained = QuizSoundConfiguration(
            waveform: .sine,
            melodyChordBalance: 0,
            arpeggioOption: .off
        )
        let changed = QuizPCMRenderer(sampleRate: 1_000)
        let reference = QuizPCMRenderer(sampleRate: 1_000)
        for renderer in [changed, reference] {
            renderer.setSoundConfiguration(sustained)
            renderer.configure(timeline)
            renderer.play()
        }
        var leadIn = [Float](repeating: 0, count: 100)
        leadIn.withUnsafeMutableBufferPointer { changed.render(into: $0) }
        leadIn.withUnsafeMutableBufferPointer { reference.render(into: $0) }

        changed.setSoundConfiguration(QuizSoundConfiguration(
            waveform: .sine,
            melodyChordBalance: 0,
            arpeggioOption: .one
        ))
        var changedSamples = [Float](repeating: 0, count: 48)
        var referenceSamples = [Float](repeating: 0, count: 48)
        changedSamples.withUnsafeMutableBufferPointer { changed.render(into: $0) }
        referenceSamples.withUnsafeMutableBufferPointer { reference.render(into: $0) }

        XCTAssertEqual(changedSamples[0], referenceSamples[0], accuracy: 1e-7)
        XCTAssertTrue(zip(changedSamples.suffix(16), referenceSamples.suffix(16)).contains {
            abs($0 - $1) > 0.02
        })
    }

    func testQuizRendererArpeggioLeavesMelodyPreviewAndSingleToneChordUnchanged() {
        for (channel, frequencies) in [
            (AudioPlaybackChannel.melody, [100.0, 200.0]),
            (.preview, [100.0, 200.0]),
            (.chord, [100.0])
        ] {
            let timeline = QuizTimeline(
                durationSeconds: 1,
                events: [QuizEvent(
                    onsetSeconds: 0,
                    durationSeconds: 1,
                    frequenciesHz: frequencies,
                    waveform: .sine,
                    channel: channel
                )]
            )
            let changed = QuizPCMRenderer(sampleRate: 1_000)
            let reference = QuizPCMRenderer(sampleRate: 1_000)
            let off = QuizSoundConfiguration(
                waveform: .sine,
                melodyChordBalance: channel == .chord ? 0 : 1
            )
            for renderer in [changed, reference] {
                renderer.setSoundConfiguration(off)
                renderer.configure(timeline)
                renderer.play()
            }
            var leadIn = [Float](repeating: 0, count: 100)
            leadIn.withUnsafeMutableBufferPointer { changed.render(into: $0) }
            leadIn.withUnsafeMutableBufferPointer { reference.render(into: $0) }

            changed.setSoundConfiguration(QuizSoundConfiguration(
                waveform: .sine,
                melodyChordBalance: channel == .chord ? 0 : 1,
                arpeggioOption: .four
            ))
            var changedSamples = [Float](repeating: 0, count: 64)
            var referenceSamples = [Float](repeating: 0, count: 64)
            changedSamples.withUnsafeMutableBufferPointer { changed.render(into: $0) }
            referenceSamples.withUnsafeMutableBufferPointer { reference.render(into: $0) }
            XCTAssertEqual(changedSamples, referenceSamples, "Unexpected arp effect on \(channel)")
        }
    }

    func testQuizRendererLayerGainRampReachesTrueZeroAndLeavesPreviewUnweighted() {
        let chord = QuizPCMRenderer(sampleRate: 1_000)
        chord.setSoundConfiguration(QuizSoundConfiguration(
            waveform: .sine,
            melodyChordBalance: 0.5
        ))
        chord.configure(QuizTimeline(
            durationSeconds: 1,
            events: [QuizEvent(
                onsetSeconds: 0,
                durationSeconds: 1,
                frequenciesHz: [125],
                waveform: .sawtooth,
                channel: .chord
            )]
        ))
        chord.play()
        var leadIn = [Float](repeating: 0, count: 100)
        leadIn.withUnsafeMutableBufferPointer { chord.render(into: $0) }
        XCTAssertTrue(leadIn.contains { abs($0) > 0.01 })

        chord.setSoundConfiguration(QuizSoundConfiguration(
            waveform: .sine,
            melodyChordBalance: 1
        ))
        var faded = [Float](repeating: 0, count: 64)
        faded.withUnsafeMutableBufferPointer { chord.render(into: $0) }
        XCTAssertTrue(faded.suffix(32).allSatisfy { $0 == 0 })

        let preview = QuizPCMRenderer(sampleRate: 1_000)
        preview.setSoundConfiguration(QuizSoundConfiguration(
            waveform: .sine,
            melodyChordBalance: 1
        ))
        preview.configure(QuizTimeline(
            durationSeconds: 1,
            events: [QuizEvent(
                onsetSeconds: 0,
                durationSeconds: 1,
                frequenciesHz: [125],
                waveform: .sawtooth,
                channel: .preview
            )]
        ))
        preview.play()
        var previewSamples = [Float](repeating: 0, count: 64)
        previewSamples.withUnsafeMutableBufferPointer { preview.render(into: $0) }
        XCTAssertTrue(previewSamples.contains { abs($0) > 0.01 })
    }

    func testQuizRendererLiveTransposeIsAbsoluteAndPreservesTransportAndPhase() {
        let source = QuizTimeline(
            durationSeconds: 2,
            events: [QuizEvent(
                onsetSeconds: 0,
                durationSeconds: 2,
                frequenciesHz: [100],
                waveform: .sawtooth
            )]
        )
        let changed = QuizPCMRenderer(sampleRate: 4_000)
        let reference = QuizPCMRenderer(sampleRate: 4_000)
        changed.setSoundConfiguration(QuizSoundConfiguration(
            waveform: .sine,
            melodyChordBalance: 1
        ))
        reference.setSoundConfiguration(QuizSoundConfiguration(
            waveform: .sine,
            melodyChordBalance: 1,
            transposeSemitones: 12
        ))
        changed.configure(source)
        reference.configure(source)
        changed.play()
        reference.play()

        var leadIn = [Float](repeating: 0, count: 40)
        leadIn.withUnsafeMutableBufferPointer { changed.render(into: $0) }
        leadIn.withUnsafeMutableBufferPointer { reference.render(into: $0) }
        let frameBeforeChange = changed.currentFrame
        let progressBeforeChange = changed.progress
        changed.setSoundConfiguration(QuizSoundConfiguration(
            waveform: .sine,
            melodyChordBalance: 1,
            transposeSemitones: 12
        ))
        XCTAssertEqual(changed.currentFrame, frameBeforeChange)
        XCTAssertEqual(changed.progress, progressBeforeChange, accuracy: 1e-12)
        XCTAssertEqual(changed.phase, .playing)

        var transition = [Float](repeating: 0, count: 96)
        transition.withUnsafeMutableBufferPointer { changed.render(into: $0) }
        transition.withUnsafeMutableBufferPointer { reference.render(into: $0) }

        changed.setSoundConfiguration(QuizSoundConfiguration(
            waveform: .sine,
            melodyChordBalance: 1,
            transposeSemitones: 12
        ))
        var changedSamples = [Float](repeating: 0, count: 128)
        var referenceSamples = [Float](repeating: 0, count: 128)
        changedSamples.withUnsafeMutableBufferPointer { changed.render(into: $0) }
        referenceSamples.withUnsafeMutableBufferPointer { reference.render(into: $0) }
        for (actual, expected) in zip(changedSamples, referenceSamples) {
            XCTAssertEqual(actual, expected, accuracy: 1e-7)
        }
    }

    private func zeroCrossings(in samples: ArraySlice<Float>) -> Int {
        zip(samples, samples.dropFirst()).reduce(into: 0) { count, pair in
            if (pair.0 < 0 && pair.1 >= 0) || (pair.0 > 0 && pair.1 <= 0) {
                count += 1
            }
        }
    }
}

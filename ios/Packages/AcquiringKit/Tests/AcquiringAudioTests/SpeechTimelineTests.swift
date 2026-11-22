import AcquiringCore
import XCTest
@testable import AcquiringAudio

final class SpeechTimelineTests: XCTestCase {
    func testDelayedSemanticReplacementMutesOldWordsAndPitchButVolumeDoesNot() {
        let root = QuizSoundConfiguration(cue: .spokenNumber)
        let changes = [QuizSoundConfiguration(cue: .melodyFunction),
                       QuizSoundConfiguration(transposeSemitones: 2, cue: .spokenNumber),
                       QuizSoundConfiguration(cue: .spokenNumber, majorLocked: true),
                       QuizSoundConfiguration(chordMode: .rootOnly, cue: .spokenNumber)]
        for changed in changes {
            let renderer = QuizPCMRenderer(sampleRate: 24_000)
            renderer.configure(.init(durationSeconds: 4, events: []))
            renderer.setSoundConfiguration(root)
            let phrase = PreparedSpeech(identity: 0, onsetSeconds: 0, endSeconds: 4,
                                        samples: [Int16](repeating: 8000, count: 24000))
            renderer.setPreparedSpeech([phrase], preparedFor: root)
            renderer.play()
            var output = [Float](repeating: 0, count: 4800)
            output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
            XCTAssertGreaterThan(output[1000], 0)
            renderer.setSoundConfiguration(changed)
            output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
            XCTAssertTrue(output.allSatisfy { $0 == 0 }, "Old semantics must be silent during preparation")
            renderer.setPreparedSpeech([phrase], preparedFor: root) // A stale background result.
            output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
            XCTAssertTrue(output.allSatisfy { $0 == 0 })
            renderer.setPreparedSpeech([phrase], preparedFor: changed)
            output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
            XCTAssertGreaterThan(output[1000], 0)
        }
        let renderer = QuizPCMRenderer(sampleRate: 24_000)
        renderer.configure(.init(durationSeconds: 4, events: []))
        renderer.setSoundConfiguration(root)
        renderer.setPreparedSpeech([.init(identity: 0, onsetSeconds: 0, endSeconds: 4,
                                          samples: [Int16](repeating: 8000, count: 24000))], preparedFor: root)
        renderer.play()
        var output = [Float](repeating: 0, count: 1000)
        output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        renderer.setSoundConfiguration(.init(cue: .spokenNumber, voiceVolume: 0.8))
        output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertGreaterThan(output[500], 0, "Volume-only edits keep installed speech audible")
    }

    func testPhraseCompletesWhileIncompatibleReplacementIsPending() {
        let renderer = QuizPCMRenderer(sampleRate: 24_000)
        let old = QuizSoundConfiguration(cue: .spokenNumber)
        let new = QuizSoundConfiguration(transposeSemitones: 2, cue: .spokenNumber)
        let phrase = PreparedSpeech(identity: 0, onsetSeconds: 0, endSeconds: 3,
                                    samples: [Int16](repeating: 8000, count: 2400))
        renderer.configure(.init(durationSeconds: 3, events: []))
        renderer.setSoundConfiguration(old)
        renderer.setPreparedSpeech([phrase], preparedFor: old)
        renderer.play()
        var output = [Float](repeating: 0, count: 1200)
        output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        renderer.setSoundConfiguration(new)
        output = [Float](repeating: 1, count: 4800)
        output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(output.allSatisfy { $0 == 0 })
        renderer.setPreparedSpeech([phrase], preparedFor: new)
        output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(output.allSatisfy { $0 == 0 }, "Completed words must not restart when replacement arrives")
    }

    func testPinnedOpeningWindowSpeaksOnLaterLoopWithoutPollerReplacement() throws {
        let timeline = QuizTimeline(durationSeconds: 20, events: [0.0, 19.0].map {
            QuizEvent(onsetSeconds: $0, durationSeconds: 1, frequenciesHz: [], waveform: .sine,
                      channel: .chord, cueContext: .init(rootDegree: 1, rootMidi: 60))
        })
        let configuration = QuizSoundConfiguration(cue: .spokenNumber)
        let finalWindow = try SpeechTimelinePreparation.prepareLookahead(timeline, configuration: configuration,
                                                                        playbackRate: 1, sourceStart: 18)
        XCTAssertLessThanOrEqual(finalWindow.reduce(0) { $0 + $1.samples.count }, SpokenCuePreparation.maximumFrames)
        XCTAssertTrue(finalWindow.contains { $0.identity == 0 })
        let renderer = QuizPCMRenderer(sampleRate: 1000)
        renderer.configure(timeline)
        renderer.setSoundConfiguration(configuration)
        renderer.setPreparedSpeech(finalWindow, preparedFor: configuration)
        renderer.seek(progress: 0.95)
        renderer.play()
        var output = [Float](repeating: 0, count: 2200)
        output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertGreaterThan(output[1020..<1300].map { abs($0) }.max()!, 0.001)
        // No transport poller or background install runs before another loop.
        output = [Float](repeating: 0, count: 20000)
        output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertGreaterThan(output[18820..<19100].map { abs($0) }.max()!, 0.001)
    }

    func testLongSectionRetainsOnlyLookaheadPCM() throws {
        let events = (0..<64).map { index in
            QuizEvent(onsetSeconds: Double(index * 3), durationSeconds: 3, frequenciesHz: [], waveform: .sine,
                      channel: .chord, cueContext: .init(rootDegree: 1, rootMidi: 60))
        }
        let timeline = QuizTimeline(durationSeconds: 192, events: events)
        var cumulative = 0
        var seen = Set<Int>()
        for start in stride(from: 0.0, to: 192, by: 8) {
            let phrases = try SpeechTimelinePreparation.prepareLookahead(timeline, configuration: .init(cue: .spokenNumber),
                                                                        playbackRate: 1, sourceStart: start)
            let retained = phrases.reduce(0) { $0 + $1.samples.count }
            XCTAssertLessThanOrEqual(retained, SpokenCuePreparation.maximumFrames)
            cumulative += retained
            seen.formUnion(phrases.map(\.identity))
        }
        XCTAssertEqual(seen.count, 64)
        XCTAssertGreaterThan(cumulative, SpokenCuePreparation.maximumFrames)
    }

    func testSeekDuringPreparationRejectsOldResultAndExpiredCueCannotStartLate() {
        var revision = SpeechPreparationRevision()
        revision.invalidate()
        let preparingBeforeSeek = revision.current
        let renderer = QuizPCMRenderer(sampleRate: 24_000)
        renderer.configure(.init(durationSeconds: 10, events: []))
        renderer.setSoundConfiguration(.init(cue: .spokenNumber))
        renderer.seek(progress: 0.5)
        revision.invalidate() // The production seek path calls refreshPreparedSpeech, which invalidates.
        XCTAssertFalse(revision.accepts(preparingBeforeSeek))
        XCTAssertTrue(revision.accepts(revision.current))
        // Even a valid result completing after its cue's end cannot restart that cue.
        renderer.setPreparedSpeech([.init(identity: 0, onsetSeconds: 0, endSeconds: 1,
                                          samples: [Int16](repeating: 8000, count: 24000))])
        renderer.play()
        var output = [Float](repeating: 1, count: 100)
        output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(output.allSatisfy { $0 == 0 })
    }

    func testExistingControlCopiesKeepSavedCueAndVoiceVolume() {
        let saved = QuizSoundConfiguration(cue: .sungNumberWithDetails, voiceVolume: 0.83, majorLocked: true)
        let variants = [saved.replacing(waveform: .flute), saved.replacing(melodyChordBalance: 0.8),
                        saved.replacing(transposeSemitones: 3), saved.replacing(arpeggioOption: .four),
                        saved.replacing(chordMode: .rootOnly), saved.replacing(majorLocked: false)]
        for value in variants {
            XCTAssertEqual(value.cue, saved.cue)
            XCTAssertEqual(value.voiceVolume, saved.voiceVolume)
        }
    }

    func testCompletedPhraseDoesNotReplayAfterTempoPreparationGainOrSeek() {
        let renderer = QuizPCMRenderer(sampleRate: 24_000)
        renderer.configure(.init(durationSeconds: 2, events: []))
        renderer.setSoundConfiguration(.init(cue: .spokenNumber, voiceVolume: 1))
        renderer.setPreparedSpeech([.init(identity: 0, onsetSeconds: 0, endSeconds: 2,
                                          samples: [Int16](repeating: 8000, count: 2400))])
        renderer.play()
        var output = [Float](repeating: 0, count: 4800)
        output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertGreaterThan(output[1000], 0.1)
        renderer.setPlaybackRate(0.5)
        renderer.setPreparedSpeech([.init(identity: 0, onsetSeconds: 0, endSeconds: 2,
                                          samples: [Int16](repeating: 8000, count: 4800))])
        renderer.setSoundConfiguration(.init(cue: .spokenNumber, voiceVolume: 0.8))
        output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(output.allSatisfy { $0 == 0 })
        renderer.seek(progress: 0.75)
        output.withUnsafeMutableBufferPointer { renderer.render(into: $0) }
        XCTAssertTrue(output.allSatisfy { $0 == 0 })
    }

    func testNewAndroidSongOpeningReferenceOverridesChorusRelativeMajor() throws {
        let section = try JSONDecoder().decode(ExtractedSection.self, from: Data("""
        {"chords":[{"beat":1,"root":1,"duration":1},{"beat":2,"root":7,"duration":1}],
         "metadata":{"keys":[{"beat":1,"tonic":"G","scale":"dorian"}]}}
        """.utf8))
        let timeline = QuizTimeline(durationSeconds: 1, events: [0.0, 0.5].map {
            QuizEvent(onsetSeconds: $0, durationSeconds: 0.5, frequenciesHz: [], waveform: .sine, channel: .chord)
        })
        let song = PlaybackCueTimeline.annotate(timeline, section: section, songOpeningKey: .init(tonic: "G", scale: "major"))
        XCTAssertEqual(song.events[0].cueContext.majorDegree, 1)
        XCTAssertEqual(song.events[0].cueContext.majorAlteration, 0)
        XCTAssertEqual(song.events[0].cueContext.fifthsFromMajorTonic, 0)
        XCTAssertEqual(song.events[1].cueContext.majorDegree, 7)
        XCTAssertEqual(song.events[1].cueContext.majorAlteration, -1)
        let fallback = PlaybackCueTimeline.annotate(timeline, section: section)
        XCTAssertEqual(fallback.events[0].cueContext.majorDegree, 2)
    }

    func testModeSpeechHasSeparateWindowAndLockSuppressesIt() throws {
        let events = [
            QuizEvent(onsetSeconds: 0, durationSeconds: 2, frequenciesHz: [], waveform: .sine, channel: .chord,
                      cueContext: .init(rootDegree: 1, majorDegree: 1, rootMidi: 60, keyScale: "major", keyTonicMidi: 60)),
            QuizEvent(onsetSeconds: 2, durationSeconds: 2, frequenciesHz: [], waveform: .sine, channel: .chord,
                      cueContext: .init(rootDegree: 1, majorDegree: 1, rootMidi: 62, keyScale: "dorian", keyTonicMidi: 62))
        ]
        let timeline = QuizTimeline(durationSeconds: 4, events: events)
        let unlocked = try SpeechTimelinePreparation.prepare(timeline, configuration: .init(cue: .spokenNumber), playbackRate: 1)
        let mode = try XCTUnwrap(unlocked.first { $0.identity == 1 })
        XCTAssertEqual(mode.endSeconds, 2)
        XCTAssertGreaterThan(mode.onsetSeconds, 0)
        let locked = try SpeechTimelinePreparation.prepare(timeline, configuration: .init(cue: .spokenNumber, majorLocked: true), playbackRate: 1)
        XCTAssertEqual(locked.map(\.identity), [0, 2])
    }
}

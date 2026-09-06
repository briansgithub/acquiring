import Foundation
import XCTest

/// Breadth coverage added for the autonomous parity run: transport, seeking,
/// knobs, blend, root-only, Lock in Major, the practice dock, and control
/// geometry. Text, values, and frames only — no screenshots.
@MainActor
final class QuizCoverageTests: XCTestCase {
    private enum Fixture {
        static let fiveHundredMiles = "500 Miles, by the-proclaimers"
        static let quizTitle = "500 Miles by the-proclaimers"
    }

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    func testInformationDetourPreservesQuizAndBackReturnsDirectlyToSearch() {
        let app = launchReadyQuiz()
        let info = app.buttons["quiz.info"]
        XCTAssertTrue(info.waitForExistence(timeout: 10))
        XCTAssertEqual(info.label, "Song information")
        XCTAssertGreaterThanOrEqual(info.frame.width, 43.5)
        XCTAssertGreaterThanOrEqual(info.frame.height, 43.5)

        let section = app.descendants(matching: .any)["quiz.section"]
        section.tap()
        app.buttons["Chorus"].tap()
        XCTAssertTrue(waitForValue(section, "Chorus", timeout: 5))
        let instrument = app.descendants(matching: .any)["quiz.instrument"]
        instrument.tap()
        app.buttons["Sine"].tap()
        XCTAssertTrue(waitForValue(instrument, "Sine", timeout: 5))

        for visit in 0..<3 {
            info.tap()
            XCTAssertTrue(app.descendants(matching: .any)["songDetail.info"].waitForExistence(timeout: 10))
            if visit == 1 {
                app.buttons["songDetail.quiz"].tap()
            } else {
                app.navigationBars.buttons["BackButton"].firstMatch.tap()
            }
            XCTAssertTrue(info.waitForExistence(timeout: 10))
            XCTAssertTrue(waitForValue(section, "Chorus", timeout: 5))
            XCTAssertTrue(waitForValue(instrument, "Sine", timeout: 5))
        }
        app.navigationBars.buttons["BackButton"].firstMatch.tap()
        XCTAssertTrue(app.textFields["library.search.field"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.navigationBars["Song"].exists)
        XCTAssertFalse(info.exists)
    }

    func testQuizEdgeBackSettingDefaultsOffPersistsAndReturnsToArtist() {
        let app = launchReadyQuiz()
        func edgeSwipe() {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        edgeSwipe()
        XCTAssertTrue(app.buttons["quiz.info"].exists, "Edge Back must be off by default")
        app.navigationBars.buttons["BackButton"].firstMatch.tap()
        app.buttons["catalog.settings"].tap()
        let toggle = app.switches["settings.quizEdgeSwipeBack"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 10))
        XCTAssertEqual(toggle.value as? String, "0")
        if toggle.switches.firstMatch.exists { toggle.switches.firstMatch.tap() } else { toggle.tap() }
        XCTAssertTrue(waitForValue(toggle, "1", timeout: 5))

        app.terminate()
        app.launch()
        app.buttons["catalog.settings"].tap()
        XCTAssertTrue(waitForValue(toggle, "1", timeout: 10), "The setting must survive relaunch")
        app.navigationBars.buttons["BackButton"].firstMatch.tap()
        let search = app.textFields["library.search.field"]
        let artistsScope = app.segmentedControls["library.search.scope"].buttons["Artists"]
        artistsScope.tap()
        XCTAssertTrue(artistsScope.isSelected)
        search.tap()
        search.typeText("proclaimers")
        let artist = app.buttons.matching(NSPredicate(format: "label MATCHES[c] %@", "the[- ]proclaimers")).firstMatch
        guard artist.waitForExistence(timeout: 10) else { XCTFail("Artist result missing"); return }
        artist.tap()
        let song = app.buttons[Fixture.fiveHundredMiles]
        guard song.waitForExistence(timeout: 10) else { XCTFail("Artist's song missing"); return }
        song.tap()
        XCTAssertTrue(app.buttons["quiz.info"].waitForExistence(timeout: 10))
        app.swipeRight()
        XCTAssertTrue(app.buttons["quiz.info"].exists, "A full-screen swipe must not leave Quiz")
        edgeSwipe()
        XCTAssertTrue(song.waitForExistence(timeout: 10), "Enabled edge Back must return directly to the artist's songs")
        XCTAssertFalse(app.buttons["quiz.info"].exists)
        XCTAssertFalse(app.navigationBars["Song"].exists)

        app.navigationBars.buttons["BackButton"].firstMatch.tap()
        app.buttons["catalog.settings"].tap()
        XCTAssertTrue(toggle.waitForExistence(timeout: 10))
        if toggle.switches.firstMatch.exists { toggle.switches.firstMatch.tap() } else { toggle.tap() }
        XCTAssertTrue(waitForValue(toggle, "0", timeout: 5))
        app.navigationBars.buttons["BackButton"].firstMatch.tap()
        artist.tap()
        song.tap()
        XCTAssertTrue(app.buttons["quiz.info"].waitForExistence(timeout: 10))
        edgeSwipe()
        XCTAssertTrue(app.buttons["quiz.info"].exists, "Turning the setting off must disable edge Back again")
    }

    // MARK: - F054 control geometry

    /// Every primary Quiz control must present at least a 44 pt touch target.
    func testQuizPrimaryControlsMeetMinimumTouchTargets() {
        let app = launchReadyQuiz()
        let identifiers = [
            "quiz.info",
            "quiz.reset",
            "quiz.section",
            "quiz.play",
            "quiz.instrument",
            "quiz.transpose",
            "quiz.lockInMajor",
            "quiz.mode",
            "quiz.tempo",
            "quiz.arpeggio",
            "quiz.balance"
        ]
        var undersized: [String] = []
        for identifier in identifiers {
            let element = app.descendants(matching: .any)[identifier]
            guard element.waitForExistence(timeout: 5) else {
                undersized.append("\(identifier): missing")
                continue
            }
            let frame = element.frame
            if frame.width < 43.5 || frame.height < 43.5 {
                undersized.append("\(identifier): \(Int(frame.width))x\(Int(frame.height))")
            }
        }
        XCTAssertTrue(
            undersized.isEmpty,
            "Controls below the 44 pt minimum touch target: \(undersized.joined(separator: ", "))"
        )
    }

    // MARK: - F029 Reset

    func testResetStopsPlaybackAndReturnsToTheBeginningWithoutClearingSound() {
        let app = launchReadyQuiz()
        let play = app.buttons["quiz.play"]
        XCTAssertTrue(play.waitForExistence(timeout: 10))
        XCTAssertTrue(waitForEnabled(play, timeout: 30))

        // Change a sound setting first: Reset must not revert it.
        let instrument = app.descendants(matching: .any)["quiz.instrument"]
        instrument.tap()
        let sine = app.buttons["Sine"]
        XCTAssertTrue(sine.waitForExistence(timeout: 5))
        sine.tap()
        XCTAssertTrue(waitForValue(instrument, "Sine", timeout: 5))

        let timeline = app.descendants(matching: .any)["quiz.timeline"]
        XCTAssertTrue(timeline.waitForExistence(timeout: 5))
        timeline.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        XCTAssertTrue(
            poll(timeout: 5) { (timeline.value as? String) != "Beat 1" },
            "Timeline tap did not seek away from the beginning. Value: \(String(describing: timeline.value))"
        )

        play.tap()
        XCTAssertTrue(waitForLabel(play, "Pause", timeout: 30), "Transport never started")

        let reset = app.buttons["quiz.reset"]
        XCTAssertTrue(reset.waitForExistence(timeout: 5))
        reset.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.15)).tap()
        XCTAssertTrue(
            waitForLabel(play, "Play", timeout: 10),
            "Reset from playing must stop playback. Play label: \(play.label)"
        )
        XCTAssertTrue(
            waitForValue(timeline, "Beat 1", timeout: 10),
            "Reset must return to the beginning. Timeline value: \(String(describing: timeline.value))"
        )
        XCTAssertEqual(instrument.value as? String, "Sine", "Reset must not revert sound settings")
        XCTAssertFalse(app.alerts["Audio"].exists)
    }

    // MARK: - F028 Seeking

    func testTimelineTapSeeksWithinBoundsInBothLanes() {
        let app = launchReadyQuiz()
        let melody = app.descendants(matching: .any)["quiz.timeline"]
        let chords = app.descendants(matching: .any)["quiz.chordTimeline"]
        XCTAssertTrue(melody.waitForExistence(timeout: 10))
        XCTAssertTrue(chords.waitForExistence(timeout: 10))
        XCTAssertEqual(melody.value as? String, "Beat 1")
        XCTAssertEqual(chords.value as? String, "Beat 1")

        // Tapping far left of the fixed playhead cannot move before beat 1.
        melody.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.5)).tap()
        XCTAssertTrue(
            poll(timeout: 3) { (melody.value as? String) == "Beat 1" },
            "Seeking below the lower bound must clamp. Value: \(String(describing: melody.value))"
        )

        melody.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        XCTAssertTrue(
            poll(timeout: 5) { (melody.value as? String) != "Beat 1" },
            "A melody timeline tap right of the playhead must seek forward"
        )
        let afterMelodySeek = melody.value as? String
        XCTAssertEqual(chords.value as? String, afterMelodySeek, "Both lanes must stay synchronized")

        // The chord lane drives the same shared position.
        chords.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.5)).tap()
        XCTAssertTrue(
            poll(timeout: 5) { (chords.value as? String) != afterMelodySeek },
            "A chord timeline tap must also seek"
        )
        XCTAssertEqual(melody.value as? String, chords.value as? String, "Both lanes must stay synchronized")

        // Repeated far-right taps must settle at the section end, not run away.
        for _ in 0..<25 {
            melody.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
        }
        let bounded = melody.value as? String
        melody.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
        XCTAssertTrue(
            poll(timeout: 3) { (melody.value as? String) == bounded },
            "Seeking past the section end must clamp. \(String(describing: bounded)) then \(String(describing: melody.value))"
        )
        XCTAssertEqual(app.state, .runningForeground)
        XCTAssertFalse(app.alerts["Audio"].exists)
    }

    // MARK: - F030 / F033 knobs

    func testTempoAndArpeggioKnobsAdjustAndResetThroughNamedActions() {
        let app = launchReadyQuiz()
        let tempo = app.descendants(matching: .any)["quiz.tempo"]
        XCTAssertTrue(tempo.waitForExistence(timeout: 10))
        XCTAssertEqual(tempo.value as? String, "100 percent")

        XCTAssertTrue(invokeKnobAction(app, knob: "quiz.tempo", action: "increase"), "Tempo increase action unavailable")
        XCTAssertTrue(
            poll(timeout: 3) { (tempo.value as? String) == "101 percent" },
            "One increase must be one percent. Value: \(String(describing: tempo.value))"
        )
        XCTAssertTrue(invokeKnobAction(app, knob: "quiz.tempo", action: "reset"), "Tempo reset action unavailable")
        XCTAssertTrue(
            poll(timeout: 3) { (tempo.value as? String) == "100 percent" },
            "Tempo reset must return to 100 percent. Value: \(String(describing: tempo.value))"
        )

        let arpeggio = app.descendants(matching: .any)["quiz.arpeggio"]
        XCTAssertTrue(arpeggio.waitForExistence(timeout: 5))
        XCTAssertEqual(arpeggio.value as? String, "Off")
        XCTAssertTrue(invokeKnobAction(app, knob: "quiz.arpeggio", action: "increase"), "Arpeggio increase unavailable")
        XCTAssertTrue(
            poll(timeout: 3) { (arpeggio.value as? String) == "1 cycles per beat" },
            "The slot after Off is 1 per beat. Value: \(String(describing: arpeggio.value))"
        )
        XCTAssertTrue(invokeKnobAction(app, knob: "quiz.arpeggio", action: "decrease"), "Arpeggio decrease unavailable")
        XCTAssertTrue(invokeKnobAction(app, knob: "quiz.arpeggio", action: "decrease"), "Arpeggio decrease unavailable")
        XCTAssertTrue(
            poll(timeout: 3) { (arpeggio.value as? String) == "1/2 cycles per beat" },
            "The slot before Off is 1/2 per beat. Value: \(String(describing: arpeggio.value))"
        )
        XCTAssertTrue(invokeKnobAction(app, knob: "quiz.arpeggio", action: "reset"), "Arpeggio reset unavailable")
        XCTAssertTrue(
            poll(timeout: 3) { (arpeggio.value as? String) == "Off" },
            "Arpeggio reset must return to Off. Value: \(String(describing: arpeggio.value))"
        )
        XCTAssertFalse(app.alerts["Audio"].exists)
    }

    // MARK: - F026 root-only mode

    func testArpeggioRingTapsAndFontSamplesDuringPlayback() {
        let app = launchReadyQuiz(previewFonts: true)
        let play = app.buttons["quiz.play"]
        XCTAssertTrue(waitForEnabled(play, timeout: 20))
        play.tap()
        XCTAssertTrue(waitForLabel(play, "Pause", timeout: 5))

        let arpeggio = app.descendants(matching: .any)["quiz.arpeggio"]
        for index in 4...7 {
            let angle = (135 + 270 * Double(index) / 7) * Double.pi / 180
            arpeggio.coordinate(withNormalizedOffset: CGVector(
                dx: 0.5 + 0.45 * cos(angle), dy: 0.5 + 0.45 * sin(angle)
            )).tap()
            XCTAssertTrue(waitForValue(arpeggio, "\(index - 3) cycles per beat", timeout: 3))
        }
        arpeggio.tap() // The centre remains reset-to-Off.
        XCTAssertTrue(waitForValue(arpeggio, "Off", timeout: 3))

        let sampler = app.buttons["quiz.fontSampler"]
        XCTAssertTrue(sampler.waitForExistence(timeout: 5))
        for style in ["Palatino", "Didot", "Avenir Next", "System Serif"] {
            sampler.tap()
            if style == "Avenir Next" {
                let more = app.buttons["More Fonts"]
                XCTAssertTrue(more.waitForExistence(timeout: 5))
                more.tap()
            }
            let choice = app.buttons[style]
            XCTAssertTrue(choice.waitForExistence(timeout: 5))
            choice.tap()
            XCTAssertTrue(waitForValue(sampler, style, timeout: 3))
            XCTAssertEqual(play.label, "Pause", "Font samples must not stop playback")
        }
        XCTAssertFalse(app.alerts["Audio"].exists)
        play.tap()
    }

    func testRootOnlyModeReplacesCardsAndReturnsToFullMode() {
        let app = launchReadyQuiz()
        let mode = app.descendants(matching: .any)["quiz.mode"]
        XCTAssertTrue(mode.waitForExistence(timeout: 10))
        XCTAssertEqual(mode.value as? String, "Full")
        XCTAssertTrue(app.descendants(matching: .any)["quiz.cards"].waitForExistence(timeout: 5))

        mode.tap()
        let roots = app.buttons["Root-only"]
        XCTAssertTrue(roots.waitForExistence(timeout: 5))
        roots.tap()
        XCTAssertTrue(waitForValue(mode, "Root-only", timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["quiz.rootCards"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.descendants(matching: .any)["quiz.rootSeek"].waitForExistence(timeout: 5),
            "Root-only mode exposes the accessible seek slider"
        )

        mode.tap()
        let full = app.buttons["Full"]
        XCTAssertTrue(full.waitForExistence(timeout: 5))
        full.tap()
        XCTAssertTrue(waitForValue(mode, "Full", timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["quiz.cards"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.alerts["Audio"].exists)
    }

    // MARK: - F037 Lock in Major

    func testLockInMajorChangesTheKeyLabelWithoutTransposingTheSource() {
        let app = launchReadyQuiz()
        let key = app.staticTexts["quiz.key"]
        XCTAssertTrue(key.waitForExistence(timeout: 10))
        let sourceKeyLabel = key.label
        let transpose = app.buttons["quiz.transpose"]
        XCTAssertTrue(transpose.waitForExistence(timeout: 5))
        let sourceTranspose = transpose.value as? String

        let lock = app.buttons["quiz.lockInMajor"]
        XCTAssertTrue(lock.waitForExistence(timeout: 5))
        XCTAssertEqual(lock.value as? String, "Off")
        lock.tap()
        XCTAssertTrue(waitForValue(lock, "On", timeout: 5), "Lock in Major did not toggle on")
        XCTAssertEqual(
            transpose.value as? String,
            sourceTranspose,
            "Locking must not transpose the source song"
        )

        lock.tap()
        XCTAssertTrue(waitForValue(lock, "Off", timeout: 5))
        XCTAssertEqual(key.label, sourceKeyLabel, "Unlocking must restore the source key label")
        XCTAssertFalse(app.alerts["Audio"].exists)
    }

    // MARK: - F034 blend

    func testMelodyChordMixKnobAdjustsEndpointsAndResets()  {
        let app = launchReadyQuiz()
        let mix = app.descendants(matching: .any)["quiz.balance"]
        XCTAssertTrue(mix.waitForExistence(timeout: 10))
        XCTAssertEqual(mix.value as? String, "50 percent melody, 50 percent chords")
        XCTAssertTrue(invokeKnobAction(app, knob: "quiz.balance", action: "increase"))
        XCTAssertTrue(poll(timeout: 3) { (mix.value as? String) == "51 percent melody, 49 percent chords" })
        XCTAssertTrue(invokeKnobAction(app, knob: "quiz.balance", action: "reset"))
        XCTAssertTrue(poll(timeout: 3) { (mix.value as? String) == "50 percent melody, 50 percent chords" })
        XCTAssertFalse(app.alerts["Audio"].exists)
    }

    // MARK: - F043 practice dock

    func testFullChordOnlyPreviewsWhileMarkedRootStartsSingBack() {
        let app = launchReadyQuiz()
        let chord = app.buttons["quiz.chord.preview"]
        let root = app.buttons["quiz.root.preview"]
        let toggle = app.buttons["vocal.practice.expand"]
        let first = app.descendants(matching: .any)["vocal.practice.slot.1"].firstMatch
        XCTAssertTrue(chord.waitForExistence(timeout: 10))
        XCTAssertTrue(root.waitForExistence(timeout: 10))
        XCTAssertTrue(waitForEnabled(chord, timeout: 30))
        XCTAssertTrue(waitForEnabled(root, timeout: 30))

        chord.doubleTap()
        XCTAssertFalse(first.exists, "The full chord card must remain preview-only")
        chord.press(forDuration: 1.1)
        XCTAssertTrue(waitForValue(toggle, "Collapsed", timeout: 5))
        XCTAssertFalse(first.exists, "Long-pressing the full chord must not start persistent practice")

        root.doubleTap()
        XCTAssertTrue(first.waitForExistence(timeout: 5), "The marked root card must still offer sing-back")
        XCTAssertFalse(
            app.descendants(matching: .any)["vocal.practice.interval"].firstMatch.isEnabled,
            "The interval result requires two recorded notes"
        )
    }

    func testVocalPracticeDockStaysSingleFromLibraryThroughQuizAndOpens() {
        let app = launchReadyLibrary()
        let toggle = app.buttons["vocal.practice.expand"]
        let first = app.descendants(matching: .any)["vocal.practice.slot.1"].firstMatch
        let section = app.descendants(matching: .any)["quiz.section"]
        let mode = app.buttons["quiz.mode"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 10))
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "vocal.practice.dock").count, 1)
        XCTAssertFalse(first.exists)
        toggle.tap()
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        XCTAssertTrue(first.isHittable)
        XCTAssertTrue(app.descendants(matching: .any)["vocal.practice.slot.2"].firstMatch.isHittable)
        XCTAssertFalse(app.alerts.element.exists, "Expanding must not request microphone access")
        toggle.tap()

        let search = app.textFields["library.search.field"]
        search.tap()
        search.typeText("500 Miles")
        let song = app.buttons[Fixture.fiveHundredMiles]
        XCTAssertTrue(song.waitForExistence(timeout: 10))
        song.tap()
        XCTAssertTrue(app.navigationBars[Fixture.quizTitle].waitForExistence(timeout: 10))
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "vocal.practice.dock").count, 1)

        XCTAssertTrue(
            poll(timeout: 5) { section.exists && section.isEnabled && section.isHittable },
            "Quiz section selector must be ready before opening its native menu"
        )
        section.tap()
        let chorus = app.buttons["Chorus"]
        XCTAssertTrue(chorus.waitForExistence(timeout: 5))
        chorus.tap()
        XCTAssertTrue(waitForValue(section, "Chorus", timeout: 5))
        XCTAssertTrue(waitForEnabled(mode, timeout: 30))
        let selectedMode = mode.value as? String

        toggle.tap()
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        XCTAssertTrue(poll(timeout: 5) { !mode.exists && !section.exists },
                      "Mode and section must leave the layout while practice is expanded")
        XCTAssertTrue(app.buttons["quiz.play"].isHittable)
        XCTAssertFalse(app.alerts.element.exists, "Expanding must not request microphone access")
        let dock = app.descendants(matching: .any)["vocal.practice.dock"].firstMatch
        let firstRow = ["quiz.instrument", "quiz.transpose", "quiz.reset", "quiz.play"]
        for identifier in firstRow {
            let control = app.descendants(matching: .any)[identifier].firstMatch
            XCTAssertTrue(control.isHittable, "\(identifier) must stay reachable with practice expanded")
            // The dock container includes 8 pt of decorative top padding.
            XCTAssertLessThanOrEqual(control.frame.maxY, dock.frame.minY + 8 + 0.5,
                                     "\(identifier) must stay above the expanded singing dock content")
        }
        let footerTop = app.buttons["quiz.reset"].frame.minY
        for identifier in ["quiz.tempo", "quiz.arpeggio", "quiz.balance"] {
            let control = app.descendants(matching: .any)[identifier].firstMatch
            XCTAssertTrue(control.isHittable, "\(identifier) must stay reachable with practice expanded")
            XCTAssertLessThanOrEqual(control.frame.maxY, footerTop + 0.5,
                                     "\(identifier) must not overlap the transport row")
        }
        toggle.tap()
        XCTAssertFalse(first.exists)
        XCTAssertTrue(poll(timeout: 5) { mode.isHittable && section.isHittable },
                      "Mode and section must return when practice collapses")
        XCTAssertEqual(mode.value as? String, selectedMode, "Collapsing must preserve the selected mode")
        XCTAssertEqual(section.value as? String, "Chorus", "Collapsing must preserve the selected section")
        let transportTopRowBottom = firstRow
            .map { app.descendants(matching: .any)[$0].firstMatch.frame.maxY }
            .max()!
        for identifier in ["quiz.mode", "quiz.section"] {
            let control = app.descendants(matching: .any)[identifier].firstMatch
            XCTAssertGreaterThanOrEqual(control.frame.minY, transportTopRowBottom - 0.5,
                                        "\(identifier) must stay in the second transport row")
        }
        for row in [firstRow, ["quiz.mode", "quiz.section"]] {
            for (left, right) in zip(row, row.dropFirst()) {
                let leftControl = app.descendants(matching: .any)[left].firstMatch
                let rightControl = app.descendants(matching: .any)[right].firstMatch
                XCTAssertLessThanOrEqual(leftControl.frame.maxX, rightControl.frame.minX + 0.5,
                                         "\(left) must be left of \(right)")
                XCTAssertEqual(leftControl.frame.midY, rightControl.frame.midY, accuracy: 0.5,
                               "\(left) and \(right) must share a transport row")
            }
        }
        toggle.tap()
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        XCTAssertTrue(poll(timeout: 5) { !mode.exists && !section.exists })
        XCTAssertEqual(app.state, .runningForeground)
    }

    /// Uses the real simulator input callback; silence is valid and no pitch is required.
    func testMicrophoneCaptureAndFlipFlopDoNotCrash() {
        let app = launchReadyQuiz()
        // Reproduce the phone's playback-to-input transition, not only cold capture.
        let rootPreview = app.buttons["quiz.root.preview"]
        XCTAssertTrue(rootPreview.waitForExistence(timeout: 10))
        XCTAssertTrue(waitForEnabled(rootPreview, timeout: 30))
        rootPreview.tap()
        app.buttons["vocal.practice.expand"].tap()
        let first = app.descendants(matching: .any)["vocal.practice.slot.1"].firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        first.doubleTap()
        let stop = app.buttons["vocal.practice.stop"]
        XCTAssertTrue(stop.waitForExistence(timeout: 5), "Microphone action should begin")
        XCTAssertTrue(poll(timeout: 5) { (first.value as? String)?.contains("remaining") == true },
                      "Audio input must actually start, rather than immediately returning a permission or engine error")
        XCTAssertTrue(poll(timeout: 10) { app.state != .runningForeground || !stop.exists })
        XCTAssertEqual(app.state, .runningForeground, "First microphone callback must not crash")
        let second = app.descendants(matching: .any)["vocal.practice.slot.2"].firstMatch
        second.doubleTap()
        XCTAssertTrue(stop.waitForExistence(timeout: 5))
        XCTAssertTrue(poll(timeout: 10) { app.state != .runningForeground || !stop.exists })
        XCTAssertEqual(app.state, .runningForeground)
        let flipFlop = app.switches["vocal.practice.flipFlop"]
        flipFlop.tap()
        XCTAssertTrue(waitForValue(flipFlop, "1", timeout: 5), "The switch itself must turn on")
        XCTAssertTrue(stop.waitForExistence(timeout: 5))
        XCTAssertFalse(first.isEnabled, "Flip-Flop disables the first individual pitch card")
        XCTAssertFalse(second.isEnabled, "Flip-Flop disables the second individual pitch card")
        let survived = expectation(description: "Survive both Flip-Flop capture windows")
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { survived.fulfill() }
        wait(for: [survived], timeout: 12)
        XCTAssertEqual(app.state, .runningForeground)
        XCTAssertTrue(stop.isHittable)
        stop.tap()
        XCTAssertTrue(poll(timeout: 5) { !stop.exists })
        XCTAssertTrue(first.isEnabled, "Stopping Flip-Flop re-enables the first pitch card")
        XCTAssertTrue(second.isEnabled, "Stopping Flip-Flop re-enables the second pitch card")
        XCTAssertEqual(app.state, .runningForeground)
    }

    func testDoubleTapOpensOnlyIntervalToolAndCollapseClearsTargets() {
        let app = launchReadyQuiz()
        let root = app.buttons["quiz.root.preview"]
        XCTAssertTrue(root.waitForExistence(timeout: 10))
        XCTAssertTrue(waitForEnabled(root, timeout: 30))
        root.doubleTap()
        let toggle = app.buttons["vocal.practice.expand"]
        let first = app.buttons["vocal.practice.slot.1"]
        let section = app.descendants(matching: .any)["quiz.section"]
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        XCTAssertTrue(waitForValue(toggle, "Expanded", timeout: 5))
        XCTAssertEqual(app.buttons.matching(identifier: "vocal.practice.expand").count, 1)
        XCTAssertFalse(app.navigationBars["Sing back"].exists)
        XCTAssertFalse(app.navigationBars["Vocal practice"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["vocal.practice.panel"].exists)
        XCTAssertTrue(
            poll(timeout: 5) { section.exists && section.isEnabled && section.isHittable },
            "Quiz section selector must be ready before opening its native menu"
        )

        toggle.tap()
        XCTAssertTrue(waitForValue(toggle, "Collapsed", timeout: 5))
        XCTAssertFalse(first.exists)
        XCTAssertFalse(app.buttons["vocal.practice.stop"].exists)
        toggle.tap()
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        XCTAssertTrue(
            poll(timeout: 5) { (first.value as? String ?? "No pitch").hasPrefix("No pitch") },
            "Rapid reopening must finalize the cleared target"
        )

        root.doubleTap()
        XCTAssertTrue(
            poll(timeout: 5) { !(first.value as? String ?? "No pitch").hasPrefix("No pitch") },
            "Double-tapping the root must load a target before changing sections"
        )
        XCTAssertTrue(
            poll(timeout: 5) { section.exists && section.isEnabled && section.isHittable },
            "Quiz section selector must be ready before opening its native menu"
        )
        section.tap()
        let chorus = app.buttons["Chorus"]
        XCTAssertTrue(chorus.waitForExistence(timeout: 5))
        chorus.tap()
        XCTAssertTrue(waitForValue(section, "Chorus", timeout: 5))
        XCTAssertTrue(
            poll(timeout: 5) { (first.value as? String ?? "No pitch").hasPrefix("No pitch") },
            "Changing sections must clear the loaded target"
        )

        root.doubleTap()
        XCTAssertTrue(
            poll(timeout: 5) { !(first.value as? String ?? "No pitch").hasPrefix("No pitch") },
            "Double-tapping the root must load a target before backgrounding"
        )
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(waitForValue(toggle, "Collapsed", timeout: 5))
        toggle.tap()
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        XCTAssertTrue(
            poll(timeout: 5) { (first.value as? String ?? "No pitch").hasPrefix("No pitch") },
            "Backgrounding must clear the loaded target"
        )
        // Song information must use the same tool, with no hidden sheet presenter.
        app.buttons["quiz.info"].tap()
        XCTAssertTrue(toggle.waitForExistence(timeout: 10))
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "vocal.practice.dock").count, 1)
        XCTAssertEqual(app.buttons.matching(identifier: "vocal.practice.expand").count, 1)
        XCTAssertFalse(app.navigationBars["Sing back"].exists)
        if toggle.value as? String == "Expanded" { toggle.tap() }
        XCTAssertTrue(waitForValue(toggle, "Collapsed", timeout: 5))
    }

    // MARK: - F054 layout under the device's current Dynamic Type setting

    /// Quiz must stay one screen: every primary control on screen, nothing
    /// clipped off the bottom, and the practice dock still reachable. The
    /// harness runs this at whatever content size the device is set to, so the
    /// same case documents both the default and an accessibility size.
    func testQuizStaysOneScreenWithNoClippedControls() {
        let app = launchReadyQuiz()
        let screen = app.frame
        let identifiers = [
            "quiz.key",
            "quiz.timeline",
            "quiz.chordTimeline",
            "quiz.cards",
            "quiz.balance",
            "quiz.tempo",
            "quiz.arpeggio",
            "quiz.instrument",
            "quiz.transpose",
            "quiz.mode",
            "quiz.section",
            "quiz.play",
            "vocal.practice.dock"
        ]
        var offScreen: [String] = []
        for identifier in identifiers {
            // Some Quiz identifiers (quiz.cards) legitimately mark several rows.
            let matches = app.descendants(matching: .any).matching(identifier: identifier)
            guard matches.firstMatch.waitForExistence(timeout: 5) else {
                offScreen.append("\(identifier): missing")
                continue
            }
            for index in 0..<matches.count {
                let frame = matches.element(boundBy: index).frame
                if frame.maxY > screen.maxY + 0.5 || frame.minY < screen.minY - 0.5
                    || frame.maxX > screen.maxX + 0.5 || frame.minX < screen.minX - 0.5 {
                    offScreen.append("\(identifier)[\(index)]: \(frame) outside \(screen)")
                }
            }
        }
        XCTAssertTrue(
            offScreen.isEmpty,
            "Quiz content left the single screen: \(offScreen.joined(separator: "; "))"
        )
        XCTAssertFalse(app.scrollViews.firstMatch.exists, "Quiz must not become a scrolling page")
        let footerTop = ["quiz.reset", "quiz.section", "quiz.play"].map {
            app.descendants(matching: .any)[$0].frame.minY
        }.min() ?? screen.maxY
        for identifier in ["quiz.tempo", "quiz.arpeggio", "quiz.balance"] {
            let frame = app.descendants(matching: .any)[identifier].frame
            XCTAssertLessThanOrEqual(
                frame.maxY, footerTop + 0.5,
                "\(identifier) at \(frame) overlaps the footer starting at \(footerTop)"
            )
        }
        let openPractice = app.buttons.matching(identifier: "vocal.practice.expand").firstMatch
        let openPracticeByLabel = app.buttons
            .matching(NSPredicate(format: "label == %@", "vocal.practice.expand")).firstMatch
        XCTAssertTrue(
            (openPractice.exists && openPractice.isHittable)
                || (openPracticeByLabel.exists && openPracticeByLabel.isHittable),
            "The practice dock must stay reachable"
        )
    }

    // MARK: - F050 / F051 favorites and playlists

    /// One favourite toggled from Quiz must appear as durable membership in the
    /// Library's Favorites playlist, open from there, and be removable again.
    func testFavoriteToggleFlowsThroughToTheFavoritesPlaylist() {
        let app = launchReadyQuiz()
        let star = app.buttons["song.favorite"]
        XCTAssertTrue(star.waitForExistence(timeout: 10))
        XCTAssertEqual(star.value as? String, "Not favorite")
        star.tap()
        XCTAssertTrue(waitForValue(star, "Favorite", timeout: 5), "The star must reflect membership")

        // Quiz returns directly to its source in one Back action.
        let searchField = app.textFields["library.search.field"]
        app.navigationBars.buttons["BackButton"].firstMatch.tap()
        XCTAssertTrue(searchField.waitForExistence(timeout: 10), "Back from Quiz must return to Library")

        // Playlists is a collapsed accordion on Library; open it first.
        let playlistsHeader = app.descendants(matching: .any)["playlists.header"]
        XCTAssertTrue(playlistsHeader.waitForExistence(timeout: 5))
        // The search field may still hold keyboard focus; the first tap can be
        // consumed dismissing it, so retry until the accordion actually opens.
        for _ in 0..<3 where (playlistsHeader.value as? String) == "Collapsed" {
            playlistsHeader.tap()
            _ = poll(timeout: 2) { (playlistsHeader.value as? String) == "Expanded" }
        }
        XCTAssertEqual(playlistsHeader.value as? String, "Expanded", "Playlists accordion did not open")
        let favorites = app.descendants(matching: .any)["playlist.favorites"]
        for _ in 0..<6 where !favorites.exists {
            app.swipeUp()
            _ = favorites.waitForExistence(timeout: 0.5)
        }
        if !favorites.waitForExistence(timeout: 5) {
            print("DIAGNOSTIC-LIBRARY-BEGIN\n\(app.debugDescription)\nDIAGNOSTIC-LIBRARY-END")
        }
        XCTAssertTrue(favorites.exists, "Library must list the Favorites playlist")
        XCTAssertTrue(
            poll(timeout: 5) { (favorites.value as? String) == "1 songs" },
            "Favorites count must follow the toggle. Value: \(String(describing: favorites.value))"
        )

        let entry = app.descendants(matching: .any)["playlist.song.the-proclaimers__500-miles"]
        let openFavorites = app.descendants(matching: .any)["playlist.open.favorites"]
        // The centre is blank space between the title/count. One tap must work.
        favorites.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        _ = poll(timeout: 5) { entry.exists && openFavorites.exists }
        XCTAssertTrue(
            entry.exists || openFavorites.exists,
            "Expanding Favorites must reveal its contents"
        )
        XCTAssertTrue(entry.exists, "The favourited song must be listed in Favorites")

        openFavorites.tap()
        let playlistSong = app.buttons[Fixture.fiveHundredMiles]
        XCTAssertTrue(playlistSong.waitForExistence(timeout: 10))
        playlistSong.tap()
        XCTAssertTrue(app.buttons["quiz.info"].waitForExistence(timeout: 10))
        app.navigationBars.buttons["BackButton"].firstMatch.tap()
        XCTAssertTrue(playlistSong.waitForExistence(timeout: 10), "Quiz Back must return directly to Favorites")
        XCTAssertFalse(app.navigationBars["Song"].exists)
        app.navigationBars.buttons["BackButton"].firstMatch.tap()
        XCTAssertTrue(entry.waitForExistence(timeout: 10))

        // Remove through the named accessibility action rather than a raw swipe.
        if entry.exists {
            entry.swipeLeft()
            let remove = app.buttons["Remove"]
            if remove.waitForExistence(timeout: 3) { remove.tap() }
        }
        XCTAssertTrue(
            poll(timeout: 5) { (favorites.value as? String) == "0 songs" },
            "Removing the only entry must empty Favorites. Value: \(String(describing: favorites.value))"
        )
    }

    // MARK: - Helpers

    private func invokeKnobAction(_ app: XCUIApplication, knob: String, action: String) -> Bool {
        let element = app.descendants(matching: .any)[knob]
        guard element.waitForExistence(timeout: 5) else { return false }
        element.press(forDuration: 1.1)
        let button = app.buttons["\(knob).\(action)"]
        guard button.waitForExistence(timeout: 5) else {
            // Dismiss whatever the long press produced so the next step is clean.
            app.tap()
            return false
        }
        button.tap()
        return true
    }

    private func launchReadyQuiz(
        previewFonts: Bool = false,
        file: StaticString = #filePath,
        line: UInt = #line
    ) -> XCUIApplication {
        let app = launchReadyLibrary(previewFonts: previewFonts, file: file, line: line)
        let search = app.textFields["library.search.field"]
        search.tap()
        search.typeText("500 Miles")
        let song = app.buttons[Fixture.fiveHundredMiles]
        XCTAssertTrue(song.waitForExistence(timeout: 10), file: file, line: line)
        song.tap()
        XCTAssertTrue(
            app.navigationBars[Fixture.quizTitle].waitForExistence(timeout: 10),
            file: file,
            line: line
        )
        return app
    }

    private func launchReadyLibrary(
        previewFonts: Bool = false,
        file: StaticString = #filePath,
        line: UInt = #line
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--ui-testing-scenario=library.ready"]
        if previewFonts { app.launchArguments.append("--preview-notation-fonts") }
        app.launchEnvironment["ACQUIRING_UI_TEST_SESSION_ID"] = UUID().uuidString
        app.launch()
        let search = app.textFields["library.search.field"]
        XCTAssertTrue(search.waitForExistence(timeout: 15), file: file, line: line)
        return app
    }

    private func poll(timeout: TimeInterval, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            Thread.sleep(forTimeInterval: 0.15)
        }
        return condition()
    }

    private func waitForValue(_ element: XCUIElement, _ value: String, timeout: TimeInterval) -> Bool {
        poll(timeout: timeout) { element.exists && (element.value as? String) == value }
    }

    private func waitForLabel(_ element: XCUIElement, _ label: String, timeout: TimeInterval) -> Bool {
        poll(timeout: timeout) { element.exists && element.label == label }
    }

    private func waitForEnabled(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        poll(timeout: timeout) { element.exists && element.isEnabled }
    }
}

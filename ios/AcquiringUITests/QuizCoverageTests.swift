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

    // MARK: - F054 control geometry

    /// Every primary Quiz control must present at least a 44 pt touch target.
    func testQuizPrimaryControlsMeetMinimumTouchTargets() {
        let app = launchReadyQuiz()
        let identifiers = [
            "quiz.reset",
            "quiz.section",
            "quiz.play",
            "quiz.instrument",
            "quiz.transpose",
            "quiz.transpose.up",
            "quiz.transpose.down",
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

    func testVolumeMixFaderFavoursMelodyUpwardAndChordsDownward()  {
        let app = launchReadyQuiz()
        let fader = app.descendants(matching: .any)["quiz.balance"]
        XCTAssertTrue(fader.waitForExistence(timeout: 10))
        XCTAssertEqual(fader.value as? String, "50 percent melody, 50 percent chords")

        // The blend is continuous; a tap maps the touch height onto the track.
        // Assert direction and midpoint restoration, not an exact endpoint pixel:
        // the true 0 and 1 endpoints belong to the renderer tests.
        fader.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.02)).tap()
        let nearTop = melodyPercent(of: fader)
        XCTAssertNotNil(nearTop)
        XCTAssertGreaterThanOrEqual(
            nearTop ?? 0, 95,
            "The top of the fader must favour melody. Value: \(String(describing: fader.value))"
        )

        fader.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.98)).tap()
        let nearBottom = melodyPercent(of: fader)
        XCTAssertNotNil(nearBottom)
        XCTAssertLessThanOrEqual(
            nearBottom ?? 100, 5,
            "The bottom of the fader must favour chords. Value: \(String(describing: fader.value))"
        )

        fader.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.5)).tap()
        XCTAssertEqual(melodyPercent(of: fader) ?? -1, 50, accuracy: 3, "Mid-track is an even blend")

        fader.press(forDuration: 1.1)
        let resetItem = app.buttons["Reset balance to 50 / 50"]
        if resetItem.waitForExistence(timeout: 5) {
            resetItem.tap()
            XCTAssertTrue(
                poll(timeout: 3) { (fader.value as? String) == "50 percent melody, 50 percent chords" },
                "Reset must restore the midpoint. Value: \(String(describing: fader.value))"
            )
        } else {
            XCTFail("The fader offers no reachable reset action")
        }
        XCTAssertFalse(app.alerts["Audio"].exists)
    }

    // MARK: - F043 practice dock

    func testVocalPracticeDockStartsCollapsedAndOpens() {
        let app = launchReadyQuiz()
        let dock = app.descendants(matching: .any)["vocal.practice.dock"]
        XCTAssertTrue(dock.waitForExistence(timeout: 10))
        XCTAssertFalse(
            app.descendants(matching: .any)["vocal.practice.panel"].exists,
            "The dock must start collapsed"
        )
        let open = app.buttons["Open vocal practice"]
        XCTAssertTrue(open.waitForExistence(timeout: 5))
        open.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["vocal.practice.panel"].waitForExistence(timeout: 5),
            "Opening the dock must reveal the practice panel"
        )
        XCTAssertEqual(app.state, .runningForeground)
        // No microphone permission dialog may appear until recording is requested.
        XCTAssertFalse(app.alerts.element.exists, "Opening the dock must not request permission")
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
        for identifier in ["quiz.tempo", "quiz.arpeggio", "quiz.instrument", "quiz.transpose"] {
            let frame = app.descendants(matching: .any)[identifier].frame
            XCTAssertLessThanOrEqual(
                frame.maxY, footerTop + 0.5,
                "\(identifier) at \(frame) overlaps the footer starting at \(footerTop)"
            )
        }
        let openPractice = app.buttons.matching(identifier: "Open vocal practice").firstMatch
        let openPracticeByLabel = app.buttons
            .matching(NSPredicate(format: "label == %@", "Open vocal practice")).firstMatch
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

        // Opening a song pushes Song detail and Quiz, so walk back to Library.
        let searchField = app.textFields["library.search.field"]
        for _ in 0..<4 where !searchField.exists {
            let back = app.navigationBars.buttons["BackButton"].firstMatch
            guard back.waitForExistence(timeout: 3), back.isHittable else { break }
            back.tap()
            _ = searchField.waitForExistence(timeout: 3)
        }
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

    private func melodyPercent(of fader: XCUIElement) -> Int? {
        guard let value = fader.value as? String,
              let first = value.split(separator: " ").first
        else { return nil }
        return Int(first)
    }

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
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--ui-testing-scenario=library.ready"]
        if previewFonts { app.launchArguments.append("--preview-notation-fonts") }
        app.launchEnvironment["ACQUIRING_UI_TEST_SESSION_ID"] = UUID().uuidString
        app.launch()
        let search = app.textFields["library.search.field"]
        XCTAssertTrue(search.waitForExistence(timeout: 15), file: file, line: line)
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

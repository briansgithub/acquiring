import Foundation
import XCTest

/// Focused, text-only diagnostics added for the autonomous parity run.
/// Each case isolates one production behaviour so a failure distinguishes
/// tap delivery from configuration acceptance from rendered output.
@MainActor
final class AutonomousDiagnosticsTests: XCTestCase {
    private enum Fixture {
        static let fiveHundredMiles = "500 Miles, by the-proclaimers"
        static let quizTitle = "500 Miles by the-proclaimers"
    }

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    // MARK: - F031 Transpose

    /// Baseline: an ordinary +1 tap while paused, with no menu interaction first.
    func testTransposeUpWhilePausedWithoutAnyMenuInteraction() {
        let app = launchReadyQuiz()
        let transpose = app.buttons["quiz.transpose"]
        XCTAssertTrue(transpose.waitForExistence(timeout: 10))
        XCTAssertEqual(transpose.value as? String, "0 semitones")

        let up = app.buttons["quiz.transpose.up"]
        XCTAssertTrue(waitForHittable(up, timeout: 10))
        // Tap the padded corner, not the glyph: the entire 44 pt label must act.
        up.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.15)).tap()

        XCTAssertTrue(
            waitForValue(transpose, "+1 semitones", timeout: 5),
            "Paused +1 tap did not change the displayed value. Observed: \(String(describing: transpose.value))"
        )
        XCTAssertFalse(app.alerts["Audio"].exists, "Configuration was rejected rather than undelivered")
    }

    /// The full -12 / 0 / +12 range, reset-by-value-tap, and no accumulation.
    func testTransposeBoundsResetAndRepeatedChangesWhilePaused() {
        let app = launchReadyQuiz()
        let transpose = app.buttons["quiz.transpose"]
        XCTAssertTrue(transpose.waitForExistence(timeout: 10))
        let up = app.buttons["quiz.transpose.up"]
        let down = app.buttons["quiz.transpose.down"]
        XCTAssertTrue(waitForHittable(up, timeout: 10))

        for step in 1...12 {
            up.tap()
            XCTAssertTrue(
                waitForValue(transpose, "+\(step) semitones", timeout: 3),
                "Stopped advancing at +\(step); observed \(String(describing: transpose.value))"
            )
        }
        XCTAssertFalse(up.isEnabled, "+12 is the upper bound")

        transpose.tap()
        XCTAssertTrue(waitForValue(transpose, "0 semitones", timeout: 3), "Value tap must reset to zero")

        for step in 1...12 {
            down.tap()
            XCTAssertTrue(
                waitForValue(transpose, "-\(step) semitones", timeout: 3),
                "Stopped descending at -\(step); observed \(String(describing: transpose.value))"
            )
        }
        XCTAssertFalse(down.isEnabled, "-12 is the lower bound")

        transpose.tap()
        XCTAssertTrue(waitForValue(transpose, "0 semitones", timeout: 3))
        XCTAssertFalse(app.alerts["Audio"].exists)
    }

    /// Same ordinary tap, but while the transport is playing.
    func testTransposeUpWhilePlaying() {
        let app = launchReadyQuiz()
        let play = app.buttons["quiz.play"]
        XCTAssertTrue(play.waitForExistence(timeout: 10))
        XCTAssertTrue(waitForEnabled(play, timeout: 30))
        play.tap()
        XCTAssertTrue(waitForLabel(play, "Pause", timeout: 30), "Transport never started")

        let transpose = app.buttons["quiz.transpose"]
        let up = app.buttons["quiz.transpose.up"]
        XCTAssertTrue(waitForHittable(up, timeout: 10))
        up.tap()
        XCTAssertTrue(
            waitForValue(transpose, "+1 semitones", timeout: 5),
            "Playing +1 tap did not change the displayed value. Observed: \(String(describing: transpose.value))"
        )
        XCTAssertEqual(play.label, "Pause", "Transpose must not stop playback")
        XCTAssertFalse(app.alerts["Audio"].exists)
    }

    /// The reported regression shape: a transpose tap immediately after a native
    /// selector menu closes. Retries the tap once to separate a swallowed first
    /// tap (dismissal overlay) from a rejected configuration.
    func testTransposeImmediatelyAfterInstrumentMenuSelection() {
        let app = launchReadyQuiz()
        let instrument = app.descendants(matching: .any)["quiz.instrument"]
        XCTAssertTrue(instrument.waitForExistence(timeout: 10))
        instrument.tap()
        let sine = app.buttons["Sine"]
        XCTAssertTrue(sine.waitForExistence(timeout: 5))
        sine.tap()
        XCTAssertTrue(waitForValue(instrument, "Sine", timeout: 5))

        let transpose = app.buttons["quiz.transpose"]
        let up = app.buttons["quiz.transpose.up"]
        XCTAssertTrue(waitForHittable(up, timeout: 10))
        up.tap()
        let appliedOnFirstTap = waitForValue(transpose, "+1 semitones", timeout: 5)
        if !appliedOnFirstTap {
            XCTAssertFalse(
                app.alerts["Audio"].exists,
                "First tap after the menu was rejected by the app, not swallowed"
            )
            up.tap()
            let appliedOnSecondTap = waitForValue(transpose, "+1 semitones", timeout: 5)
            XCTAssertTrue(
                appliedOnSecondTap,
                "Neither tap after the instrument menu reached transpose. Observed: \(String(describing: transpose.value))"
            )
            XCTFail(
                "DIAGNOSTIC: the first transpose tap after a native menu selection is not delivered; a retry works."
            )
        }
    }

    /// The same shape after a section menu selection.
    func testTransposeImmediatelyAfterSectionMenuSelection() {
        let app = launchReadyQuiz()
        let section = app.descendants(matching: .any)["quiz.section"]
        XCTAssertTrue(section.waitForExistence(timeout: 10))
        section.tap()
        let chorus = app.buttons["Chorus"]
        XCTAssertTrue(chorus.waitForExistence(timeout: 5))
        chorus.tap()
        XCTAssertTrue(waitForValue(section, "Chorus", timeout: 5))

        let transpose = app.buttons["quiz.transpose"]
        let up = app.buttons["quiz.transpose.up"]
        XCTAssertTrue(waitForHittable(up, timeout: 10))
        up.tap()
        let appliedOnFirstTap = waitForValue(transpose, "+1 semitones", timeout: 5)
        if !appliedOnFirstTap {
            up.tap()
            XCTAssertTrue(
                waitForValue(transpose, "+1 semitones", timeout: 5),
                "Neither tap after the section menu reached transpose. Observed: \(String(describing: transpose.value))"
            )
            XCTFail(
                "DIAGNOSTIC: the first transpose tap after a native section menu selection is not delivered; a retry works."
            )
        }
    }

    /// Second-cycle diagnostic: reports what the transpose element actually is and
    /// which delivery mechanism, if any, reaches its action.
    func testTransposeTapDeliveryMechanisms() {
        let app = launchReadyQuiz()
        let transpose = app.buttons["quiz.transpose"]
        XCTAssertTrue(transpose.waitForExistence(timeout: 10))
        let up = app.buttons["quiz.transpose.up"]
        XCTAssertTrue(waitForHittable(up, timeout: 10))

        print("DIAGNOSTIC-TRANSPOSE-BEGIN")
        print("up: exists=\(up.exists) enabled=\(up.isEnabled) hittable=\(up.isHittable) frame=\(up.frame) label=\(up.label) value=\(String(describing: up.value))")
        print("value element: enabled=\(transpose.isEnabled) hittable=\(transpose.isHittable) frame=\(transpose.frame) value=\(String(describing: transpose.value))")
        print("matching identifier count: \(app.descendants(matching: .any).matching(identifier: "quiz.transpose.up").count)")
        print(app.descendants(matching: .any)["quiz.cards"].exists ? "cards present" : "cards missing")
        print("DIAGNOSTIC-TRANSPOSE-TREE\n\(app.debugDescription)")
        print("DIAGNOSTIC-TRANSPOSE-END")

        var reached: [String] = []

        up.tap()
        if waitForValue(transpose, "+1 semitones", timeout: 3) { reached.append("XCUIElement.tap") }

        if reached.isEmpty {
            up.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            if waitForValue(transpose, "+1 semitones", timeout: 3) { reached.append("coordinate center tap") }
        }
        if reached.isEmpty {
            up.press(forDuration: 0.08)
            if waitForValue(transpose, "+1 semitones", timeout: 3) { reached.append("press 80ms") }
        }
        if reached.isEmpty {
            // Does any control in the same disabled container still work?
            let instrument = app.descendants(matching: .any)["quiz.instrument"]
            instrument.tap()
            let sine = app.buttons["Sine"]
            if sine.waitForExistence(timeout: 3) {
                sine.tap()
                if waitForValue(instrument, "Sine", timeout: 3) {
                    reached.append("sibling instrument menu works")
                }
            }
        }
        if reached.isEmpty {
            // The named accessibility action path, bypassing hit testing geometry.
            let reset = app.buttons["quiz.transpose"]
            reset.tap()
            reached.append("value-tap result: \(String(describing: transpose.value))")
        }

        XCTFail("DIAGNOSTIC transpose delivery outcomes: \(reached); final value \(String(describing: transpose.value))")
    }

    // MARK: - F012 / F001 catalog retry identity

    /// The settings failure retry must be addressable, not shadowed by its
    /// container's accessibility identifier.
    func testCatalogSettingsRetryIsAddressableByIdentifierAndLabel() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--ui-testing-scenario=library.failureThenReady"]
        app.launchEnvironment["ACQUIRING_UI_TEST_SESSION_ID"] = UUID().uuidString
        app.launch()

        XCTAssertTrue(app.navigationBars["Library"].waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.descendants(matching: .any)["catalog.status.failure"].waitForExistence(timeout: 10)
        )
        let settings = app.buttons["catalog.settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["catalog.settings.screen"].waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.buttons["app.checkForUpdates"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["settings.timelineFrameRate"].exists)

        let byIdentifier = app.buttons["catalog.retry"]
        let byLabel = app.buttons["Try Again"]
        let identifierFound = byIdentifier.waitForExistence(timeout: 5)
        let labelFound = byLabel.waitForExistence(timeout: 5)
        if !identifierFound {
            print("DIAGNOSTIC-TREE-BEGIN\n\(app.debugDescription)\nDIAGNOSTIC-TREE-END")
        }
        XCTAssertTrue(
            labelFound,
            "The retry action is missing entirely from the settings failure state"
        )
        XCTAssertTrue(
            identifierFound,
            "DIAGNOSTIC: the retry button exists but its accessibility identifier is shadowed by its container"
        )
        if identifierFound {
            byIdentifier.tap()
            XCTAssertTrue(
                app.descendants(matching: .any)["catalog.settings.status.ready"].waitForExistence(timeout: 10),
                "Retry must recover the catalog, not merely expose an identifier"
            )
        }
    }

    // MARK: - Helpers

    private func launchReadyQuiz(
        file: StaticString = #filePath,
        line: UInt = #line
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--ui-testing-scenario=library.ready"]
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

    private func waitForHittable(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        poll(timeout: timeout) { element.exists && element.isHittable }
    }
}

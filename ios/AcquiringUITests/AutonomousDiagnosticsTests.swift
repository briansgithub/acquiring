import Foundation
import XCTest

/// Focused, text-only diagnostics added for the autonomous parity run.
/// Each case isolates one production behaviour so a failure distinguishes
/// tap delivery from configuration acceptance from rendered output.
@MainActor
final class AutonomousDiagnosticsTests: XCTestCase {
    private enum Fixture {
        static let fiveHundredMiles = "500 Miles, by The Proclaimers"
        static let quizTitle = "500 Miles by The Proclaimers"
    }

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    // MARK: - F031 Transpose

    /// A compact native menu can apply a semitone while paused.
    func testTransposeMenuAppliesValueWhilePaused() {
        let app = launchReadyQuiz()
        let transpose = app.buttons["quiz.transpose"]
        XCTAssertTrue(transpose.waitForExistence(timeout: 10))
        XCTAssertEqual(transpose.value as? String, "0 semitones")

        selectTranspose("+1 semitones", from: transpose, in: app)

        XCTAssertTrue(
            waitForValue(transpose, "+1 semitones", timeout: 5),
            "Paused +1 tap did not change the displayed value. Observed: \(String(describing: transpose.value))"
        )
        XCTAssertFalse(app.alerts["Audio"].exists, "Configuration was rejected rather than undelivered")
    }

    /// The menu exposes the full -12 / 0 / +12 range.
    func testTransposeMenuExposesBoundsAndOriginalKeyWhilePaused() {
        let app = launchReadyQuiz()
        let transpose = app.buttons["quiz.transpose"]
        XCTAssertTrue(transpose.waitForExistence(timeout: 10))
        selectTranspose("+12 semitones", from: transpose, in: app)
        XCTAssertTrue(waitForValue(transpose, "+12 semitones", timeout: 3))
        selectTranspose("0 semitones", from: transpose, in: app)
        XCTAssertTrue(waitForValue(transpose, "0 semitones", timeout: 3))
        selectTranspose("-12 semitones", from: transpose, in: app)
        XCTAssertTrue(waitForValue(transpose, "-12 semitones", timeout: 3))
        selectTranspose("0 semitones", from: transpose, in: app)
        XCTAssertTrue(waitForValue(transpose, "0 semitones", timeout: 3))
        XCTAssertFalse(app.alerts["Audio"].exists)
    }

    /// The menu keeps playback running while it commits a selection.
    func testTransposeMenuAppliesValueWhilePlaying() {
        let app = launchReadyQuiz()
        let play = app.buttons["quiz.play"]
        XCTAssertTrue(play.waitForExistence(timeout: 10))
        XCTAssertTrue(waitForEnabled(play, timeout: 30))
        play.tap()
        XCTAssertTrue(waitForLabel(play, "Pause", timeout: 30), "Transport never started")

        let transpose = app.buttons["quiz.transpose"]
        XCTAssertTrue(waitForHittable(transpose, timeout: 10))
        selectTranspose("+1 semitones", from: transpose, in: app)
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
        XCTAssertTrue(waitForHittable(transpose, timeout: 10))
        selectTranspose("+1 semitones", from: transpose, in: app)
        let appliedOnFirstTap = waitForValue(transpose, "+1 semitones", timeout: 5)
        if !appliedOnFirstTap {
            XCTAssertFalse(
                app.alerts["Audio"].exists,
                "First tap after the menu was rejected by the app, not swallowed"
            )
            selectTranspose("+1 semitones", from: transpose, in: app)
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
        XCTAssertTrue(waitForHittable(transpose, timeout: 10))
        selectTranspose("+1 semitones", from: transpose, in: app)
        let appliedOnFirstTap = waitForValue(transpose, "+1 semitones", timeout: 5)
        if !appliedOnFirstTap {
            selectTranspose("+1 semitones", from: transpose, in: app)
            XCTAssertTrue(
                waitForValue(transpose, "+1 semitones", timeout: 5),
                "Neither tap after the section menu reached transpose. Observed: \(String(describing: transpose.value))"
            )
            XCTFail(
                "DIAGNOSTIC: the first transpose tap after a native section menu selection is not delivered; a retry works."
            )
        }
    }

    func testTransposeMenuIsReachableByAccessibilityIdentifier() {
        let app = launchReadyQuiz()
        let transpose = app.buttons["quiz.transpose"]
        XCTAssertTrue(transpose.waitForExistence(timeout: 10))
        XCTAssertTrue(waitForHittable(transpose, timeout: 10))
        selectTranspose("+1 semitones", from: transpose, in: app)
        XCTAssertTrue(waitForValue(transpose, "+1 semitones", timeout: 5))
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

    private func selectTranspose(_ title: String, from transpose: XCUIElement, in app: XCUIApplication) {
        transpose.tap()
        let choice = app.buttons[title]
        XCTAssertTrue(choice.waitForExistence(timeout: 5), "Transpose option \(title) is missing")
        choice.tap()
    }
}

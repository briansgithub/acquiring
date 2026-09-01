import XCTest

@MainActor
final class AcquiringUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testAppLaunches() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()

        XCTAssertTrue(app.navigationBars["Library"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["All Songs"].waitForExistence(timeout: 5))
    }

    func testAllSongsToQuizInfoAndParentRestoresNavigation() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()

        XCTAssertTrue(app.buttons["All Songs"].waitForExistence(timeout: 5))
        app.buttons["All Songs"].tap()
        XCTAssertTrue(app.navigationBars["All Songs"].waitForExistence(timeout: 5))
        app.buttons["S, 2"].tap()
        app.buttons["Seed Song, by Sample Artist"].tap()
        XCTAssertTrue(app.navigationBars["Quiz"].waitForExistence(timeout: 5))
        app.navigationBars["Quiz"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Seed Song"].waitForExistence(timeout: 5))
        app.navigationBars["Seed Song"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["All Songs"].waitForExistence(timeout: 5))
    }
}

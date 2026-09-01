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

    func testCatalogUpdateFailurePreservesReadyCatalogAndOffersRetry() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--ui-testing-catalog-install-failure"]
        app.launch()

        let readyStatus = app.descendants(matching: .any)["catalog.status.ready"]
        XCTAssertTrue(readyStatus.waitForExistence(timeout: 5))

        app.buttons["catalog.download"].tap()

        let maintenanceStatus = app.descendants(matching: .any)["catalog.maintenance.status"]
        XCTAssertTrue(maintenanceStatus.waitForExistence(timeout: 5))
        XCTAssertTrue(maintenanceStatus.label.contains("test catalog update failed"))
        XCTAssertTrue(readyStatus.exists)
        XCTAssertTrue(app.buttons["catalog.retry"].exists)
    }

    func testCatalogUpdateCanBeCancelledWithoutHidingReadyCatalog() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--ui-testing-catalog-install-cancellable"]
        app.launch()

        let readyStatus = app.descendants(matching: .any)["catalog.status.ready"]
        XCTAssertTrue(readyStatus.waitForExistence(timeout: 5))

        let downloadButton = app.buttons["catalog.download"]
        downloadButton.tap()

        let cancelButton = app.buttons["catalog.cancel"]
        XCTAssertTrue(cancelButton.waitForExistence(timeout: 5))
        XCTAssertFalse(downloadButton.isEnabled)
        cancelButton.tap()

        let maintenanceStatus = app.descendants(matching: .any)["catalog.maintenance.status"]
        XCTAssertTrue(maintenanceStatus.waitForExistence(timeout: 5))
        XCTAssertTrue(maintenanceStatus.label.contains("cancelled"))
        XCTAssertTrue(readyStatus.exists)
        XCTAssertTrue(app.buttons["catalog.retry"].exists)
    }

    func testEmptyCatalogOffersOnePrimaryDownloadAction() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--ui-testing-catalog-empty"]
        app.launch()

        XCTAssertTrue(
            app.descendants(matching: .any)["catalog.status.empty"].waitForExistence(timeout: 5)
        )
        XCTAssertEqual(app.buttons.matching(identifier: "catalog.download").count, 1)
    }
}

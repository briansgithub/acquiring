@testable import AcquiringCatalog
import XCTest

final class CatalogCancellationTests: XCTestCase {
    func testCancellationAcceptedBeforeCommitPreventsCommit() async {
        let controller = CatalogOperationCancellationController()
        let id = controller.reserve()
        let task = Task {
            _ = try? await Task.sleep(for: .seconds(60))
        }
        controller.attach(task, to: id)

        XCTAssertEqual(controller.requestCancellation(for: id), .accepted)
        await task.value

        XCTAssertTrue(task.isCancelled)
        XCTAssertFalse(controller.beginCommit(id))
        controller.finish(id)
    }

    func testCommitBoundaryRejectsLateCancellation() async {
        let controller = CatalogOperationCancellationController()
        let id = controller.reserve()
        let task = Task<Void, Never> {}
        controller.attach(task, to: id)

        XCTAssertTrue(controller.beginCommit(id))
        XCTAssertEqual(controller.requestCancellation(for: id), .commitInProgress)
        XCTAssertFalse(task.isCancelled)

        await task.value
        controller.finish(id)
        XCTAssertEqual(controller.requestCancellation(for: id), .noOperation)
    }

    func testFinishLinearizesCancellationAgainstAProducerError() async {
        let controller = CatalogOperationCancellationController()
        let cancelledID = controller.reserve()
        let cancelledTask = Task<Void, Never> {}
        controller.attach(cancelledTask, to: cancelledID)

        XCTAssertEqual(controller.requestCancellation(for: cancelledID), .accepted)
        XCTAssertTrue(controller.finish(cancelledID))

        let failedID = controller.reserve()
        let failedTask = Task<Void, Never> {}
        controller.attach(failedTask, to: failedID)
        XCTAssertFalse(controller.finish(failedID))
        XCTAssertEqual(controller.requestCancellation(for: failedID), .noOperation)

        await cancelledTask.value
        await failedTask.value
    }
}

@testable import AcquiringAural
import Foundation
import XCTest

private final class FailingMoveFileManager: FileManager {
    private let failedMove: Int
    private var moveCount = 0

    init(failedMove: Int) {
        self.failedMove = failedMove
        super.init()
    }

    override func moveItem(at srcURL: URL, to dstURL: URL) throws {
        moveCount += 1
        if moveCount == failedMove {
            throw CocoaError(.fileWriteUnknown)
        }
        try super.moveItem(at: srcURL, to: dstURL)
    }
}

final class AuralBundleInstallerTests: XCTestCase {
    func testNextAttemptRestoresOriginalFilesAfterInterruptedInstall() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "aural-recovery-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let configuration = AuralBundleConfiguration(
            directoryURL: directory,
            manifestURL: URL(string: "https://example.invalid/catalog.json")!
        )
        for name in AuralBundleConfiguration.requiredFilenames {
            let destination = configuration.fileURL(name)
            try Data("old \(name)".utf8).write(to: destination)
            try FileManager.default.moveItem(
                at: destination,
                to: directory.appending(path: ".\(name).backup")
            )
        }
        try Data("partial new catalog".utf8).write(to: configuration.fileURL("aural-catalog.db"))

        let installer = AuralBundleInstaller(configuration: configuration)
        try await installer.prepareDirectory()
        for name in AuralBundleConfiguration.requiredFilenames {
            XCTAssertEqual(
                try String(contentsOf: configuration.fileURL(name), encoding: .utf8),
                "old \(name)"
            )
            XCTAssertFalse(FileManager.default.fileExists(
                atPath: directory.appending(path: ".\(name).backup").path
            ))
        }
    }

    func testInterruptedReplacementPreservesEveryPreviousFile() async throws {
        for failedMove in [2, 5] {
            let directory = FileManager.default.temporaryDirectory
                .appending(path: "aural-rollback-\(UUID().uuidString)", directoryHint: .isDirectory)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: directory) }

            let configuration = AuralBundleConfiguration(
                directoryURL: directory,
                manifestURL: URL(string: "https://example.invalid/catalog.json")!
            )
            var staged: [String: URL] = [:]
            for name in AuralBundleConfiguration.requiredFilenames {
                try Data("old \(name)".utf8).write(to: configuration.fileURL(name))
                let incoming = directory.appending(path: "\(name).staged")
                try Data("new \(name)".utf8).write(to: incoming)
                staged[name] = incoming
            }

            let installer = AuralBundleInstaller(
                configuration: configuration,
                fileManager: FailingMoveFileManager(failedMove: failedMove)
            )
            do {
                try await installer.install(staged)
                XCTFail("Move \(failedMove) should fail")
            } catch {
                for name in AuralBundleConfiguration.requiredFilenames {
                    let contents = try String(contentsOf: configuration.fileURL(name), encoding: .utf8)
                    XCTAssertEqual(contents, "old \(name)", "Move \(failedMove) lost \(name)")
                    XCTAssertFalse(FileManager.default.fileExists(
                        atPath: directory.appending(path: ".\(name).backup").path
                    ))
                }
            }
        }
    }
}

@testable import AcquiringAural
import CryptoKit
import Foundation
import GRDB
import XCTest
import zlib

private final class AuralFixtureURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "fixture.invalid"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url,
              let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "file" })?.value,
              let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
              let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)
        else {
            client?.urlProtocol(self, didFailWithError: CocoaError(.fileNoSuchFile))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class AuralCatalogDataTests: XCTestCase {
    func testReaderOpensMatchingSchemaThreeBundleAndRejectsMismatchedEvidence() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "aural-reader-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let snapshot = String(repeating: "a", count: 64)
        let configuration = AuralBundleConfiguration(
            directoryURL: directory,
            manifestURL: URL(string: "https://example.invalid/catalog.json")!
        )
        let manifest = AuralBundleManifest(
            schemaVersion: "aural-catalog-3",
            snapshotId: snapshot,
            files: AuralBundleConfiguration.requiredFilenames.map {
                .init(name: $0, url: URL(string: "https://example.invalid/\($0).gz")!, checksum: String(repeating: "0", count: 64))
            }
        )

        let catalog = try DatabaseQueue(path: configuration.fileURL("aural-catalog.db").path)
        try await catalog.write { db in
            try db.execute(sql: "CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            try db.execute(sql: "INSERT INTO metadata VALUES ('schema_version','aural-catalog-3')")
            try db.execute(sql: "INSERT INTO metadata VALUES ('snapshot_id',?)", arguments: [snapshot])
            try db.execute(sql: "INSERT INTO metadata VALUES ('sequence_count','1')")
            try db.execute(sql: "INSERT INTO metadata VALUES ('sequence_reduction_version','unique-transitions-1')")
            try db.execute(sql: "CREATE TABLE catalog_array(name TEXT PRIMARY KEY, data BLOB)")
            try db.execute(sql: "INSERT INTO catalog_array VALUES (?,?)", arguments: ["suffix_locations", Data(repeating: 0, count: 8)])
            try db.execute(sql: "CREATE TABLE catalog_run(id INTEGER, song_id TEXT, section_id TEXT)")
            try db.execute(sql: "INSERT INTO catalog_run VALUES (0,'song','section')")
            try db.execute(sql: "CREATE TABLE catalog_song(id TEXT)")
            try db.execute(sql: "INSERT INTO catalog_song VALUES ('song')")
            try db.execute(sql: "CREATE TABLE catalog_section(id TEXT)")
            try db.execute(sql: "INSERT INTO catalog_section VALUES ('section')")
            try db.execute(sql: "CREATE TABLE catalog_range(id INTEGER,view TEXT,start INTEGER,end INTEGER,start_group TEXT,start_group_label TEXT,min_length INTEGER,max_length INTEGER)")
            try db.execute(sql: "INSERT INTO catalog_range VALUES (0,'harmony',0,0,'natural:1:upper:major:none','I',2,2)")
        }
        let evidence = try DatabaseQueue(path: configuration.fileURL("aural-evidence.db").path)
        try await evidence.write { db in
            try db.execute(sql: "CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            try db.execute(sql: "INSERT INTO metadata VALUES ('catalog_snapshot',?)", arguments: [snapshot])
        }
        let popularity = try DatabaseQueue(path: configuration.fileURL("aural-popularity.db").path)
        try await popularity.write { db in
            try db.execute(sql: "CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            for (key, value) in [
                ("snapshotId", "pop-fixture"), ("provider", "Fixture"),
                ("attribution", "Fixture"), ("total", "0")
            ] {
                try db.execute(sql: "INSERT INTO metadata VALUES (?,?)", arguments: [key, value])
            }
            try db.execute(sql: "CREATE TABLE popularity(song_id TEXT, score REAL, confidence REAL, provider_url TEXT, measured_at TEXT)")
        }

        let files = Dictionary(uniqueKeysWithValues: AuralBundleConfiguration.requiredFilenames.map {
            ($0, configuration.fileURL($0))
        })
        try AuralBundleInstaller.validateBundle(files, manifest: manifest)
        let staleBackup = directory.appending(path: ".aural-catalog.db.backup")
        try Data("previous catalog".utf8).write(to: staleBackup)
        let installer = AuralBundleInstaller(configuration: configuration)
        try await installer.prepareDirectory()
        XCTAssertFalse(FileManager.default.fileExists(atPath: staleBackup.path))
        let olderManifest = AuralBundleManifest(
            schemaVersion: "aural-catalog-1", snapshotId: String(repeating: "b", count: 64),
            files: manifest.files
        )
        let refusesDowngrade = await installer.installedBundleIsNewer(than: olderManifest)
        XCTAssertTrue(refusesDowngrade)
        let reader = AuralCatalogReader(configuration: configuration)
        try await reader.prepare()
        let info = try await reader.info()
        XCTAssertEqual(info.schemaVersion, "aural-catalog-3")
        XCTAssertEqual(info.snapshotId, snapshot)
        XCTAssertEqual(info.sequenceCount, 1)
        let buckets = try await reader.buckets(AuralCatalogQuery(view: "harmony"))
        XCTAssertEqual(buckets.map(\.id), ["2|natural:1:upper:major:none"])

        func fixtureURL(_ file: URL) -> URL {
            var components = URLComponents()
            components.scheme = "https"
            components.host = "fixture.invalid"
            components.path = "/\(file.lastPathComponent)"
            components.queryItems = [URLQueryItem(name: "file", value: file.path)]
            return components.url!
        }
        var archiveEntries: [AuralBundleManifest.File] = []
        for name in AuralBundleConfiguration.requiredFilenames {
            let source = configuration.fileURL(name)
            let archive = directory.appending(path: "\(name).gz")
            let bytes = try Data(contentsOf: source)
            guard let gzip = gzopen(archive.path, "wb") else {
                XCTFail("Could not create fixture archive")
                return
            }
            let written = bytes.withUnsafeBytes {
                gzwrite(gzip, $0.baseAddress, UInt32($0.count))
            }
            XCTAssertEqual(written, Int32(bytes.count))
            XCTAssertEqual(gzclose(gzip), Z_OK)
            archiveEntries.append(.init(
                name: name,
                url: fixtureURL(archive),
                checksum: SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
            ))
        }
        let downloadableManifest = AuralBundleManifest(
            schemaVersion: manifest.schemaVersion, snapshotId: snapshot, files: archiveEntries
        )
        let manifestFile = directory.appending(path: "manifest.json")
        try JSONEncoder().encode(downloadableManifest).write(to: manifestFile)
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.protocolClasses = [AuralFixtureURLProtocol.self]
        let fixtureSession = URLSession(configuration: sessionConfiguration)
        let installedConfiguration = AuralBundleConfiguration(
            directoryURL: directory.appending(path: "installed", directoryHint: .isDirectory),
            manifestURL: fixtureURL(manifestFile)
        )
        let downloadingInstaller = AuralBundleInstaller(
            configuration: installedConfiguration, session: fixtureSession
        )
        let installed = try await downloadingInstaller.ensureInstalled()
        XCTAssertTrue(installed)
        let installedAgain = try await downloadingInstaller.ensureInstalled()
        XCTAssertFalse(installedAgain)
        let installedReader = AuralCatalogReader(configuration: installedConfiguration)
        try await installedReader.prepare()
        let installedInfo = try await installedReader.info()
        XCTAssertEqual(installedInfo.snapshotId, snapshot)

        let concurrentConfiguration = AuralBundleConfiguration(
            directoryURL: directory.appending(path: "installed-concurrently", directoryHint: .isDirectory),
            manifestURL: fixtureURL(manifestFile)
        )
        let concurrentInstaller = AuralBundleInstaller(
            configuration: concurrentConfiguration, session: fixtureSession
        )
        async let first = concurrentInstaller.ensureInstalled()
        async let second = concurrentInstaller.ensureInstalled()
        let results = try await [first, second]
        XCTAssertEqual(results.filter { $0 }.count, 1)
        let concurrentReader = AuralCatalogReader(configuration: concurrentConfiguration)
        try await concurrentReader.prepare()
        let concurrentInfo = try await concurrentReader.info()
        XCTAssertEqual(concurrentInfo.snapshotId, snapshot)

        let wrongSchema = AuralBundleManifest(
            schemaVersion: "aural-catalog-2", snapshotId: snapshot, files: manifest.files
        )
        XCTAssertThrowsError(try AuralBundleInstaller.validateBundle(files, manifest: wrongSchema))
        try await evidence.write { db in
            try db.execute(sql: "UPDATE metadata SET value='other' WHERE key='catalog_snapshot'")
        }
        XCTAssertThrowsError(try AuralBundleInstaller.validateBundle(files, manifest: manifest))
        let acceptsDamagedBundle = await installer.installedBundleIsNewer(than: olderManifest)
        XCTAssertFalse(acceptsDamagedBundle)
        let freshReader = AuralCatalogReader(configuration: configuration)
        do {
            try await freshReader.prepare()
            XCTFail("Reader should reject mismatched evidence")
        } catch let error as AuralCatalogError {
            guard case .invalidSchema = error else { XCTFail("Unexpected error: \(error)"); return }
        }
        do {
            try await reader.reload()
            XCTFail("A failed replacement must not discard the prepared reader")
        } catch let error as AuralCatalogError {
            guard case .invalidSchema = error else { XCTFail("Unexpected error: \(error)"); return }
        }
        let retained = try await reader.info()
        XCTAssertEqual(retained.snapshotId, snapshot)
        let retainedBuckets = try await reader.buckets(AuralCatalogQuery(view: "harmony"))
        XCTAssertEqual(retainedBuckets.map(\.id), buckets.map(\.id))
        try await evidence.write { db in
            try db.execute(sql: "UPDATE metadata SET value=? WHERE key='catalog_snapshot'", arguments: [snapshot])
        }
        try await catalog.write { db in
            try db.execute(sql: "UPDATE catalog_range SET start_group_label='Tonic'")
        }
        try await reader.reload()
        let refreshedBuckets = try await reader.buckets(AuralCatalogQuery(view: "harmony"))
        XCTAssertEqual(refreshedBuckets.first?.label, "Tonic")
    }
}

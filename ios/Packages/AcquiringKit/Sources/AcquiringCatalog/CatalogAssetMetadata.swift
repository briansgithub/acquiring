import Foundation

public struct CatalogAssetIdentity: Codable, Equatable, Sendable {
    public let eTag: String?
    public let lastModified: String?
    public let contentLength: Int64?

    public init(eTag: String?, lastModified: String?, contentLength: Int64?) {
        self.eTag = eTag
        self.lastModified = lastModified
        self.contentLength = contentLength
    }

    public func matches(_ other: Self) -> Bool? {
        if let eTag, let otherETag = other.eTag {
            return eTag == otherETag
        }
        if let lastModified, let otherLastModified = other.lastModified,
           let contentLength, let otherContentLength = other.contentLength {
            return lastModified == otherLastModified && contentLength == otherContentLength
        }
        return nil
    }

    init?(response: HTTPURLResponse) {
        let eTag = response.value(forHTTPHeaderField: "ETag")
        let lastModified = response.value(forHTTPHeaderField: "Last-Modified")
        let contentLength = response.expectedContentLength > 0 ? response.expectedContentLength : nil
        guard eTag != nil || lastModified != nil || contentLength != nil else { return nil }
        self.init(eTag: eTag, lastModified: lastModified, contentLength: contentLength)
    }
}

public struct CatalogAssetMetadata: Equatable, Sendable {
    public let identity: CatalogAssetIdentity?
    public let byteCount: Int64?

    public init(identity: CatalogAssetIdentity?, byteCount: Int64?) {
        self.identity = identity
        self.byteCount = byteCount
    }
}

public protocol CatalogAssetMetadataService: Sendable {
    func remoteAsset() async throws -> CatalogAssetMetadata
    func installedAssetIdentity() async -> CatalogAssetIdentity?
    func recordInstalledAsset(_ identity: CatalogAssetIdentity?) async throws
}

public actor CatalogAssetMetadataTracker: CatalogAssetMetadataService {
    typealias FetchResponse = @Sendable (URLRequest) async throws -> URLResponse

    private let configuration: CatalogConfiguration
    private let fetchResponse: FetchResponse

    public init(configuration: CatalogConfiguration, session: URLSession = .shared) {
        self.init(
            configuration: configuration,
            fetchResponse: { request in
                let (_, response) = try await session.data(for: request)
                return response
            }
        )
    }

    init(configuration: CatalogConfiguration, fetchResponse: @escaping FetchResponse) {
        self.configuration = configuration
        self.fetchResponse = fetchResponse
    }

    public func remoteAsset() async throws -> CatalogAssetMetadata {
        var request = URLRequest(
            url: configuration.downloadURL,
            cachePolicy: .reloadIgnoringLocalCacheData
        )
        request.httpMethod = "HEAD"
        let response = try await fetchResponse(request)
        guard let response = response as? HTTPURLResponse else { throw CatalogError.emptyResponse }
        guard (200..<300).contains(response.statusCode) else { throw CatalogError.http(response.statusCode) }
        let byteCount = response.expectedContentLength > 0 ? response.expectedContentLength : nil
        return CatalogAssetMetadata(
            identity: CatalogAssetIdentity(response: response),
            byteCount: byteCount
        )
    }

    public func installedAssetIdentity() -> CatalogAssetIdentity? {
        try? JSONDecoder().decode(
            CatalogAssetIdentity.self,
            from: Data(contentsOf: installedIdentityURL)
        )
    }

    public func recordInstalledAsset(_ identity: CatalogAssetIdentity?) throws {
        try FileManager.default.createDirectory(
            at: configuration.directoryURL,
            withIntermediateDirectories: true
        )
        try? FileManager.default.removeItem(at: installedIdentityURL)
        guard let identity else { return }
        try JSONEncoder().encode(identity).write(to: installedIdentityURL, options: .atomic)
    }

    private var installedIdentityURL: URL {
        configuration.directoryURL.appending(path: "installed-asset.json")
    }
}

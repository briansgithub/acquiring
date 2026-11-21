import Foundation
import zlib

/// Strict gzip decoding for untrusted catalog blobs. No unaligned native loads.
enum AuralBinary {
    static func integers(_ data: Data) throws -> [Int] {
        guard data.count % 4 == 0 else { throw AuralCatalogError.invalid("unaligned int32 array") }
        let bytes = Array(data)
        return try stride(from: 0, to: bytes.count, by: 4).map { i in
            let word = UInt32(bytes[i]) | UInt32(bytes[i + 1]) << 8 | UInt32(bytes[i + 2]) << 16 | UInt32(bytes[i + 3]) << 24
            guard word <= UInt32(Int32.max) else { throw AuralCatalogError.invalid("negative array coordinate") }
            return Int(word)
        }
    }
    static func inflate(_ data: Data, limit: Int = 8 * 1024 * 1024) throws -> Data {
        guard data.count >= 2, data.count <= limit, data[data.startIndex] == 31, data[data.startIndex + 1] == 139 else { throw AuralCatalogError.invalid("gzip header/size") }
        var stream = z_stream()
        guard inflateInit2_(&stream, MAX_WBITS + 16, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size)) == Z_OK else { throw AuralCatalogError.invalid("gzip initialization") }
        defer { inflateEnd(&stream) }
        return try data.withUnsafeBytes { source in
            stream.next_in = UnsafeMutablePointer(mutating: source.bindMemory(to: Bytef.self).baseAddress!)
            stream.avail_in = uInt(data.count)
            var output = Data(), buffer = [UInt8](repeating: 0, count: 65536)
            while true {
                try Task.checkCancellation()
                let result = buffer.withUnsafeMutableBytes { bytes -> Int32 in
                    stream.next_out = bytes.bindMemory(to: Bytef.self).baseAddress!
                    stream.avail_out = 65536
                    return zlib.inflate(&stream, Z_NO_FLUSH)
                }
                let written = 65536 - Int(stream.avail_out)
                guard output.count <= limit - written else { throw AuralCatalogError.budget("inflated blob") }
                output.append(contentsOf: buffer.prefix(written))
                if result == Z_STREAM_END {
                    guard stream.avail_in == 0 else { throw AuralCatalogError.invalid("trailing gzip bytes") }
                    return output
                }
                guard result == Z_OK, written > 0 || stream.avail_in > 0 else { throw AuralCatalogError.invalid("truncated/corrupt gzip") }
            }
        }
    }
}

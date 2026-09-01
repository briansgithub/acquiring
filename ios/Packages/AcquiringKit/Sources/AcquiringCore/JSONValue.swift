import Foundation

public enum JSONValue: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case let .bool(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .string(value): try container.encode(value)
        case let .array(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        }
    }

    public var stringValue: String? {
        switch self {
        case let .string(value): value
        case let .number(value):
            value.rounded() == value ? String(Int(value)) : String(value)
        case let .bool(value): String(value)
        default: nil
        }
    }

    public var doubleValue: Double? {
        switch self {
        case let .number(value): value
        case let .string(value): Double(value)
        default: nil
        }
    }

    public var intValue: Int? { doubleValue.map(Int.init) }
    public var boolValue: Bool? {
        switch self {
        case let .bool(value): value
        case let .string(value): Bool(value)
        default: nil
        }
    }
    public var arrayValue: [JSONValue]? { if case let .array(value) = self { value } else { nil } }
    public var objectValue: [String: JSONValue]? { if case let .object(value) = self { value } else { nil } }
}

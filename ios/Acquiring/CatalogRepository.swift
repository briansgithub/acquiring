enum FeatureState<Value: Equatable>: Equatable {
    case idle
    case loading
    case content(Value)
    case empty
    case failure(String)
}

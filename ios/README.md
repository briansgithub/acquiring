# Acquiring for iOS

Open `Acquiring.xcodeproj` in Xcode. The initial target requires iOS 17 and uses SwiftUI plus SwiftData.

This shell establishes the platform boundaries only: the downloadable catalog is read through `CatalogRepository`, while user-owned records use SwiftData. Music-theory and audio features remain tracked in `../docs/feature-parity.md`.

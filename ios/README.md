# Acquiring for iOS

Open `Acquiring.xcodeproj` in Xcode. The initial target requires iOS 17 and uses SwiftUI plus SwiftData.

This shell establishes the platform boundaries only: the downloadable catalog is read through `CatalogRepository`, while user-owned records use SwiftData. Music-theory and audio features remain tracked in `../docs/feature-parity.md`.

## App update shortcut

Library → Settings → Check for Updates opens Acquiring in TestFlight (Apple app
ID `6807512572`); TestFlight decides which builds the signed-in tester can install.
Settings also shows the installed version/build. This is separate from catalog
download/resync and does not claim to compare beta versions inside Acquiring.
If TestFlight cannot open, the app explains how to check manually.

Device/link and missing-TestFlight checks are deferred at the user's request.
When public App Store distribution starts, revisit this TestFlight destination.

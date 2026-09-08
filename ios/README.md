# Acquiring for iOS

Open `Acquiring.xcodeproj` in Xcode. The initial target requires iOS 17 and uses SwiftUI plus SwiftData.

This shell establishes the platform boundaries only: the downloadable catalog is read through `CatalogRepository`, while user-owned records use SwiftData. Music-theory and audio features remain tracked in `../docs/feature-parity.md`.

## Update indicators

The Library Settings button shows a small dot when a database update and/or an
externally available TestFlight beta is ready. Settings keeps the two statuses
and actions separate: database updates use the catalog downloader, while app
updates open Acquiring in TestFlight (Apple app ID `6807512572`).

The beta check reads the release tooling's fixed external manifest URL. It only
offers a newer numeric version/build when the manifest is fresh, targets the
`external` channel, has not expired, and supports the device's iOS version.
Internal-only uploads, unavailable metadata, and malformed or stale manifests
never produce an app-update indicator. Metadata refreshes quietly on launch and
when the app becomes active, at most once per hour unless a cached manifest has
expired; the app never downloads an update or presents an error automatically.
If TestFlight cannot open, the app explains how to check manually.

Device/link and missing-TestFlight checks are deferred at the user's request.
When public App Store distribution starts, revisit this TestFlight destination.

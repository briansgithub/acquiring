# Acquiring - Android App

Android port of key features from the web player in the parent repository.

## Catalog release

The All Songs Complexity and Mode views use the lightweight browse tables in
database schema v3. Before shipping the app, regenerate `catalog.db.gz` with
`tooling/_Research_testing/hooktheory_catalog/scripts/exportFullHarvestedRoomDatabase.js`
from the parent repository and replace the asset referenced by
`DatabaseDownloader.DEFAULT_CATALOG_URL`. The v1 compatibility migration keeps
Alphabetical browsing safe, but the original catalog does not contain the
complexity ratings or per-section mode index.

## Updates

The upper-right **Settings** menu's **Check for Updates** action opens the
[Acquiring Google Play listing](https://play.google.com/store/apps/details?id=com.acquiring.android).
It first targets the Google Play app and falls back to the same HTTPS link in
another compatible handler. It does not perform an in-app version check or
install an update; enrolled beta testers signed into their enrolled Google
account can see an available **Update** on the Play listing.

The menu also displays the installed version and build number. Sideloaded
installs may not be eligible for a Play-delivered update because Play requires
matching signing and an eligible versionCode.

TODO: evaluate the Play In-App Updates API after beta-track/device validation,
including the eligibility differences between Play-installed and sideloaded
builds.

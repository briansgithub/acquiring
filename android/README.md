# Sacred Ring - Android App

Android port of key features from the Sacred Ring web application.

## Catalog release

The All Songs Complexity and Mode views use the lightweight browse tables in
database schema v3. Before shipping the app, regenerate `catalog.db.gz` with
`_Research_testing/hooktheory_catalog/scripts/exportFullHarvestedRoomDatabase.js`
from the parent repository and replace the asset referenced by
`DatabaseDownloader.DEFAULT_CATALOG_URL`. The v1 compatibility migration keeps
Alphabetical browsing safe, but the original catalog does not contain the
complexity ratings or per-section mode index.

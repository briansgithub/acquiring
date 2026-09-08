# Song and artist display names

Implemented on `codex/ios-song-display-names`; commit, merge to main, push, and
task-worktree cleanup were authorized. Runtime model: unknown. The catalog and
reports are retained at `H:/Desktop/Acquiring/.artifacts/display-name-enrichment`
after cleanup. No catalog publication or app release is included, and the iOS
build still requires Mac verification.

## User-visible behavior

Song labels, artist suggestions/history, artist pages, library rows, song details,
and accessibility labels use shared display formatting. The quiz heading shows
one line of `title by artist` with an information cue. Tapping it opens a
selectable, wrapping sheet. Opening this sheet does not deliberately change
playback, mode, section, or navigation; its runtime behavior remains to be checked.

Formatting preserves readable source spelling and punctuation, decodes display
entities, and cleans obvious legacy slug separators. Single-word lowercase names
remain unchanged because names such as `boygenius` are intentional. The enriched
catalog supplies recovered spelling or readable fallback labels for older data.
Names unavailable from sources are not advertised as exact.

Song IDs and URLs are separate from labels. Legacy artist history resolves through
stored artist names and stable slug identities. Search tolerates punctuation and
accent differences. The shared catalog remains schema version 3.

## New songs and periodic developer updates

In-app harvesting reads source names from the verified TheoryTab page heading and
available API fields. It rejects mismatched page identities, falls back when
metadata is missing, and retains existing readable names when a reharvest only
has slug fallbacks. These changes take effect after an app build containing them
is installed.

Developer discovery now retains original artist/song strings before deriving URLs.
URL-only rediscovery cannot overwrite readable labels. Both catalog exporters can
consume an enrichment name map. A future scheduled developer update should run
the following sequence; no automation or publication was configured in this task:

1. Run the existing discovery/harvest update.
2. Run `enrichDisplayNames.js` with the updated source database, the current app
   catalog, the saved harvest root, and a new staging directory.
3. Check the report. Network failures, repeated/truncated pages, unavailable
   credentials, and ambiguous metadata remain explicit incomplete/unresolved
   results. An offline fallback is not evidence of exact spelling.
4. Pass that run's `names.json` to the normal exporter using `--names-file`, along
   with a fresh `--output-dir`. Validate the resulting catalog before the separately
   authorized publication step. The full exporter also accepts `--cache-dir`;
   both accept `--source-db`.

For a new run, use a new staging directory. `--resume` continues an interrupted
run using its saved source headers/search pages and requires matching input paths;
it is not a fresh remote refresh. `--offline --resume` rebuilds from those caches
without contacting Hooktheory. `--corrections <json>` accepts verified corrections
as `{ "songs": { "existing-slug": { "title": "...", "artist": "...", "source": "https://..." } } }`.
Artist corrections apply to the existing artist identity. IDs and URLs are never
derived from corrected display text.

The name-recovery command reads saved metadata first, including canonical and
URL-derived harvest folder names. Online recovery uses only public search name
metadata, one request every two seconds, with cached pagination and bounded
retries. It stops on access refusal, respects Retry-After (or checkpoints instead
of retrying early), and does not fetch musical payloads or crawl individual pages.
Existing authentication is read from the supplied local cache; credentials are
never written to reports. Do not run this name pass on every app screen view.

## Staged result

Artifacts are local and ignored by Git in the primary checkout's
`.artifacts/display-name-enrichment/` (a copy of this guide is retained there too):

- `catalog.db` and `catalog.db.gz`: 40,979 existing playable songs; 40,315 labels
  changed. All IDs, URLs, status values, musical payloads, ratings, and modes match
  the input fingerprint. Alphabetical groups are recalculated using the shared
  grouping rule, including individual digits.
- `names.json`: selected display names and field-level provenance for 42,196
  songs: 42,194 discovery records plus two older exported records preserved for
  compatibility.
- `report.json`: 39,456 records have source-backed names for both fields;
  2,740 have an unresolved field, of which 1,770 are present in the playable
  catalog. It also records 3,627 records with differing source candidates.
- `README.md`, `inputs.json`, `saved-headers.json`, and `search-pages/`: summary and
  resumable evidence. The completed online pass used 42 pages / 41,809 search
  records. There were no local source-read errors.

The source databases and original harvest files were read-only. The first staging
attempt correctly stopped when it encountered an older exported song missing
from discovery; the completed implementation includes the union of both inputs.

## Validation and remaining review

These checks passed from the worktree (Node dependencies are locally linked to
the primary checkout):

```text
node tooling/_Research_testing/hooktheory_catalog/scripts/displayNameEnrichmentTest.js
node tooling/_Research_testing/hooktheory_catalog/scripts/displayNamePipelineTest.js
node tooling/_Research_testing/hooktheory_catalog/scripts/reconciliationTest.js
node tooling/_Research_testing/hooktheory_catalog/scripts/urlPreservationTest.js
node tooling/_Research_testing/hooktheory_catalog/scripts/lightCatalogQueueTest.js
node tooling/_Research_testing/hooktheory_catalog/scripts/androidCatalogBrowseTest.cjs
node tooling/scripts/validateCatalogContract.mjs .artifacts/display-name-enrichment/catalog.db
git diff --check
```

The enrichment tests cover entity decoding, source identity checks, ambiguous
metadata, both source slug conventions, repeated/truncated pages, retained older
catalog entries, staging, source immutability, numeric grouping, and repeat-run
stability. Export tests cover both export paths and payload/schema invariants.
The staged archive was decompressed and its SHA-256 compared with the database;
numeric browse groups were checked separately. Both passed. The first contract
command could not resolve the worktree's Node dependency; it passed after the
local dependency link was added. No dependency download was necessary.

No Swift/Xcode toolchain is available on this Windows host. Swift tests and the
simulator build were not run successfully. Windows Bash could not access the
workspace when the simulator script was attempted. Required Mac follow-up:

```sh
swift test --package-path ios/Packages/AcquiringKit --filter 'CatalogDisplayNameTests|CatalogBrowseTests|AcquiringCatalogTests.testHooktheoryDisplayMetadata'
bash ios/scripts/run-sim.sh
```

Also run the focused app history tests and
`AcquiringUITests.testQuizSongInformationRetainsModeAndPlayback` on the warm iPhone
17 simulator. Inspect `500 Miles by The Proclaimers`, open a long heading during
playback and dismiss it, then try artist search and existing recent-artist entries.
Human review supplies visual feedback; no screenshots or full-app test sweep were
performed. Existing feature review statuses remain unchanged.

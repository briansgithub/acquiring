# Aural Quiz catalog: Android human-testing release

## Progression song queues — implementation started 2026-09-28

Starting from clean `main` at `1c95ef0b`, implementing the approved Android
progression queue and fixed saved-playlist plan on `codex/aural-song-queues`.
No uncommitted or untracked files were present. Prior Android builds and JVM
checks passed at `ee37a312`; this feature needs its own engine, migration,
queue, and Pixel validation. Work stays in the primary checkout; the separate
iOS work remains outside this change. Next: add distinct matching-section
selection, play-once completion, queue UI, and durable playlist entries.

## Progression song queues — validated 2026-09-28

The Android progression rows, including recursive children, now have a separate
Play matching songs button. The queue includes each eligible supporting song
once, chooses one random matching section per song, and defaults to descending
song-popularity order. Shuffle reorders only the unplayed remainder. The player
opens immediately, loads song data on demand, starts automatically, and advances
after the selected section's final audio drains. Previous, Next, and the Queue
sheet preserve the current play/pause intent. A queue can be named and saved as
an ordered snapshot; Library → Playlists offers Play and Shuffle play. Song
lookup uses the catalog section hash, with a unique-name fallback for an older
source section whose identity changed. Missing or ambiguous entries are skipped
with a visible notice, not substituted. Returning from a generated queue
restores the Aural Quiz browse state. The user-data database moves from schema
3 to 4 without clearing Favorites or legacy playlists; their prior ordering is
preserved.

On Pixel 7a `3C081JEHN14930`, a 227-song progression queue loaded, began
playback, advanced automatically, saved a 227-entry playlist without pausing,
and reopened it from Library. Back returned to the original Quiz browse row.
Two full-catalog device tests passed: complete membership beyond one browse
page, and safe section resolution for 30 sampled songs. The final Debug app
was installed again without clearing app data and launched. The full Android
`testDebugUnitTest`, `assembleDebug`, and `assembleDebugAndroidTest` run passed
after the final code changes. No human listening or extended background/audio-
focus session was performed; those are useful follow-up checks. This is
Android-only; the existing iOS validation gate is unchanged.

## Queue-first Examples control — 2026-09-28

The progression action is now a prominent, labeled **Examples** button below
each playable row, including recursive children. It opens a queue preview
before playback. The preview lists every matching song in descending
popularity order, offers Play queue or direct selection of a song, and can
save the list without first playing it. Shuffle is an on/off control: on
randomizes the complete order; off restores the original popularity order.
Toggling during playback keeps the current song playing and moves its queue
position to match the new order. Saved-playlist queues restore their saved
order when Shuffle is turned off. The earlier immediate-autoplay and
unplayed-remainder-only shuffle behavior above is superseded by this section.

Focused `SongQueueTest` and `AuralQuizUiTest` passed, and `assembleDebug`
passed. The revised APK was installed without clearing Pixel 7a app data.
On-device accessibility-tree review confirmed that Examples opens the
227-song queue preview, Shuffle changes its visible order, turning Shuffle
off restores the popularity order, and Play queue enters active playback.
No screenshot or human listening check was performed.

## Current frequency-first browsing — 2026-09-27

The default catalog is one ungrouped list sorted by distinct supporting songs
across the installed database, then total source occurrences, chord count, and
structural ID. The analysis and inversion view define sequence identity. The
song-popularity cutoff (80% by default), constrained chord search, and mode
controls determine which rows and example songs qualify; they do not change
the global support counts used by **Most songs**. Rows distinguish overall
support from matching songs. **Recommended** retains the previous combined
score and example preferences; **Longest first** and **Shortest first** use
global song frequency to break ties. Grouping is separately selectable as
None, Length → Starting chord, or Starting chord → Length. Grouped views keep
independent pages and contextual subgroup Review. **Show subsequences**
controls recursive children; it does not choose the global/grouped layout.

The sections below record the implementation history; superseded descriptions
of the default order and Flat list refer to earlier builds.

Updated 2026-09-17. Implementation route: offline Node/SQLite, Python streaming import, native Kotlin/Compose; runtime model identity unknown. No model inference or provider calls run in the app. This document supersedes the six-family catalog and unavailable-popularity limitations in the earlier implementation handoff.

## Access and behavior

Roman-numeral strings use the shared Playback scale-degree palette one chord at a time: I red, II orange, III yellow, IV green, V blue, VI purple, and VII pink. Accidentals, quality, inversions, and applied denominators retain the color of their chord’s numerator, so `♭VI`, `V6/V`, and `iiø7` remain readable as degree 6, 5, and 2. Arrows, non-Roman labels, and unrevealed answer slots remain neutral.

Open **Aural Quiz** from the home screen. After the offline catalog loads, search Roman labels or filter by chord count. Tap a progression to practice its whole sequence in **Recognize**, **Recall**, or **Sing**. The guided course remains available; **Review** chooses weaker/due targets from the currently loaded catalog results. Named progression practice is supported practice because selecting the progression already reveals its identity.

Catalog rows have outline numbers: roots `1`, `2`, etc.; children `1.1`, `1.2`; deeper descendants `1.1.1`, etc. These indicate position in the current ranking, not permanent sequence identity. Expanding a branch leaves sibling root numbers unchanged. Shared sequences have an outline number for each tree path. Flat mode uses consecutive ranks. Expand/collapse controls use a filled 48 dp touch target and 32 dp arrow.

Each catalog sequence also has a **Songs** tab listing all distinct supporting songs by descending popularity. Each row displays the stored popularity score on a 0–100 scale (one decimal); missing scores show **No data** and sort after scored songs. Equal scores and unscored songs sort by title, artist, then ID. Ordering uses the actual score before display rounding and is independent of practice-selection preference weighting. This replaces the initial alphabetical-only song order. Titles/artists load asynchronously from the existing suffix index; the list renders lazily. Clicking a song opens a validated matching passage through the ordinary full-song Playback destination. Android Back or Playback's standard **Back** control restores the tab and list scroll position; returning to the active learning tab retains the exercise and draft. Playback exploration is assisted and registers familiarity with the explored source. No index rebuild is needed for this UI addition.

Popularity-order validation (2026-09-17): `AuralPatternSongTest` and the instrumentation APK build passed (`aural-score-build`, 4.8 seconds). The fixture verifies score order, alphabetical ties, and that a known zero ranks above missing data. The debug APK built and was installed on the Pixel. Two device tests passed (25.776 seconds), verifying real overlay values/order, score labels, and the Songs/Playback return flow. The initial combined host run was interrupted after two existing Compose tests reported `AppNotIdleException`; both affected tests passed independently in `aural-ui-recheck` (13.7 seconds), without production changes. This initial combined run is not recorded as a passing full suite.

Songs/outline validation (2026-09-17): the Aural JVM suite and both APK builds passed (`aural-songs`, 43.5 seconds). After adding the source-restoration regression test, the 32 session/UI tests and both APK builds passed (`aural-songs-navigation`, 23.5 seconds). `adb -s 3C081JEHN14930 shell am instrument -w -r -e class com.acquiring.android.AuralCatalogDeviceTest com.acquiring.android.test/androidx.test.runner.AndroidJUnitRunner` passed all four tests (37.88 seconds): 48 dp arrow targets, expansion/collapse numbering, alphabetical distinct-song counts, selected-song eligibility, other-section availability, Songs scroll/draft restoration via Android Back, and the existing quiz-source round-trip. Human check: inspect deep outline readability and four-tab spacing on the Pixel; browse several Songs entries, switch Playback sections, and return using both Back and the on-screen return button.

The shared settings panel includes five controls. Popularity, variety, and favorites affect both ranking and eligible-song selection. Inversions change sequence identity/counts. Flat list defaults off and shows every matching sequence once across pagination. Tree mode orders roots and siblings by the same score; each expansion removes one endpoint, never an interior chord. A shared subsequence can appear under multiple parents with identical global counts. Each view retains its own scroll state; filters, loaded pages, and expanded nodes survive the Playback round-trip. Information buttons expose detailed evidence. Analysis gaps list uncertain source passages and their diagnostics; these are not silently graded.

Song title, artist, and section appear immediately. **Open in Playback** routes through the same full-song loader used by Library and Search selection, so it includes melody, chords, section navigation, and every standard Playback control. The compact catalog section is evidence for indexing and tests; it is never rendered as a second player UI. The optional **Jump** header action returns the unchanged timeline layout to the matched sequence's first beat, and the passage remains highlighted. Playback's standard **Back** control and Android Back restore the current question and draft. Exploring Playback marks the attempt assisted. Source loading failures retain the quiz. Quiz audio and microphone activity stop during navigation.

Playback restoration validation (2026-09-18): the focused Aural JVM tests and both APK builds passed. Three Pixel 7a instrumentation tests passed in 25.748 seconds, covering host-only source delegation, retained quiz drafts, and the standard Playback melody/chord rows with the header-level passage jump. A direct installed-app traversal opened **Kids** by MGMT from an Aural sequence, confirmed the normal Melody, Chord, Chord Tones, mix, section, and transport controls, and returned to the same Aural exercise with Android Back.

## Compact exhaustive catalog

Authoritative input is normalized original song sections, not the legacy multi-GB progression database. Existing normalization preserves mode, chord quality, applied/borrowed annotations, bass relationships, source timing, and uncertain boundaries. Identical adjacent harmonic states are collapsed with their original chord spans retained: the catalog describes changes of harmony, not every repeated strum. Available sections, not missing catalog songs, define the observed corpus.

`catalogRanges` extends recurring suffix/LCP intervals with implicit length ranges and unique suffix leaves. Adjacent LCP lengths determine each leaf's first unique length. These disjoint ranges represent every confidently normalized contiguous sequence of two or more harmonic states exactly once per inversion view, including single-occurrence sequences. No minimum support or curriculum coverage threshold limits catalog discovery. Source sections, normalized runs, and suffix locations are stored once; individual substring occurrences are resolved from suffix intervals.

The ranking base is `log2(length) × log2(1 + songs) × log2(1 + effective occurrences)`. Effective occurrences are greedily selected nonoverlapping equal-length intervals, capped at four per song. Display counts include every overlapping match. A song contributes one multiplier to the supporting-song average:

- Popularity: `1 + confidence × (score − 0.5)`; unknown data contributes 1.
- Variety: 0.25 for the last three songs, 0.6 for the next seven, otherwise 1.
- Favorites: 1.5 for favorites, otherwise 1.

Disabled factors contribute 1. Ties use song support, then length, then stable pattern ID. A best-first heap refines compact length ranges using conservative score upper bounds. Android streams the indexed upper-bound frontier and computes exact counts only when competitive. A page is emitted only when no unseen bound can outrank it. Search and chord-count filters apply to the complete catalog. Preferences and history are frozen for each query. Broad or unsuccessful searches can still be costly; this is exact ranking rather than a preselected shortlist.

Coverage evidence remains separate from ranking. The selected curriculum overlay contains occurrence/song support, total/additional transition union coverage, longer-window coverage, redundancy, and cumulative coverage in the curriculum's ordering. An unselected catalog pattern gets its own exact transition/window union evidence without invented cumulative curriculum position. Short patterns cannot claim longer-window coverage by concatenation. Existing discovery continues after 80% transition coverage, allowing a longer explanation to supersede fragments without inflating physical coverage.

## Portable contracts and updates

- **Pattern target:** stable structural ID, normalization/inversion view, ordered token JSON, labels, suffix bounds, snapshot ID. Pattern IDs use the existing deterministic four-lane token hash and namespace. Android validates the complete target against its installed index before source selection. Educational annotations and skill mastery remain separate.
- **Catalog query:** inversion view, label search, minimum/maximum length, frozen preferences/history/favorites/popularity, and pagination session. `catalog.mjs` is the reference implementation; `AuralCatalog.Ranking` is the native reader.
- **Passage reference:** song, section, source revision, original start/end chord indices and beats, occurrence ID, pattern, source key, realized notes, and context. Exercise provenance adds seed, generator/selector versions, instrument, octave transformation, and exposure. Existing records migrate without resetting mastery.

`catalog-export.mjs` defines SQLite schema `aural-catalog-2`. In addition to the original modal index, it contains a relative-major index whose structural identities use the relative-Ionian root and realized pitch intervals. Existing modal ranges carry their source mode, allowing exact mode filtering before pagination without duplicating an index per mode. Gzip source sections and runs are portable UTF-8 JSON. `catalog_array.suffix_locations` stores little-endian signed int32 `(runId, offset)` pairs. `catalog_range` records the view, source mode, suffix bounds, implicit length endpoints, support, and a ranking bound. `catalog_suffix` indexes original endpoints for occurrence retrieval. No mining runs at quiz time. The evidence database must match the catalog snapshot; popularity is independently versioned. Both mobile readers retain read-only support for schema 1, with mode controls unavailable until schema 2 is installed.

The existing normalized cache reprocesses changed sections; global discovery, coverage, and ranking are rebuilt from that cache. Current catalog snapshot hashes include source database bytes and producer code, so SQLite file reorganization can produce a new snapshot even without musical changes; structural IDs remain stable. This release does not implement incremental suffix-array mutation. Periodic clean/incremental normalization comparisons remain the validation route.

Artifacts are immutable, checksummed, and excluded from Git. `install-android.mjs` checks host SQLite integrity and catalog/evidence identity, streams into app-private staging files, verifies their checksums, then atomically replaces each database without resetting preferences/progress. Evidence checks protect against mixed snapshots; popularity is independent. Installation is not a multi-file transaction. The `v1.0.0-data` GitHub release publishes the manifest plus all three gzip assets. Android verifies and installs that bundle automatically after the main song catalog is installed or refreshed; entering Aural Quiz also retries a missing or damaged bundle. Development ADB provisioning remains available for local snapshots.

## Real popularity

The supplied enrichment guidance led to **MusicBrainz canonical CC0 metadata + ListenBrainz CC0 counts**, replacing the earlier Last.fm dependency for the installed release. No API key or paid source was used. Last.fm remains an optional, unused personal/noncommercial adapter; it is not the installed provider.

`canonical-match.py` streams the official compressed canonical dump without extracting the 7.6 GB CSV. It retains catalog-name candidates, matching artist and title separately after normalization. `listenbrainz.mjs` rejects multiple recording candidates, recording-ID ownership collisions, explicit version conflicts, and live/remix/tribute release markers. It records a **canonical metadata match**, never falsely calls a name match an exact identifier or a human audit. A canonical representative does not verify the exact recording used by the TheoryTab section. Redirect aliases and variant listen totals are not summed.

The API is batched, throttled, retried, and checkpointed with a 30-day refresh cache. Scores use 80% listener percentile and 20% listen-count percentile; both are cumulative. Unknown/missing counts stay neutral. The mobile overlay contains derived weights, confidence, provider reference, and measurement dates; raw provider observations remain offline. Section popularity stays unknown and neutral. Settings show actual score coverage, date, and attribution.

Sources: [canonical MusicBrainz data and CC0 scope](https://musicbrainz.org/doc/Canonical_MusicBrainz_data), [ListenBrainz popularity endpoint](https://listenbrainz.readthedocs.io/en/latest/users/api/popularity.html), [MetaBrainz datasets](https://metabrainz.org/datasets/postgres-dumps).

The deterministic 500-song pilot scored **259/500 (51.8%)**, with 265 canonical matches and 7 ambiguous cases. An agent inspected metadata for 30 candidates across low/middle/high listener counts: 28 were accepted and two conflicting release qualifiers prompted stricter exclusion before the final full run. This was not human listening validation; the report intentionally leaves human audited accuracy null. Full catalog: **25,977/42,194 scored (61.57%)**, 26,416 canonical matches, 524 ambiguous. ListenBrainz represents its contributing audience and has uneven geographic/genre coverage.

## Build and verification record

The full catalog contains **9,425,137 structural sequences across both inversion views**, not 9.4 million families. It is 658,198,528 bytes and built in 159.368 seconds. The evidence overlay is 45,502,464 bytes with 75,242 selected pattern records; popularity is 6,619,136 bytes.

Installed catalog snapshot: `f8e5ba8032f4319b0b30123463d69ab72f271f9089809bfa5e57c5925195aeb4`.
Catalog SHA-256: `b4c09c46ee3b54dc983328df870c5cb90707e17a11e254eae424f0000c5a7d4d`.
Popularity snapshot: `pop-7a28550b0605de8f29218df622586aa8e1ea6aca963949852a6fe896a5cdaef9`.
Canonical dump: `musicbrainz-canonical-dump-20260903-080002.tar.zst`, official SHA-256 `3a8fc810e5457ab920fe668bc65ad6290d95e51d1a0e80da53fe0f448481b9bf`; 31,962,546 canonical rows read.

Commands, from repository root unless specified:

```powershell
node --test tooling/aural-corpus/*.test.mjs
node --max-old-space-size=8192 tooling/aural-corpus/catalog-export.mjs <normalized.db> <song-catalog.db> <output-directory>
node tooling/aural-corpus/catalog-evidence.mjs <analysis.db> <catalog.db> <new-evidence.db>
python tooling/aural-corpus/canonical-match.py <canonical.tar.zst> <song-catalog.db> <candidates.json>
node tooling/aural-corpus/listenbrainz.mjs <song-catalog.db> <candidates.json> <output-directory> <pilot.json>
# Omit pilot.json for the full run after inspecting pilot matches.
node tooling/aural-corpus/install-android.mjs <adb> <serial> <catalog.db.json> <popularity.db> <evidence.db>
```

Python import dependencies: `zstandard`, `Unidecode`. Node uses built-in SQLite (Node 24+). From `android/`:

```powershell
python scripts/compact_check.py --name aural-catalog-final -- gradlew.bat testDebugUnitTest --tests "com.acquiring.android.Aural*" assembleDebug assembleDebugAndroidTest --console=plain
```

Validation: 97 Node tests passed; two opt-in stress tests skipped (the actual full corpus was built separately). A subsequently added cache-directive regression test also passed, along with the targeted installer checksum/mismatched-snapshot checks. Android **102 JVM tests passed**, debug and instrumentation APKs built. Six device tests passed across AuralCatalogDeviceTest, AuralQuizDeviceTest, and AuralCorpusDeviceTest; after the final decoy/reference changes, the two affected catalog device tests passed again in 19.154 seconds. The final progress-indicator UI update passed AuralQuizUiTest, both APK builds (`aural-progress-ui`, 22.9 seconds), and the device Playback round-trip test again (12.799 seconds). These cover real offline source resolution, exact draft return through the Playback UI, native audio, settings, and corpus generation. Latest Pixel 7a measurement: catalog load 3,472 ms, first 20 ranked rows 1,229 ms, 20 prepared exercises and total validation work 5,543 ms. This is a single device measurement, not a latency percentile or extended memory/scroll soak.

Tests cover synthetic exhaustive/brute-force equivalence, overlaps/shared endpoints, unique/long sequences, all ranking-factor combinations, frozen pagination, continued longer discovery, song sampling bias, matching/retries/unknowns, dynamic minor harmony, repeated-chord decoys, 150-chord exercises, streaming blocks/partial writes, assisted mastery, uncertain pitch handling, legacy progress, and persisted Playback draft recovery. Audio streams bounded PCM blocks and preserves shared instrument, raised octave, cancellation, and smooth transitions.

## Remaining limitations and human checklist

The catalog is structural discovery, not an automatically authored exhaustive functional-family curriculum. Review currently considers loaded catalog targets; the existing guided course retains its curated prerequisite graph. Dynamic scale-degree singing currently targets the tonic; roots, bass, and root sequences are separate tasks. The app synthesizes source harmony, not the original commercial recording. Whole sequences are supported, but very long symbolic exercises need usability review. Loop boundaries use Playback's position updates, not sample-accurate editing. Full-section Playback is available; broader artist/song navigation is outside this embedded return flow. Catalog loading and exact broad searches are asynchronous but still take time. Per-source historical snapshots are not retained on the device indefinitely after a catalog replacement.

- Check common, minor, borrowed/applied, and inversion examples for correct notation and audible harmony.
- Confirm counts and prefix/suffix expansion preserve order; compare flat ranking with each preference toggled.
- Inspect popularity matches across genres and ambiguous versions; do not treat the metadata audit as musical identity confirmation.
- Open a named section, compare the highlight and loop with the quiz, enter part of an answer, explore Playback, and return using both buttons and Android Back.
- Try a long exercise, guided chunk, independent review, and each singing target. Judge cue usefulness, smooth transitions, microphone uncertainty feedback, and fatigue.
- Check visual density, scrolling, TalkBack, repeated navigation, and memory during an extended Pixel session. No screenshots were taken for automated verification.

Offline pipeline checkpoint: `79df88b5` on `codex/aural-corpus-index`. The following Android checkpoint contains this handoff. Generated inputs, pilot report/audit, measurements, and installed snapshot files remain under ignored `acquiring_data/`; other-agent `docs/INDEX.md` and `docs/aural-popularity-enrichment-agent.md` were preserved outside these commits. The installer was executed successfully against the Pixel with all three private-file checksums verified. Popularity overlay SHA-256: `53c2aa8024f85d00115c08d014e43f56831ee88e0e81e15b66d2219d4c3e9337`.

Pause for human testing before further curriculum/product expansion. No remote push, store release, or iOS UI implementation was performed.

## Flexible grouping and mode controls — 2026-09-25 work in progress

This newer section supersedes the older access/settings description above for
the current `codex/aural-mode-analysis` worktree. The Aural Quiz catalog now
shows **Relative major** (new default), **Mixed Modes** (the persisted
`allModes` identifier), and **Filter by mode** directly below search. The mode
picker appears only for filtering; Min/Max chord fields are removed. The
one-time v1 selection migration changes prior All Modes defaults to Relative
major, while subsequent explicit Mixed Modes choices are retained. Older v1/v2
catalogs remain readable and expose only supported controls.

Length and starting chord are interchangeable primary/subgroup dimensions.
The v3 catalog stores a starting-chord ID and label on every compact range;
the UI discovers only real length/start combinations from those ranges. Both
levels initially collapse, each leaf pages independently at 30 rows, and the
last active leaf/page/scroll position is stored separately from live cursors.
Recursive endpoint children stay under the parent occurrence path. Flat list
hides children without changing the grouping. Review this subgroup freezes
the first 30 ranked rows for that leaf. Selected progressions have neutral
containers and individual chord-colored borders; hidden choices stay neutral.
The Android installer validates all staged databases before replacement, keeps
the active files untouched until staging succeeds, and does not replace a validated
schema-v3 bundle with the older published schema-v1 manifest.

The current full source normalization cache is
`H:/Desktop/Acquiring/Acquiring/acquiring_data/aural-corpus/normalized-mode-v2.db`
(41,099 songs, 77,772 sections). A **99-song sample only** schema-v3 catalog
was exported under
`H:/Desktop/Acquiring/Acquiring/acquiring_data/aural-catalog-v3-sample/`;
the sample snapshot is
`6ac7534af0eb090859d8cf56839c8c754770e39092787beb25fc660c47a288cf`.
Sample validation is not full-catalog validation. A full v3 export completed
in 781.207 seconds under
`H:/Desktop/Acquiring/Acquiring/acquiring_data/aural-catalog-v3/`: snapshot
`e18eadf5a212f441afb69f44ca779b577d7476c3baaefca73fd74b9c9ee83cfb`,
18,557,875 structural sequences, 1,672,982,528 bytes, catalog SHA-256
`3c40175c0e6cd9688473ae0b60b399c8a075fddc04ba03a65b843a7931a41449`.
Matching evidence exported from the full analysis snapshot: 75,242 records,
45,502,464 bytes, SHA-256
`91681dc3280c25a87ddf2c3b88a8fea49205510157ae79797dd7d5571b292e6a`.
The exporter ran SQLite integrity checking. Do not delete the ignored prior
`.tmp` file without inspecting its exact ownership.
The full catalog, matching evidence, and existing full ListenBrainz popularity
overlay passed `inspectBundle` checksum/snapshot validation. This validates
the offline bundle, not its behavior on a device.
`node --test tooling/aural-corpus/catalog-export.test.mjs` passed both schema-v3
cases. Android `:app:testDebugUnitTest`, `:app:assembleDebug`, and
`:app:assembleDebugAndroidTest` passed together after the browse restoration
fix, then again after installer rollback support. The final Kotlin compile
after the exact-bucket `DISTINCT` query passed; the focused
`AuralCatalogDownloaderTest` and Debug APK build passed after the no-downgrade
guard was added. A full-catalog
SQL probe found 3,158,873 compact ranges, 246 starting-chord IDs, and zero
null group identifiers/labels; the `harmony` group-discovery query returned
39,292 distinct range shapes in 3.883 seconds on this Windows disk. Device
performance remains unmeasured.

Remaining gates: install the validated bundle
and app on the Pixel 7a when `adb devices` lists it; run the focused catalog
instrumentation test; and visually compare modal controls, group order,
pagination, recursive paths, restoration, and chord borders in the app. The
Pixel was not connected when this section was written. The iOS port and its
deferred Mac checks are documented separately in `docs/porting-plan.md` on
`codex/ios-aural-quiz-port`. No release or remote upload was requested.

## Button-based progression search — 2026-09-25

On `codex/aural-mode-analysis`, the open-ended Roman-label search field has
been replaced with a constrained sequence builder. Tap I–VII to append chords;
tap a chip to choose flat/natural/sharp and Any, Major, Minor, 7, maj7, or m7.
**More options** lists exact chord forms found in the installed catalog for
that degree and accidental, including catalog-supported modifications. Chips
can be moved, removed, or cleared. An empty query shows all sequences. A
nonempty query matches whole, consecutive chords anywhere within each
top-level sequence; recursive endpoint children retain their existing display
behavior. The selected analysis view supplies relative-major or modal labels.
Old free-text search content is intentionally not converted into a chord query.

The versioned query is persisted independently of live ranking cursors and
debounced before re-ranking. Exact forms compare their root-position catalog
label; when inversion distinction is on, a selected inversion can additionally
constrain the displayed inversion label. Turning inversion distinction off
clears only that additional constraint. Within each available group, ranking,
subgroup Review, and pagination use the same filtered top-level result set.
Query controls permit at most 32 chords to bound accidental unworkable input.

Validation: `AuralProgressionQueryTest` passed, including contiguous matching,
family/accidental/exact forms, serialization, and root-versus-inversion checks.
From `android/`, with `ANDROID_HOME` set to the local SDK,
`:app:testDebugUnitTest`, `:app:assembleDebug`, and
`:app:assembleDebugAndroidTest` passed via `scripts/compact_check.py`
(`aural-search-all-android-unit`, 121.9 seconds). The Pixel 7a was not listed
by `adb devices -l`, so the new search UI and full-catalog query latency are
not device-validated. Next: install the validated app/catalog when the Pixel
is reachable, check common families and More variants under modal/relative
views, test inversion toggling and rapid edits, and review the chip layout.
The iOS source and deferred Mac checks are recorded in `docs/porting-plan.md`
in the iOS worktree. No remote push or release was performed.

### Pixel 7a upload — 2026-09-25

Device `3C081JEHN14930` connected. Installed the Debug app from Android
checkpoint `0373d5dd` with `adb install -r`, preserving app data. The existing
local full schema-v3 catalog snapshot
`e18eadf5a212f441afb69f44ca779b577d7476c3baaefca73fd74b9c9ee83cfb`,
its matching evidence, and the full ListenBrainz popularity overlay were
installed using `tooling/aural-corpus/install-android.mjs`. The installer's
host, transfer, and app-private checksum checks passed; direct checks of all
three active private files matched SHA-256 values listed above. Only the two
large, exact temporary catalog/evidence transfer copies created for this
upload were removed from `/data/local/tmp` after validation. The host copies
and app-private files remain. The phone had 2.6 GiB available afterward.

The `app-debug-androidTest.apk` was installed, and
`AuralCatalogDeviceTest#exhaustiveCatalogRanksAndResolvesOfflinePassages`
passed on the Pixel (1 test, 21.03 seconds). The app was launched again after
the test. The new button-builder layout and interactions have not yet received
human visual review; test the common families, catalog-backed More options,
modal/relative views, inversion toggle, and rapid edits before integration.
No remote push or store release was performed.

## Repeated-loop reduction — 2026-09-25

The catalog now omits whole-sequence repeats of a shortest normalized chord
cycle once two full cycles appear. It retains the earliest longest contiguous
window without a repeated directed transition, so `I–V–I–V–I` points to the
already indexed `I–V–I`; a mixed-context `X–I–V–I–V–Y` remains available.
Reduction uses full normalized tokens per modal/relative and inversion view.
It does not change source runs, occurrence locations, passage timing, pattern
IDs, prior mastery, or a restored exercise. Recursive endpoint expansion
promotes the nearest retained descendants. New readers filter legacy bundles
as well; only rebuilt bundles have accurately reduced range/group counts.

The additive schema-v3 metadata is `sequence_reduction_version=
unique-transitions-1`, `raw_sequence_count`, and the retained
`sequence_count`. Compact ranges are split around omitted lengths and each
segment receives its own conservative score bound. The exporter checks SQLite
integrity, and the evidence overlay is rebuilt for the new snapshot. A
single-source JSON fixture is copied identically to the iOS worktree.

The **99-song sample only** under
`H:/Desktop/Acquiring/Acquiring/acquiring_data/aural-catalog-loop-sample/`
retains 57,359 of 63,384 sequences; matching sample evidence and the full
popularity overlay passed `inspectBundle`. This sample is not full-catalog
validation.

The full bundle under
`H:/Desktop/Acquiring/Acquiring/acquiring_data/aural-catalog-loop-full/`
has snapshot `dbbac5ef03ceec5e8d5e0f5b04e68e8a9ac968a44cf0b848fbea9cd44d5c8c2f`.
It retains **17,272,900 of 18,557,875** structural sequences (1,284,975
removed, 6.9%). Exact `(view,length,starting chord)` groups fall from 58,280
to 55,037; compact range rows fall from 3,158,873 to 2,961,531. The catalog
is 1,628,401,664 bytes versus 1,672,982,528 bytes before (44,580,864 bytes
smaller). One full export took 686.468 seconds; this is not a repeatable speed
benchmark. The catalog SHA-256 is
`09cdc2d28e5ab1c54e1090d5c2bb745ae08dddea7ed22e73095d649441b5a685`.
Its 75,242-record evidence overlay is 45,502,464 bytes with SHA-256
`01793fee42343aedaa3620540bc75a8c188014f143f4358ad536442847f0ad73`.
The existing popularity overlay SHA-256 is
`53c2aa8024f85d00115c08d014e43f56831ee88e0e81e15b66d2219d4c3e9337`.
`inspectBundle` passed host integrity, checksums, and catalog/evidence identity.

Validation: the shared test suite passed 105 tests and skipped two opt-in
stress tests; the independent brute-force oracle checked 256 eight-chord
inputs. The focused Android `Aural*` JVM tests and both Debug APK builds
passed. The updated Pixel 7a test against the older v3 bundle passed (1 test,
23.311 seconds), confirming legacy filtering and source lookup. On that single
device run, discovering groups took 7,884 ms, the first 30 rows in one
four-chord/start-I bucket took 489 ms, and the second page took 147 ms.
The rebuilt full bundle and matching evidence/popularity files were installed
in the Pixel 7a app-private directory using verified, resumable chunks; the
active SHA-256 checks matched the three host checksums above. The validated
Debug app and instrumentation APK were installed, and the app was relaunched.
Against snapshot `dbbac5ef03ceec5e8d5e0f5b04e68e8a9ac968a44cf0b848fbea9cd44d5c8c2f`,
`AuralCatalogDeviceTest#loopReductionFiltersPagesAndPreservesOriginalLookup`
passed (1 test, 21.778 seconds), as did
`#exhaustiveCatalogRanksAndResolvesOfflinePassages` (1 test, 15.85 seconds).
One rebuilt-bundle run measured 7,281 ms to discover groups, 478 ms for the
first 30 rows in the same four-chord/start-I bucket, and 144 ms for the next
page. These are single-run diagnostic measurements, not a performance claim.
The phone had 2.5 GiB free afterward. Human visual review of grouping, loop
removal, recursive expansion, Review, and chord borders remains pending. The
Mac is unreachable, so iOS Swift/simulator checks remain pending in
`docs/porting-plan.md` on `codex/ios-aural-quiz-port`. No remote push or store
release occurred.

## Longest-first catalog browsing and bounded practice header — 2026-09-25

The catalog UI now presents sequence-length groups from longest to shortest.
When Starting chord is primary, its length subgroups use the same descending
order. Ranking within each exact bucket and loaded pages is unchanged. An
existing saved scroll index is migrated once to the active group's header so
the reversed order does not restore the user to an unrelated position.

The practice screen caps the named progression heading at two lines, with a
**Show full progression** control for longer sequences. Expanded text scrolls
within a bounded header, keeping the activity tabs and Songs entry reachable.
Independent exercise content and source passages are unchanged. The user
reported the issue with a 129-chord source progression on the Pixel 7a.

Validation: `AuralQuizUiTest` had 15 prior tests pass and one new test fail
because its expand control relied only on a layout-overflow callback. After
making the control explicit for long sequences, the focused UI test and both
Debug APK builds passed (`aural-long-title-recheck`, 71.4 seconds). The app and
instrumentation APK were installed on Pixel 7a `3C081JEHN14930` with app data
preserved; `AuralCatalogDeviceTest#longProgressionHeaderDoesNotHideSongTab`
passed (1 test, 1.851 seconds). The installed full catalog checksum remained
`09cdc2d28e5ab1c54e1090d5c2bb745ae08dddea7ed22e73095d649441b5a685`.
The app was relaunched. Human visual review of the 129-chord case and both
grouping priorities remains pending; no screenshot was taken. iOS source
parity is documented in `docs/porting-plan.md` on the iOS worktree and still
needs Mac validation. No remote push or release occurred.

## Minimum song-popularity filter — 2026-09-25

The Aural Quiz catalog now has a 0–100% minimum song-popularity slider,
defaulting to **80%** for new browsing state. It is a hard inclusive cutoff
on the overlay's normalized song score, separate from **Prefer popular songs**
(which only changes ranking). Unscored, nonfinite, and out-of-range scores
do not qualify, including when the cutoff is 0%. The full overlay currently
has 5,192 of 25,977 scored songs at or above 80%.

Ranking pages and recursive children include only progressions supported by
at least one qualifying song. Displayed song, section, and occurrence counts
reflect that subset; full-corpus coverage evidence remains unchanged. The
Songs tab and new practice-source selection use the same cutoff. Existing
restored exercises and other non-catalog callers keep their original sources.
The selected percentage persists across app launches; changing it invalidates
the catalog query and loaded pages. The later filtered-group change below hides
categories without a qualifying sequence.

Validation: the focused `AuralPatternSongTest` and both Debug APK builds
passed (`aural-popularity-android-recheck`, 37.5 seconds) after one Kotlin/
Compose API correction. The Debug app and instrumentation APK were installed
on Pixel 7a `3C081JEHN14930` without clearing app data. The focused
`AuralCatalogDeviceTest#popularityCutoffFiltersRowsSongsAndChosenSource`
passed (1 test, 23.424 seconds), as did the existing Songs-to-Playback/draft
test (1 test, 29.986 seconds). Active catalog and popularity overlay hashes
remained unchanged. The app was relaunched. A 385-chord group starting on V still has catalog
ranges, but none of its songs meet a 90% cutoff. The pager treated that empty
result as a failed load (`NoSuchElementException`, shown as “Could not load
this group”). It now returns no rows, and the group shows the no-matches
message. On Pixel 7a `3C081JEHN14930`,
`AuralCatalogDeviceTest#emptyLongStartGroupWithPopularityCutoffLoadsWithoutError`
passed against that installed catalog. A later instrumentation reinstall removed
the private catalog. The same snapshot, evidence, and popularity files were
restored, and the device checksums again matched
`09cdc2d28e5ab1c54e1090d5c2bb745ae08dddea7ed22e73095d649441b5a685`,
`01793fee42343aedaa3620540bc75a8c188014f143f4358ad536442847f0ad73`, and
`53c2aa8024f85d00115c08d014e43f56831ee88e0e81e15b66d2219d4c3e9337`.
Human visual review of the slider
and a high-cutoff no-results state is pending. iOS source parity is recorded
in `docs/porting-plan.md` on the iOS worktree; Mac tests are unrun. No remote
push or release occurred.

### Empty-group load fix — note for the continuing agent, 2026-09-25

Worktree `H:/Desktop/Acquiring/Acquiring-aural-mode-analysis`, branch
`codex/aural-mode-analysis`. Still uncommitted on top of `0c9b4917`. The
popularity-slider edits and this fix are in the same dirty tree. Do not
commit unless asked.

Reported failure: with the minimum song-popularity slider at 90%, the longest
catalog group (385 chords) → **Starts with V** showed “Could not load this
group.” `groupedBuckets` still lists that leaf (`385|natural:5:upper:major:none`)
because group discovery does not apply the cutoff. `Ranking.page()` then
pulled catalog ranges, `add()` skipped every range because no suffix rank in
them met 90%, the heap stayed empty, and `heap.remove()` threw
`NoSuchElementException`. The screen catch turned that into the load error.
Eligibility itself succeeded: 317,603 of 4,249,822 ranks qualify at 90%.

Fix, in `AuralCatalog.Ranking.page()`: after `refineFrontier()`, if the heap
is empty, stop and return the rows gathered so far. The existing empty-state
text then applies: “No matching sequences with songs at 90% popularity or
higher.” Temporary device logs used to catch the exception were removed.

Device test added:
`AuralCatalogDeviceTest#emptyLongStartGroupWithPopularityCutoffLoadsWithoutError`.
It opens the installed catalog, takes the longest length whose start label is
V, pages that bucket at 90%, and requires a non-throwing empty page with
`hasMore == false`. It passed once on Pixel 7a `3C081JEHN14930` while the
catalog was still present. A later `connectedDebugAndroidTest` install removed
`com.acquiring.android` private files, so a repeat of that test failed with
`aural-catalog.db` missing. The catalog was restored with
`tooling/aural-corpus/install-android.mjs` from
`Acquiring/acquiring_data/aural-catalog-loop-full/` plus
`popularity/listenbrainz/full-pop-7a28550b0605de8f29218df622586aa8e1ea6aca963949852a6fe896a5cdaef9-popularity.db`.
Device checksums matched the three hashes in the paragraph above. The debug
app is installed again and was launched. App data from before that reinstall
is gone; only this restored bundle is on the phone.

Retest on the Pixel, with data retained:

1. Open Aural Quiz. Set Minimum song popularity to 90%.
2. Open the top length group (385 chords), then **Starts with V**.
3. Expect the no-matches sentence. “Could not load this group” must not appear.
4. Lower the slider until a populated length group shows rows, and confirm a
   normal group still loads.

Do not run another `connectedDebugAndroidTest` until you know that Gradle
install will not uninstall the app. The one-method command that passed, from
`android/` with `ANDROID_HOME` set, was:

`python scripts/compact_check.py --name aural-empty-v-group -- .\gradlew.bat connectedDebugAndroidTest "-Pandroid.testInstrumentationRunnerArguments.class=com.acquiring.android.AuralCatalogDeviceTest#emptyLongStartGroupWithPopularityCutoffLoadsWithoutError" --console=plain`

Before running it, confirm `run-as com.acquiring.android` can see
`files/aural-catalog.db`. After it, confirm that file is still there. Human
visual review of the slider and the empty state is still open. iOS parity
remains in `docs/porting-plan.md` on `codex/ios-aural-quiz-port`. No push or
release.

## Prepared Android catalog and filtered groups — 2026-09-27

The Aural Quiz index remains a prebuilt offline database. Once the home screen
draws, Android opens the installed catalog on an I/O thread, prepares the saved
search/grouping/popularity view, and shares that reader across Quiz visits for
the app process. An early Quiz visit joins the same load. Validated bundle
replacement waits for active Quiz readers to finish, then invalidates and
rewarms the cache. An unchanged published bundle does not invalidate it.

Primary length/starting-chord families and their leaf subgroups now appear
only if a retained progression has at least one song meeting the active
analysis, chord search, and minimum popularity. Both grouping priorities use
the same discovered buckets. A global no-results message appears if all
groups are filtered out. Catalog ranges and recent group results are cached
per installed reader; sparse suffix eligibility uses bounded constant-time
range checks. Older catalog schemas continue to apply native loop reduction.
The earlier empty 385-chord V group at 90% is now hidden in the UI, although
the underlying pager still safely returns an empty page to legacy callers.

Focused JVM tests passed for shared loading/replacement, batch boundaries,
exact bucket membership, and sparse range checks. Debug and instrumentation
APKs built. On Pixel 7a `3C081JEHN14930`,
`AuralCatalogDeviceTest#warmCatalogReusesReaderAndHidesUnmatchedGroups` and
`#popularitySongDelegatesToTheHostAndKeepsTheQuizDraft` each passed (one test
per run). The full-catalog run measured 5,200 ms for background reader
preparation, 2 ms for reuse, 9,867 ms for first group discovery, and 2,332 ms
for an 90%-to-80% cutoff change. Those are single device measurements, not
latency percentiles. Both APKs were installed without clearing app data; the
catalog, evidence, and popularity checksums remained identical to those above.
Human visual review of groups after filtering is pending. iOS warmup work is
outside this Android-first change; the Mac validation gate is unchanged.
These changes remain uncommitted alongside the earlier popularity work in
`codex/aural-mode-analysis`.

## Global frequency-first catalog — 2026-09-28

The default Aural Quiz browser is now ungrouped and orders retained progressions
by the number of distinct supporting songs across the full installed catalog.
Ties use total occurrences, then longer length, then stable structural ID. The
80% minimum song-popularity filter and other search criteria decide which
progressions and examples qualify, but do not change those global sort counts.
The visible Sort control also offers Recommended (the prior adaptive score),
Longest, and Shortest. Optional grouping offers Length first or Starting chord
first; pagination, recursive subsequences, and subgroup Review remain available.
The former Flat list setting is labeled Show subsequences with the inverse
on/off presentation. Existing saved browser settings migrate to the new global
default once; subsequent explicit sort/group choices persist.

The shared catalog exporter adds frequency-oriented indexes without changing
schema v3. Focused Node catalog/export tests passed (7 tests). Android
the focused UI test and both Debug APK builds passed after the final
valid-song correction. The final full `:app:testDebugUnitTest` rerun passed
(483 tests, 2 skipped; 85.3 s). Its first run exposed two fixture catalogs
without the real `catalog_song` table; those fixtures were corrected before
the passing rerun. The new 60-row Pixel pagination test passed on the
indexed full catalog, including exact global/matching song counts for its first
eight rows. Pixel 7a `3C081JEHN14930` also passed the default ungrouped-list
UI test (1 test, 25.757 s) and the app was relaunched. Single-run device
timings for the indexed bundle: catalog reader initialization 9,287 ms,
first 30 ranked rows 948 ms, second page 280 ms. These are not percentiles.

The full schema-v3 bundle and matching evidence were rebuilt and validated:
snapshot `64cfa299cc740dd9a1daf2cefc837bf1db80be9b2caa00626f674ea04b0c2243`,
17,272,900 retained sequences, catalog SHA-256
`561ee85ecdc26448d0b5bac754a762cce3c4f040100c211c948b649e7a224982`,
evidence SHA-256
`e905eb8b6700a31fc79c7a234949df14cb7d7290334ea4f9be505c7fcfb4ccd3`.
The existing popularity overlay SHA-256 remains
`53c2aa8024f85d00115c08d014e43f56831ee88e0e81e15b66d2219d4c3e9337`.
All three host/device checksums matched after installation; app data was not
cleared. The source cache contains 122 run song IDs absent from `catalog_song`;
native ranking now excludes those IDs so displayed support matches available
example songs. Catalog range bounds remain conservative.

The Android/shared worktree is still dirty on `codex/aural-mode-analysis` at
`0c9b4917`, together with earlier in-progress changes. No commit, push, merge,
or release was performed. iOS source parity is in the separate dirty
`codex/ios-aural-quiz-port` worktree; Mac tests and simulator validation remain
pending as recorded in `docs/porting-plan.md`. Human review of sort clarity,
group navigation, and long-list performance on both platforms remains open.

## Android Aural Quiz browse controls — 2026-09-28

The Android catalog now uses one scrolling page for chord search, Analysis and
Sort dropdowns, and results. The default search chips show concise Roman
numerals and wrap to new lines with their arrows. Chord edit controls wrap,
remain scrollable on small displays, and have named reorder actions. The
expanded **More browsing options** panel contains minimum core length, song
popularity, grouping, Show subsequences, and inversion matching; its collapsed summary reports
active choices. Example preferences now contains only next-song selection
preferences. Analysis gaps is reached from the Quiz information dialog.
Existing search, sort, grouping, and popularity settings retain their stored
identifiers. Minimum core length defaults to two chords, accepts 2–9999, and
is saved with browse settings. It filters top-level progressions and group
availability; recursive children can be shorter than the core. The prior
saved browse path is migrated at the default minimum. The LazyColumn migration
offsets the prior saved result index by one to account for its new control
header. The panel's expansion survives rotation and practice navigation via
saveable state.

Focused `AuralQuizUiTest` and `AuralProgressionQueryTest` passed with both
Debug APK builds. On Pixel 7a `3C081JEHN14930`, the new default catalog
control/result test passed again (one test, 25.801 seconds), including sort-menu
selection, grouping changes, minimum core length 2→3, and the expanded
options. The full catalog frequency test passed (one test, 20.082 seconds),
including a minimum-four-chord page whose rows all met that threshold. The
legacy three-chord outline expansion test now passes with an isolated browse
state and common `I` starting subgroup (one test, 30.564 seconds). The earlier
failure also exposed a real lazy-list update bug: its expansion icon collapsed
but the child row remained; moving visible-row calculation into observed
Compose state fixed that. Subgroup headers now report loading, errors, and
loaded-row counts. The app was installed without clearing its catalog. Human
review of narrow width, large text, and visual spacing is still pending; no
screenshots were taken. No commit, push, merge, or release was performed.

## Merged Android catalog work — 2026-09-28

The complete Android Aural Quiz catalog series was fast-forwarded from
`codex/aural-mode-analysis` into `main` and published to `origin/main` at
`ee37a31293cd1ea1b9c9c67165c2c9e1279a8d22` (**Complete Aural Quiz catalog
browsing controls**). The branch contained the prior six catalog commits plus
that validated final checkpoint. The full Android JVM suite and both Debug APK
builds passed at the final checkpoint; the affected Node catalog/export tests
passed 7/7. The separate iOS worktree remains unmerged and its Mac validation
gate is unchanged. The Android worktree registration and local feature branch
were retired after confirming reachability. Windows left a non-Git residual
folder at its former path because of a path-length deletion error; it was left
untouched rather than force-deleting filesystem contents.

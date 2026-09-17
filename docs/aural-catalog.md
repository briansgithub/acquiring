# Aural Quiz catalog: Android human-testing release

Updated 2026-09-17. Implementation route: offline Node/SQLite, Python streaming import, native Kotlin/Compose; runtime model identity unknown. No model inference or provider calls run in the app. This document supersedes the six-family catalog and unavailable-popularity limitations in the earlier implementation handoff.

## Access and behavior

Open **Aural Quiz** from the home screen. After the offline catalog loads, search Roman labels or filter by chord count. Tap a progression to practice its whole sequence in **Recognize**, **Recall**, or **Sing**. The guided course remains available; **Review** chooses weaker/due targets from the currently loaded catalog results. Named progression practice is supported practice because selecting the progression already reveals its identity.

The shared settings panel includes five controls. Popularity, variety, and favorites affect both ranking and eligible-song selection. Inversions change sequence identity/counts. Flat list defaults off and shows every matching sequence once across pagination. Tree mode orders roots and siblings by the same score; each expansion removes one endpoint, never an interior chord. A shared subsequence can appear under multiple parents with identical global counts. Each view retains its own scroll state; filters, loaded pages, and expanded nodes survive the Playback round-trip. Information buttons expose detailed evidence. Analysis gaps list uncertain source passages and their diagnostics; these are not silently graded.

Song title, artist, and section appear immediately. **Open in Playback** loads that exact offline section, highlights the passage, and offers passage looping/full-section exploration. **Return to quiz** and Android Back restore the current question and draft. Exploring Playback marks the attempt assisted. Source loading failures retain the quiz. Persisted source revision, snapshot, seed, target, response, phase, exposure, and assistance restore an interrupted Playback round-trip after process recreation. Quiz audio and microphone activity stop during navigation.

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

`catalog-export.mjs` defines SQLite schema `aural-catalog-1`. Gzip source sections and runs are portable UTF-8 JSON. `catalog_array.suffix_locations` stores little-endian signed int32 `(runId, offset)` pairs. `catalog_range` records suffix bounds, implicit length endpoints, support, and a ranking bound. `catalog_suffix` indexes original endpoints for occurrence retrieval. No mining runs at quiz time. The evidence database must match the catalog snapshot; popularity is independently versioned. iOS can consume these same artifacts but still needs a Swift reader and native UI.

The existing normalized cache reprocesses changed sections; global discovery, coverage, and ranking are rebuilt from that cache. Current catalog snapshot hashes include source database bytes and producer code, so SQLite file reorganization can produce a new snapshot even without musical changes; structural IDs remain stable. This release does not implement incremental suffix-array mutation. Periodic clean/incremental normalization comparisons remain the validation route.

Artifacts are immutable, checksummed, and excluded from Git. `install-android.mjs` checks host SQLite integrity and catalog/evidence identity, stages and verifies device checksums, stops the app, then atomically replaces each database without resetting preferences/progress. Evidence checks protect against mixed snapshots; popularity is independent. Installation is not a multi-file transaction. Store asset delivery or an in-app downloader is not configured; this testing release is provisioned over ADB.

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

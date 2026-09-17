# Aural corpus implementation

## Accepted scope and sequence

Build an independent offline index from original playback-cache sections, then integrate it into Android Aural Quiz. The old progression index supplies no data and is not modified. iOS will consume the same SQLite/JSON contracts and deterministic selection fixtures; native iOS implementation is deferred.

Normalize keys while preserving quality, applied/borrowed harmony, modifications, boundaries and uncertainty. Keep grouped-inversion and bass-sensitive views, collapse identical adjacent harmonic identities with original event spans, and give physical transitions stable location IDs plus source revisions. Mine all recurring contiguous lengths and overlapping occurrences using suffix intervals; never remove covered input. Coverage is union of transition IDs and separately union of contained windows at every length. Two-chord windows cannot concatenate into longer coverage. An 80% coverage pass is followed by an independent longer-structure pass; retain candidates/evidence independently of educational family mappings.

Secondary dominants are applied harmony: preserve both numerator and temporary target (e.g. V/V), chord quality/extensions and analysis certainty. Do not infer applied function from pitches alone or merge it with a differently analyzed II chord. Transposed realizations share the same functional pattern. No fifth settings toggle is needed: prerequisites and the selected learning target govern eligibility, and unrelated passages must not introduce untaught applied harmony in their surrounding context.

Export immutable versioned analysis snapshots, reusable normalized cache, compact discovery index, occurrence provenance, selected statistics and runtime song/section occurrence groups. Re-normalize changed sections and rebuild global discovery/ranking. Keep source databases read-only and generated artifacts under the ignored data root. Compare incremental builds with clean builds and compressed mining with a brute-force oracle.

Popularity is an independent, versioned enrichment pipeline. Soundcharts is the initial provider candidate, contingent on credentials and suitable storage/redistribution rights; no purchase is authorized. Implement fixture/import support and a deterministic 500-song pilot with match-confidence, coverage, accuracy, throughput and cost reporting. Default score is 80% enduring reach and 20% recent activity; preserve missing measurements and confidence rather than inventing ranks. Live enrichment may remain unavailable without blocking the musical index or Android.

Android selects target first, then eligible song, section, occurrence. Preserve existing family/skill mastery, source familiarity, assistance, audio settings and explicit singing targets. Use a synthetic example for the same target when no eligible corpus passage exists. The four quiz-specific toggles are Prefer popular songs (on when available), Keep examples varied (on), Favor my favorites (off), Distinguish inversions (off). Shared app settings remain accessible. Persist source, snapshot, target, seed, transformation, selector/generator version and effective settings. No answer disclosure before grading. Fixtures and deterministic random sampling must be portable to Swift.

Validation includes musical edge cases, exact overlap coverage, no stopping discovery at 80%, deterministic updates, sampling bias, popularity missing data, fresh vs supported exercises, Android tests/build and attached Pixel 7a checks. No screenshots or store release. Finish with human musical/usability checklist and accurate limitations.

## Preparation checkpoint — 2026-09-17

Primary checkout: `H:/Desktop/Acquiring/Acquiring`. Existing work was saved as `22b5d2f7` (frame-rate fixes), `8de0b3fa` (consolidated Aural Quiz and shared sound settings), and `08689303` (existing icon/helper). The working tree was verified clean before switching from main to `codex/aural-corpus-index`. No existing branches/worktrees were removed. The battery diagnostic was checksum-preserved at `.artifacts/preparation/2026-09-17/battery_stats_export.txt`.

Validation: `python scripts/compact_check.py --name preparation --keep-success-log -- gradlew.bat testDebugUnitTest --tests 'com.acquiring.android.Aural*' --tests 'com.acquiring.android.TimelineFrameRate*' assembleDebug --console=plain` passed (43.2s). Existing iOS changes are saved but cannot be compiled in this Windows environment. No remote push occurred.

Concurrent implementation will use separate sibling worktrees, based on this checkpoint, with named ownership. Primary integration owns normalization, export, full-corpus verification and final integration. Algorithm, popularity and Android work are separately bounded. Existing unrelated worktrees remain untouched. Next action: implement and validate the offline contract before enabling corpus examples on Android.

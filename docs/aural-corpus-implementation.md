# Aural corpus implementation

> 2026-09-17 update: the exhaustive catalog, populated MusicBrainz/ListenBrainz popularity, and offline quiz–Playback round-trip are now implemented and installed for Pixel 7a testing. See [current catalog design, results, commands, limitations, and checklist](aural-catalog.md). Earlier six-family scope, four-toggle, source-provider, and unavailable-popularity statements below are historical checkpoints, superseded by that document.

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

## Human-testing handoff — 2026-09-17

Implementation is complete for the agreed Android-first testing scope. Source checkpoint: `9aeeb3e6` on `codex/aural-corpus-index`. All agent changes are merged; their worktrees remain preserved. No remote push, store release, iOS build, or old-index migration was performed. See [offline design and commands](aural-corpus-offline.md) and [Android integration](../android/docs/aural-corpus.md).

The full source scan matched 41,099 song folders against a 42,194-song catalog and read 77,772 sections. Two folders could not be resolved to catalog identities. The report retains missing/unsupported/uncertain-source diagnostics. Coverage describes observed transitions in available sections; unavailable catalog material has no invented transition count.

| Measurement | Inversions grouped | Bass-sensitive |
|---|---:|---:|
| Observed transitions | 922,287 | 954,050 |
| Covered transitions | 741,942 | 763,448 |
| Conservative coverage | 80.45% | 80.02% |
| Selected patterns | 37,241 | 38,001 |
| Retained in the longer-structure pass | 33,635 | 29,440 |
| Longest selected progression | 68 chords | 82 chords |
| Valid 3-chord window coverage | 65.41% | 57.08% |
| Valid 4-chord window coverage | 45.62% | 36.94% |

Discovery produced 322,935 candidate descriptors plus implicit length ranges; selection retained 75,242 patterns. The 80% result is a transition-coverage result, not a claim of 80% coverage at every sequence length. Android continues to teach six reviewed families and 15 variants. Newly discovered structures are evidence for subsequent musical grouping, not automatically created curriculum families.

Final immutable snapshot: `2130df33974ddbdc498093ec49c15661bc01684a715e098dc2ac778dc4e62db8`, under `acquiring_data/aural-corpus/snapshots/`. `latest.json` points to it. It contains 171,450 runtime occurrences from 13,773 songs. Artifact sizes: runtime 459,341,824 bytes (438 MiB); analysis 4,341,329,920 bytes (4.04 GiB); report 403,321,364 bytes. The large analysis/report remain offline. The original multi-GB progression index was neither read nor modified.

The final covering-index export reused the verified inputs of snapshot `3981e67955383a0dd8ba73aa551e6f0024cec807b852cbb9c93f0f2300ef818b`. Its complete discovery/selection/export took 213.8 seconds with approximately 3.89 GiB peak RSS on this machine. The earlier full scan/build took 852.4 seconds, including 52,232 newly normalized and 25,540 reused sections. Cold source-file scans remain disk-intensive. Frozen-input mode avoids those scans for exporter-only revisions; normal updates must scan for source changes.

Validation performed:

- `node --test tooling/aural-corpus/*.test.mjs`: **85 passed**, two opt-in stress tests skipped in this final run. Tests cover brute-force musical/overlap oracles, supersession, independent per-length coverage, source edits/deletions, reproducibility, corrupt snapshots, popularity/rights/missing data, unbiased hierarchy, overlap familiarity, and portable selector fixtures.
- From `android/`: `python scripts/compact_check.py --name aural-corpus-device-ready --keep-success-log -- gradlew.bat testDebugUnitTest --tests 'com.acquiring.android.Aural*' assembleDebug assembleDebugAndroidTest --console=plain`: **96 tests passed**, both APKs built (40.6 seconds). The added native corpus instrumentation test then compiled through `assembleDebugAndroidTest` (4.8 seconds).
- `adb -s 3C081JEHN14930 shell am instrument -w -r -e class com.acquiring.android.AuralQuizDeviceTest com.acquiring.android.test/androidx.test.runner.AndroidJUnitRunner`: **2 passed**, covering playback completion, mode transitions and cancellation against real device audio.
- The equivalent command with `AuralCorpusDeviceTest`: **2 passed on the final snapshot**, all 15 targets served in both views; a source V→I passage completed through native audio in 3,593 ms at 96 BPM. Thirty target lookups measured 84 ms median and 776 ms maximum. A previous non-covering index measured 1,067 ms maximum; timings are device observations, not latency guarantees.
- Full persisted-index V→I lookup through `runQueryCli`, without mining: 19,037 occurrences / 7,495 songs, with exact source revision, original event indices/beats and one physical transition ID. The final snapshot reproduced the earlier pattern and occurrence IDs exactly. Full-index hydration took 15.5–19.1 seconds / approximately 4.1 GiB peak RSS. Runtime SQL integrity and target covering-index checks passed.
- Final runtime SHA-256 matched the installed Pixel file: `37a285a7186c59e577266d96fd28314b758006ce6a62eb0f433dc1a15d568eab`. Debug APK SHA-256: `5cbb642bcfbf9898a1b5e1719a39131b6668f64ba628a912b0082476e4c93311`; instrumentation APK: `c2be9afc589bc6767fc44d3e7e640816ee6eb91bff5cae6ab0748e4f279a2a7f`.

The four example controls are implemented. Popularity remains unavailable because no verified provider observations were supplied; the deterministic 500-song pilot manifest and import/scoring/report tools are ready. Song prevalence, song popularity and section popularity remain separate. Favorites use the existing playlist. Source familiarity survives transformations and overlapping passages; supported practice never becomes fresh mastery through hints, reuse, failed audio starts or damaged exposure history. No accidental pre-grading answer disclosure was found by tests and UI review; named progression practice is intentionally supported.

Remaining limits and next action:

- Pause for human testing. Review new pattern-to-family assignments musically before expanding the curriculum beyond the current major-triad/applied-dominant bindings. Unsupported/ambiguous material stays in diagnostics or outside runtime eligibility.
- Source chords are synthesized, with source beat ratios and supported bass preserved. Repeated identical attacks collapse to sustains; tonic context is synthetic and tempo/register follow quiz settings. Human ears must judge whether these transformations teach the intended relationship.
- Cold target selection is synchronous and can approach a second. Assess responsiveness before broader deployment. Large reports/full offline hydration also need a more compact or streaming representation if the corpus grows substantially.
- Production download/update delivery is not implemented; this release was provisioned through ADB. Preserve immutable snapshots for selection replay. User progress was not cleared by instrumentation or installation.
- No live popularity provider request or purchase was made. Audit identity matches, coverage and redistribution terms before importing production weights. No trustworthy section-popularity data currently exists.
- SQLite/JSON contracts and deterministic fixtures are shared with future iOS work; native Swift UI/session/audio/microphone integration and Apple-platform validation remain pending.

### Short human validation checklist

1. Listen to several examples in each family. Check chord quality, applied harmony, inversions and section boundaries against the displayed source after grading.
2. Try recognition, recall/audiation and singing. Check tempo, octave, silence, smooth transitions, and the distinction between root and bass targets; test uncertain microphone capture in a real room.
3. Try the four settings, Favorites, repeated practice and unfamiliar examples. Confirm variety and supported-versus-independent feedback feel understandable; popularity should show unavailable until data is supplied.
4. Relaunch, switch modes during playback, and return to prior practice. Confirm progress persists, answers stay hidden until appropriate, and cold question loading feels acceptable.

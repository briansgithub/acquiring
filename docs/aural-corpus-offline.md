# Aural Quiz offline corpus pipeline

The pipeline builds a new musical index from cached song sections, independently of the old progression database. It never reads or modifies `progression_index.db`. Production selection uses the runtime SQLite export; mining and popularity enrichment run offline.

## Run an analysis

Use **Node 24 or later**, including its built-in `node:sqlite`. SQLite may print an experimental-feature warning on Node 24. The pipeline does not require the native `better-sqlite3` package. Run commands from the repository root.

```powershell
npm run aural:build -- --limit 100
npm run aural:build
```

Defaults resolve through the existing data-root configuration: catalog `catalog/hooktheory_catalog.db`, input `playback/.hooktheory_cache`, and output `aural-corpus`. Explicit paths are supported:

```powershell
npm run aural:build -- --catalog "acquiring_data/catalog/hooktheory_catalog.db" --cache-root "acquiring_data/playback/.hooktheory_cache" --output "acquiring_data/aural-corpus"
```

Options include `--min-songs 2`, `--structure-min-songs 5`, `--target-coverage 0.8`, `--normalized-file`, and `--popularity-file`. The npm build command allows an 8 GiB JavaScript heap; this is a ceiling, not a predicted memory requirement. Builds print progress, source/cache counts, artifact sizes, elapsed time, and peak RSS. Record measurements for the actual machine and corpus.

`--limit N` selects the first N source folders in deterministic order. It is a development sample, not a representative statistical sample. Partial builds use `normalized-N.db` and `latest-sample-N.json`; full builds use `normalized.db` and `latest.json`. A cache rejects a change of source paths or limit, preventing a sample run from deleting the full cache's rows.

Inputs stay read-only. The mutable normalized cache reuses unchanged sections, replaces changed sections, and removes deleted/conflicting sections. Discovery, global statistics, and selection are rebuilt from the cache. A changed normalizer version or fingerprint of its transitive static imports invalidates normalization reuse, including shared theory changes. Semantic contract changes should also bump the normalizer version. The rebuildable cache uses SQLite WAL with normal synchronization; interrupted work is rescanned before publication.

Snapshots live under `snapshots/<snapshotId>/`. Their identities include source revisions, catalog metadata, rejected-source diagnostics, configuration, code/schema fingerprints, family mappings, and popularity inputs. A complete build writes checksums and publishes its pointer only after staging finishes. Repeated identical builds verify and reuse the existing snapshot. Interrupted staging directories are not published. Preserve old snapshots needed by saved exercises; rollback means selecting a previously validated snapshot, not editing its contents. Generated databases and reports belong under the ignored data root.

For an exporter/index-only revision, `--reuse-snapshot-inputs "<snapshot directory>"` explicitly reuses that snapshot's frozen input set. It verifies the report checksum, normalization dependency fingerprint, catalog hash, cache scope, and every cached section ID/revision/version before rebuilding discovery and artifacts. It does **not** incorporate later raw-source edits; omit it for a corpus refresh. This avoids a costly source-file scan when only the runtime schema changes. The normalized cache is trusted generated data: manually editing cached payloads without updating their revisions is unsupported.

## Musical and statistical meaning

### Source normalization

Canonical catalog URLs/slugs establish song identity. Source-section IDs preserve distinct sections, including repeated section names. Duplicate aliases are deduplicated; conflicting versions are quarantined with diagnostics.

Structured tokens preserve mode, functional root, quality, supported extensions/alterations/suspensions, applied harmony, and borrowing. The key is resolved at each chord. Unsupported keys, ambiguous interpretation, conflicting key declarations, invalid/overlapping timing, rests, gaps, modulations, and unresolved pedal/alternate harmony break mining runs. They are not bridged by deleting events. The normalizer uses validated shared theory code and retains the original data for review.

Two views are measured independently:

| View | Meaning |
|---|---|
| `harmony` | Inversions share a harmonic identity |
| `harmony_bass` | Inversion and bass interval are part of identity |

Consecutive identical tokens collapse within each view, retaining original event spans. Source-position transition IDs identify each eligible physical harmonic change; repeated locations have different IDs. Pattern identity depends on normalized token content and version, not frequency or corpus-local dictionary ranks. Section content revisions prevent saved references from silently substituting edited content.

### Recurrence and coverage

Generalized suffix-array/LCP discovery retains overlapping contiguous matches and has no configured maximum progression length. Shared suffix intervals represent implicit length ranges, avoiding one expanded row per substring. Default recurrence requires two distinct songs. Within-song repetitions contribute occurrence counts, not extra song support. The current index uses 32-bit positions and fails explicitly if that capacity is exceeded.

Coverage always uses unions:

- **Transitions:** a shared physical edge counts once across all occurrences and patterns. Sharing an endpoint chord does not imply sharing an edge.
- **Length-k sequences:** count actual k-chord windows contained in selected occurrences. Longer occurrences can contain shorter windows; short patterns cannot be concatenated to claim a longer window.
- **Views:** grouped-inversion and bass-sensitive denominators are separate.

Eligible coverage divides by transitions in valid normalized runs. Conservative observed coverage also includes possible transitions adjacent to uncertain/timing-invalid events and unmineable key changes. Explicit rests and known gaps do not invent adjacency. Missing/rejected source sections have availability diagnostics; their unknown contents cannot be assigned an invented transition count. Sequence-length denominators describe valid normalized runs, not unknown material.

Selection first pursues 80% of the conservative observed transition denominator, then independently retains useful recurring longer structures. Failure to reach 80% is reported; it does not justify dropping uncertain material or changing the denominator. Discovery never removes covered input or stops at the threshold.

The base ranking is `log2(1 + songs) × log2(1 + effectiveOccurrences) × log2(length)`. Effective occurrences cap non-overlapping uses at four per song **for ranking only**. The coverage pass adds marginal edge and same-length window gains. The longer-structure pass defaults to five-song support and can select zero-edge-gain patterns that add longer windows. An optional programmatic usefulness multiplier defaults to one. Deterministic tie-breaking and lazy priority updates keep results reproducible. Supersession removes a short explanation only when all edge and sequence-length unions remain unchanged.

Discovery does not assign educational families. `contracts/aural-corpus/families.json` separately maps reviewed variants to the existing curriculum. The runtime exporter currently accepts matching playable major-key material and excludes unsupported or overly long examples. Therefore analysis coverage and active curriculum coverage are different measures; newly discovered long patterns do not automatically become quiz families.

## Artifacts and lookup

| Artifact | Contents and consumer |
|---|---|
| `analysis.db` | Offline runs, original source sections, compact suffix index, candidate descriptors, selected statistics and occurrences |
| `runtime.db` | App-facing metadata, eligible songs/sections, and indexed family/variant/view occurrences with playback payloads |
| `report.json` | Availability, uncertainty, selection, supersession, per-view coverage, and active-family coverage |
| `manifest.json` | Snapshot identity, schema/build versions, source hash, and artifact checksums |

`analysis.db` stores scalar pattern descriptors and little-endian 32-bit index arrays. Implicit recurring lengths can be queried even when no corresponding `progression_pattern` row was materialized. Selected-pattern statistics include occurrences, distinct songs, length, total/additional/cumulative transitions, repeated visits, redundancy, and per-length window coverage. A pattern omits lengths greater than itself: their additional coverage is zero and previous cumulative coverage remains unchanged. Final per-view reports contain every available sequence length. Family reports separate `discovered` counts and member-pattern union coverage from `runtimeEligible` counts after playback constraints.

```powershell
npm run aural:query -- --analysis "acquiring_data/aural-corpus/snapshots/<snapshotId>/analysis.db" --view harmony --chords '[{"root":5},{"root":1}]' --key '{"tonic":"C","scale":"major"}' --offset 0 --limit 20
```

The query API is `loadAnalysisIndex(file)` plus `lookupOccurrences({file, index?, view, tokens, offset, limit})`. Supply either a filename or an already loaded index. Results include exact pattern counts, deterministic suffix-rank pagination, original event positions/beats, section revision, transition IDs, and runtime-compatible occurrence/source IDs. Limits are 1–10,000 results per page. This offline API hydrates all runs/arrays and hash helpers in memory; reuse the loaded index for repeated queries. It does not re-mine. Android uses `runtime.db` target indexes instead.

Original sections are stored in `section_source(section_id, encoding, payload)` as `gzip-json`, including original chords, key metadata, source filename, and revision. Decompress the payload and take `chords.slice(startIndex, endIndex + 1)` to inspect the exact source passage, including collapsed repeated attacks. Normalized `run.positions` supplies the mapping back to these indices.

Runtime audio synthesizes interpreted source chords through app instruments. Source beat durations and supported inversions are retained; identical repeated attacks become a sustain. The current reference context is an explicitly labeled synthetic tonic. The nominal export tempo is 80 BPM; Android records its actual curriculum playback tempo separately. These choices require musical listening checks.

## Popularity enrichment

Popularity is independent of harmonic prevalence. **No live provider scores are bundled by this work.** Soundcharts is the initial provider candidate; live access and appropriate storage/redistribution rights remain external prerequisites. There are no automatic API calls or purchases.

```powershell
npm run aural:popularity -- pilot --catalog "acquiring_data/catalog/hooktheory_catalog.db" --output "acquiring_data/aural-corpus/popularity-pilot.json"
npm run aural:popularity -- import --input "provider-observations.json" --catalog "acquiring_data/catalog/hooktheory_catalog.db" --as-of "2026-09-17T00:00:00.000Z" --output "acquiring_data/aural-corpus/popularity-snapshot.json" --weights-output "acquiring_data/aural-corpus/popularity-weights.json"
npm run aural:popularity -- report --pilot "acquiring_data/aural-corpus/popularity-pilot.json" --snapshot "acquiring_data/aural-corpus/popularity-snapshot.json" --audit "human-match-audit.json" --output "acquiring_data/aural-corpus/popularity-report.json"
```

These outputs refuse overwrite; use new names for subsequent snapshots and an explicit as-of timestamp at or after provider collection. The deterministic pilot selects up to 500 songs, balancing available genre/decade strata and artists, with explicit unknown-metadata groups. The catalog may lack era/genre data; the pilot does not fabricate it.

Provider imports declare schema/provider/data versions, collection time, rights basis, recording IDs/version kinds, reviewed or exact-identifier matches, confidence, and dated measurements. Artist, title, and recording version must agree for a confirmed match. Ambiguous matches stay unranked. Comparable metric/unit/territory/time-window groups use tied percentile ranks; duplicate releases are not summed. The composite defaults to 80% enduring reach and 20% recent activity. Missing categories reduce confidence; fully missing/expired evidence yields a null score and neutral app weighting. Scores describe the fixed reference population, not a universal popularity scale.

Use the full snapshot for audits or the compact export for corpus builds via `--popularity-file`. Both carry validated rights/version/checksum provenance. Audit input is `{ "audits": [{"songId":"...","correct":true}] }`; optional measurement fields are `elapsedSeconds`, `apiRequests`, `costPerRequest`, and `currency`. Accuracy and cost remain null without actual inputs. Refresh defaults to monthly, with a configurable 180-day measurement-age limit. Section popularity remains neutral until trustworthy section-specific evidence exists.

## Android, settings, and iOS portability

The curriculum requests eligible family/variant/skill material before sampling. Selection groups **song → section → occurrence**; extra loops cannot inflate a song's probability. Missing pools fall back to the same synthetic learning target. The four controls are:

| Control | Default |
|---|---|
| Prefer popular songs | On when usable scores exist |
| Keep examples varied | On |
| Favor my favorites | Off |
| Distinguish inversions | Off |

Popularity/favorites/recency modify positive song weights. Supported sequences may deliberately reuse a passage; independent assessment prefers fresh eligible source material. Selector v2 recognizes positive overlap of physical transitions encoded by `song|section|start|end`; shared endpoint chords remain distinct, and opaque legacy IDs use exact matching. Changing key or voicing does not erase familiarity. Persist effective settings, selector seed/version, source/snapshot IDs, transformations, assistance, and actual exposure. Frozen v1 selection contexts remain replayable.

The Android reader accepts the provisioned `files/aural-corpus.db` runtime snapshot. Deployment/provisioning and device validation are separate from building the offline artifacts. The database schema, ASCII identifiers, unsigned xorshift32 behavior, and `contracts/aural-corpus/selection-fixtures.json` form the iOS contract. Swift still requires native UI, persistence, audio, and microphone integration.

The target index covers descriptor fields as well as family, variant, view, song and section, so candidate lookup avoids reading large playback payloads. Only the selected occurrence's payload is fetched. Cold target loading still needs usability review; the reader currently caches four targets and performs synchronous selection. Production distribution also needs an asset/update delivery path; development provisioning uses ADB.

## Validation and human review

```powershell
npm run test:aural-corpus
node --test tooling/aural-corpus/query.test.mjs
node --test tooling/aural-corpus/popularity-cli.test.mjs
```

The suite checks brute-force mining equivalence, arbitrary implicit lengths, overlapping coverage, conservative denominators, saturation followed by longer-structure discovery, supersession, source updates, deterministic snapshots, recurrence thresholds, popularity missing-data/rights handling, hierarchy bias, legacy replay, and shared native selector fixtures. Set `AURAL_CORPUS_BENCHMARK=1` or `AURAL_CORPUS_DIVERSE_BENCHMARK=1` to include the opt-in 40,000-song stress tests. Full-corpus metrics belong in the implementation handoff; synthetic benchmarks do not substitute for them.

From `android/`, run `./gradlew.bat testDebugUnitTest --tests 'com.acquiring.android.Aural*' assembleDebug --console=plain`, followed by the appropriate attached-device instrumentation checks. Tests/build commands listed here are repeatable instructions, not a claim that a particular revision has passed.

Human checklist:

- Check interpreted quality, applied/borrowed harmony, inversion, and section boundaries against representative source passages.
- Listen to synthesized passages, tonic references, tempos, gaps, and explicit root-versus-bass singing targets.
- Inspect unknown/uncovered material before interpreting the 80% figure or approving new family mappings.
- Audit song/provider identity matches and popularity ordering across genres, eras, and obscure material.
- Confirm variety, intentional reuse, familiarity grading, and the four settings behave understandably on device.

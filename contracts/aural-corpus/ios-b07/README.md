# B07 fixtures

`provenance.json` pins eight native source files at Android `3c887223`.
`loop-reduction.json` is copied unchanged from the fixture consumed by native
AuralLoopReductionTest. `identity.json` copies all 55 expected cases from the
retained successful Kotlin identity capture in the PWA. Its earlier capture
commit and file hash remain recorded; it is not relabeled as a fresh capture.

The v1-v3 bundles contain real gzip-compressed SQLite files, under 10 KiB total
compressed. `scripts/ios-port/verify-b07.py --generate` creates them from the
five label/score inputs in native AuralCatalogMatchingTest. This fixture adapter
sorts suffixes and expands unique ranges for the complete reader API, unlike
that test's deliberately unsorted bucket-only fixture. Keys differ deliberately
between analysis C major and source D minor in v2/v3. v1 omits source_key_json.
These are generated contract cases, not a downloaded published catalog.

Native source-derived expected cases include two I-V physical occurrences in
song0, and V-I in song0 twice plus song2 once. An 80% popularity cutoff retains
song0's two occurrences while global counts remain two songs/three occurrences.
The fixture mode column is uniformly major; mode-filter coverage needs further
cases. The Python verifier checks actual database bytes, hashes, SQLite
integrity, schema differences and these occurrence expectations. It also
recomputes identity outputs against captured Kotlin expectations. It does not
execute Swift or establish Swift parity.

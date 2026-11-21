# B07 Aural catalog package

Work in progress on `ios-port-aural-catalog`, based on `d574a8ad`.
Native authority is `3c887223b2d06b4c3a1010d0f8a23ceaf8977d08`.
The source hashes in `contracts/aural-corpus/ios-b07/provenance.json` were
checked against that commit and the working tree before implementation.

## Behavior map

| Native behavior | Swift | Check |
| --- | --- | --- |
| Unique-transition loop reduction and retained endpoint children | AuralAlgorithms.swift | Frozen native loop fixtures, AuralAlgorithmsTests |
| Inclusive rank eligibility across word boundaries | AuralAlgorithms.swift | AuralAlgorithmsTests |
| Pattern ID rolling UInt32 hashes over little-endian SHA words | AuralAlgorithms.swift | Native identity fixtures, further reader checks pending |
| Versioned consecutive chord query, exact root/inversion forms | AuralProgressionQuery.swift | AuralAlgorithmsTests, native AuralProgressionQueryTest cases |
| Start grouping by quality and seventh quality | AuralProgressionQuery.swift | Further catalog grouping checks pending |

## Verification and ownership

Swift tests are added but unrun. This machine has no iOS/Swift toolchain.
Fixture/source checks do not prove Swift parity. Actual CI will be recorded
when the package PR is opened. Runtime metadata supplied for the initial turn
reports GPT-6-Astra/high. Subsequent turn effort needs turn_context evidence.

Only new Aural-prefixed catalog files, dedicated tests/contracts and this
receipt/ledger belong to this batch. No application bootstrap, Settings,
navigation or playback integration is included. B07 is not app-visible until
the lead integrates the independent service. Earlier pending reviews remain
unchanged. No releases or PR52 adoption are authorized.

## Reader and installation implementation

The reader opens GRDB read-only, pages suffix bytes in 1 MiB blocks and run
identities in 2,048-row pages. It accepts v1-v3 and falls back to `key_json` for
v1 source keys. Run decoding rejects malformed gzip, trailing bytes, negative
Int32 coordinates and invalid positions. Physical occurrence IDs use original
chord indexes. Ranking preserves global ordering counts while displaying
popularity-filtered counts and capped non-overlapping effective occurrences.

Ranking pages scan precomputed ranges in 256-row blocks and retain at most
101 candidates. This intentionally uses a bounded frontier instead of native's
priority queue. It performs no mining but may be slower on full catalogs.
Full-catalog latency is unmeasured. Cancellation preserves page continuations.

The store uses the existing file-system boundary and GRDB. It streams real
URLSession downloads through gzip and SHA256, validates catalog/evidence
snapshot alignment and popularity's independent measurement metadata, then
opens the new reader before activation. Immutable generation directories and
an atomic `current.json` pointer prevent mixed active bundles after a crash.
An installation rejects concurrent installations with `busy`. Activation
rejects new leases with `busy` and waits for existing closure leases to finish.
Cancelled waits release the activation gate. Failed preparation/publication
keeps the prior reader and pointer. Old generation files remain available;
explicit disk reclamation is a future integration concern. One store instance
must own each directory. Do not retain readers beyond `withCatalog` closures.

The lead's mixed-case grouping finding is fixed: `iV` canonicalizes to `iv`.
Focused tests now consume captured native identity outputs and native grouping
quality/seventh cases. These tests remain unrun, not verified Swift parity.
The resumed session's actual `turn_context` at 2026-11-21T04:16:06.222Z reports
`gpt-6-astra`, `effort: high`, and this worktree's cwd.

## Resource limits and focused checks

Encoded suffix arrays are limited to 256 MiB, read in 1 MiB blocks. The current
Swift Int representation can use 512 MiB for decoded coordinates. Run metadata
is capped at two million rows; song/popularity dictionaries at 500,000 entries.
Run gzip payloads are limited to 2 MiB each, decoded tokens to 4,096 per run and
4,096 UTF-8 bytes per token. The FIFO run cache admits at most 64 runs and an
estimated 32 MiB of decoded payload. Swift object overhead is additional.
Statistics stream SQL occurrences ordered by run/offset instead of retaining
one tuple per occurrence. Song and section distinct-count sets remain bounded
by catalog identities. Occurrence pages contain at most 2,048 entries. Ranking
pages contain at most 100 rows. SQLite may use temporary storage for sorts.

Each installed database is limited to 8 GiB uncompressed, with 64 KiB gzip/hash
buffers. Staging temporarily needs both bundles plus the compressed download.
Old generations are retained, so storage reclamation remains required before
repeated production updates. Atomic pointer publication provides process-crash
consistency; hardware power-loss durability beyond Foundation's atomic write
has not been verified. Blob decoding uses explicit little-endian byte assembly,
not unaligned pointer loads. Negative/truncated coordinates and corrupt gzip
fail with typed errors. Unknown future schemas and version downgrades fail.
Same-schema snapshots are opaque IDs with no chronological ordering; a manifest
is authoritative within a schema, as on Android.

`python3 scripts/ios-port/verify-b07.py` passes: eight pinned source hashes,
55 captured native identities, nine hashed gzip/SQLite files, v1-v3 columns,
and native matching-test occurrence expectations. `git diff --check` passes.
Focused Swift tests cover schema fallback/provenance, occurrence paging,
filtered/global counts, query pages, corruption, mixed evidence snapshots,
real installation, failed fetch preservation, reopen and schema downgrade.
All Swift tests remain unrun locally. No full catalogs or toolchains downloaded.

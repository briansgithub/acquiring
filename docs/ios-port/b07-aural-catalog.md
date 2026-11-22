# B07 Aural catalog package

## Current verification status

Remote Swift package validation passed at merge head
`7b62c629fc72176ce63d879db449e652cd60e239` in
[iOS run 44914149687](https://github.com/briansgithub/acquiring/actions/runs/44914149687).
The earlier statements below that Swift was unrun describe earlier checkpoints
and are superseded by this remote evidence. Local Swift/device execution is
still unavailable.

The job API independently inspected by this worker reports the Swift package
parity step succeeded, the iPhone app build/test step failed, and the iPad step
was skipped. The lead's supplied independent log review reports all 250 package
tests passed, including AuralAlgorithmsTests 4/4 and AuralCatalogTests 4/4.
That same lead review identifies the later app compilation failure as the
baseline actor-isolated default at `AppEnvironment.swift:269`. This worker did
not independently read the raw log contents. No B07 package Swift failure was
reported in that run; the overall workflow did not pass.

A raw-log request through `gh api actions/jobs/136876054783/logs` was refused
with: "the response contains terminal escape sequences; pass
--allow-escape-sequences to output it anyway". The worker stopped, reported the
refusal and used neither the override nor another route to those logs. The
lead then authorized this documentation update using the existing job API
status and the lead's previously supplied evidence. No further log request,
CI rerun, workflow edit, app source repair or PR merge was performed.

The lead-owned merge commit preserved the ledger records and allowed PR CI to
start. GitHub then reported the PR mergeable. This receipt-only follow-up uses
`[skip ci]` to honor the instruction not to trigger another broad run. Evidence
remains attributed to the tested merge head, not to a newly executed run.

Package test success does not resolve full-catalog ranking latency/resource
validation, old-generation reclamation, app bootstrap/Settings/navigation,
physical-device behavior or reconciliation with PR #51. The PR remains open
for independent review; app-visible B07 completion is not claimed.

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

## PR and resumed review, 2026-11-21

PR #55: https://github.com/briansgithub/acquiring/pull/55, open and linked to
this thread. At head `ab23f94b2b399e6d3cd7e012bb9703603f61f3c7`, GitHub
reported zero check runs and zero commit statuses. Actions run `44865750898`
for `.github/workflows/ios-external-beta.yml` failed on push with zero jobs.
No Swift package, simulator or device test ran. This is an infrastructure
failure observation, not a Swift failure or passing build. Shared workflows
and main documentation were not changed in response.

The subsequent repair adds a focused lease-drain cancellation/retry test,
limits compressed staged inputs to 2 GiB after download, and preserves native
v1/v2 bucket capability fallback to `All starting chords`. The compressed
limit is enforced after URLSession finishes its temporary download, so it is
not a network transfer or temporary-download disk quota. Swift tests remain
unrun. A resume `turn_context` at 2026-11-21T09:16:18.439Z independently confirms
`gpt-6-astra` with `effort: high` in this worktree.

Read-only review of PR #51 at `3ad590eb68074720d3b8a2e32f900261abc121ab`
found a prior AcquiringAural package with a 1,299-line reader, frontier ranking,
compact bucket queries, leases, passage/evidence APIs and a 389-line installer.
It is not merged or adopted here. B07's separate AcquiringCatalog API and that
prior package must be reconciled by the lead before B09/B10 wiring. The prior
code is relevant source reuse evidence, not proof that either package builds.

Remaining integration work includes application bootstrap, Settings/download
progress, navigation, full-catalog latency validation, storage reclamation and
coordination with prior PR #51. This package slice does not complete the
app-visible B07 feature. No pending historical review was promoted to accepted.

## Bounded comparison with prior PR #51

Compared PR #51 at `3ad590eb68074720d3b8a2e32f900261abc121ab` with B07 at
`9b8335ac20f6337d505b170674a122edead882fd`. Read its AuralCatalogReader,
AuralBundleInstaller, AuralAPI, relevant AuralQuizStore replacement callers and
catalog data/ranking/installer tests. This was source review, not execution.
Its reported UI failures do not establish a defect in its pure models.

| Concern | Prior AcquiringAural package | B07 AcquiringCatalog package |
| --- | --- | --- |
| Schema and provenance | Accepts v1-v3; requires 64-character snapshots. `run` selects only key_json and omits source_key_json. | Accepts v1-v3 with explicit capabilities; preserves source_key_json separately, falling back only for v1. |
| Reader memory | Int32 suffix storage is compact, but initial suffix blob and all run identity rows load at once. FIFO cache is 64 runs; blob inflation has no decoded-size cap. | Suffix input pages are 1 MiB and identities 2,048 rows; explicit payload/cache limits. Int suffix storage costs twice as much as Int32 and remains a follow-up optimization. |
| Query/grouping/ranking | Versioned chord queries, compact bucket existence queries, rank eligibility prefix cache and priority-frontier ranking with 256-row SQL batches. Ranking SQL uses OFFSET. Broader exact-inversion/mode/range-batch tests exist. | Versioned queries and native grouping fallback; global ranks versus filtered counts. Keyset range reads, but full rescans per result page and statistics per candidate. Fixed candidate memory, unmeasured latency. It lacks the prior package's chord-variant and passage/evidence convenience APIs. |
| Leases and replacement | Reader exposes explicit leases and begin/endReplacement. Installer is separate; AuralQuizStore manually coordinates both. Backup/rollback recovery is implemented and tested by injected move failures. Cancelled continuation waiters are checked after being resumed. | Store couples staged preparation with closure leases and atomic generation publication. Cancellation can resume an activation wait before consumers release. Concurrent installs/new leases during activation return busy. Old directories remain for recovery; reclamation is missing. |
| Corruption checks/tests | Integrity and mixed-evidence checks, endian decoding, rollback and interrupted-backup tests. Blob inflater accepts plain input and has no expansion limit. | Strict bounded gzip, negative/misaligned coordinate refusal, snapshot/sidecar/hash checks; small real v1-v3 bundle cases, failed fetch/reopen/downgrade and lease cancellation tests. Injected move/publication failure coverage remains weaker than the prior tests. |
| Public API fit | Wider app/learning-facing API, already called by the prior UI; dedicated AcquiringAural module and AcquiringCore models. Its Package.swift pins GRDB 7.8.0. | Narrow independent storage service, auto-discovered in existing AcquiringCatalog with current GRDB 7.11.1. No app wiring or shared model edits. Several names overlap if both modules are imported. |

Recommendation: use one B07 AcquiringCatalogStore as the eventual ownership
and activation service, after successful Swift validation. Do not activate both
installers or both readers. Before full-catalog B09/B10 integration, selectively
port the prior reader's frontier ranking and compact bucket-query approach into
that service, with its exact-inversion, ineligible-range and global-count tests.
Preserve B07's source-key provenance, bounded decoding and cancellation checks.
Measure latency and memory against a representative catalog before choosing a
production paging budget. This recommendation is about the storage boundary;
it does not claim current full-scan ranking is production-ready.

Reuse the prior package's passage/source-section/evidence API designs and
learning model tests through a reviewed adapter to the selected service.
The lead should decide whether its higher-level AcquiringAural module becomes
that adapter while the old storage classes are excluded. Retain one canonical
set of pattern/query types to avoid ambiguous imports. Its move-failure tests
are useful additions for B07 publication-failure coverage. Do not copy its
Package.swift, downgrade GRDB, or adopt its app/UI code in this batch. The lead
owns old app/learning code adoption. Neither PR has been merged or discarded.

At B07 head `9b8335ac`, Actions run `44888968676` also failed with zero jobs;
the check-runs API returned total_count 0. No Swift verification is available.

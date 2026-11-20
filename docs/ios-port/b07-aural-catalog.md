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

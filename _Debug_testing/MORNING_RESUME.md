# Morning resume — catalog engine error loop

Last updated: 2026-07-25 after Fix 074 merge.

**Full handoff for next agent:** [`AGENT_HANDOFF.md`](AGENT_HANDOFF.md)

## Quick state

- **main** @ Fix 074 merged (PR #32)
- **61** engine failures / **61/61** policy fixtures
- Top cluster: `type=9 alt=b5` (4) — gate `flattenHalfDimB5` to type ≤ 7

## Commands

```powershell
cd H:\Desktop\3_sacred_ring
node _Debug_testing/queryTopErrors.mjs --limit 15
node _Debug_testing/policyRegression.mjs
node _Research_testing/hooktheory_catalog/cli/batchCompareCatalog.js --resync
```

## Overnight (optional)

```powershell
powershell -File _Debug_testing/overnightSupervisor.ps1 start
powershell -File _Debug_testing/overnightSupervisor.ps1 status
powershell -File _Debug_testing/overnightSupervisor.ps1 stop
```

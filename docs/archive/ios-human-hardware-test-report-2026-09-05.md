> Historical, incomplete report preserved during worktree consolidation. Its
> baseline and defect list describe TestFlight build 8, not the merged current
> application. No H01–H26 case results were recorded; do not treat those cases as
> passed or the inherited defect list as a fresh reproduction.

# iOS Human / Hardware Acceptance Test Report

Guided execution of `docs/ios-human-hardware-testing-prompt.md` (cases H01–H26).
Human observations and agent-measured evidence are kept separate throughout.

**This assignment is test execution only.** No production fixes, commits, pushes, or
TestFlight uploads were made.

## Baseline

| Item | Value |
| --- | --- |
| Session start | 2026-09-05 11:52 EDT |
| Worktree | `/Users/brian/Desktop/acquiring-ios-human-testing`, branch `claude/human-hardware-testing` |
| Commit | `b543f2be` — *Merge branch 'claude/ui-reset'*, clean (no local modifications) |
| Installed iPhone build | TestFlight build 8, reported by the user as built and released from this same code — **no build gap** |
| Build-number bookkeeping | `ios/.testflight-build-number` reads 8 in the primary checkout but is uncommitted; last committed record is build 6 (`bda56b98`). Next release should start from 9. |
| Physical device | iPhone 14 Pro (user-owned; not disposable test data) |
| Simulator | iPhone 17 `55373408-99CC-4EB3-A771-6ACF29E2D96A`, iOS 26.3.1 — used only for the batch 6 accessibility matrix |
| Prior automated evidence | `docs/ios-autonomous-test-report.md` — 79 UI/app tests (64 pass / 12 fail / 3 skip), 180/180 package tests, full 40,979-song catalog decode |

### Known defects already in this build

Carried from the autonomous run; these are expected to surface in the human pass and are
**not** new findings. Confirmed once each, then skipped to preserve the reproduction budget.

| ID | Defect | Human-visible in |
| --- | --- | --- |
| D1 | Quiz icon buttons expose glyph-sized hit targets — transpose ± inoperable, Reset does nothing | H04, H05, H06, H24 |
| D2 | `catalog.retry` identifier shadowed by its container (action still works by label) | H22 |
| D3 | Practice dock clipped ~10 pt at the largest accessibility text size | H24 |
| D4 | Favorites accordion row does not reveal its contents | H22 |

## Case results

_Recorded per batch as the session proceeds._

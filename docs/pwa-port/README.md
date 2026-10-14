# Android-to-PWA port

Completed 2026-10-14. Runtime model: unknown. Android reference: `801cf7984171d772afc4406ddb5c79c0cb7fd20a`.

The first pass classified every entry in the frozen full-history traversal of `android/` and `contracts/`: **262 commits** (108 foundation,103 revision,51 Aural). The earlier213 count was Git's path-simplified view, which hides integration history. This is not262 independent features. Each JSON row records the actual change, kind, final disposition and evidence. Review included changed-path metadata, bounded substantive diffs, tests/comments and current source/handoffs. Large patches were searched; binary artwork was inspected as metadata. No claim of exhaustive line-by-line history or fresh app/device validation is made.

The second pass groups surviving behavior into **29 dependency-ordered work packages**, avoids rebuilding replaced versions, and defines ownership, acceptance and crash recovery. Product implementation was authorized2026-10-14 and has begun. T00/T01/T02/T06 foundations are accepted; T03 theory and T05 catalog work are partial. See HANDOFF.md for current source/checks and remaining work.

## Read next

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): current feature targets, architecture/contracts, ordered packages, parallel lanes and acceptance gates.
- [RUNBOOK.md](RUNBOOK.md): five-hour/weekly budget policy, prewritten intent, task claims, lost-response recovery and automatic resumption.
- [tasks.json](tasks.json): machine-readable dependency, ownership and validation queue.
- [HISTORY.md](HISTORY.md): human-readable per-commit ledger generated from history-foundation.json, history-revision.json and history-aural.json.
- [HANDOFF.md](HANDOFF.md): current continuation state and automation disposition. Inspect Git for current branch/dirty state.

## Current capability coverage

| Surviving Android behavior | Implementation packages |
| --- | --- |
| One-shot Introduction, dark branding, keyboard/touch/accessible routes and origin-aware Back | T01,T10,T12,T21,T27 |
| Catalog contract/gzip/raw compatibility, auto-install, freshness, staging/validation/update | T02,T05,T26 |
| Debounced title/artist search, display normalization, paged inline suggestions, separate Hooktheory input | T02,T10,T22 |
| Recents, All Songs alpha/complexity/mode groups, fuzzy filter, prefix scrubber and restoration | T05,T06,T10 |
| Song Info metadata, sections, progression/source links, complexity, unique chords and transition ranking | T02,T03,T04,T11 |
| Sounding versus display key, pitch/scale/chord/inversion/borrowed/applied/voicing semantics | T03 |
| Fitted Roman and scale-degree notation, semantic labels and rest/alteration handling | T04 |
|13 instruments, normalized gain, saved default/session separation, Synth Clarinet fallback | T06,T07,T08,T21 |
| Foreground transport, looping, seek/scrub/inertia, zero-to 200%tempo, transpose and mix | T07,T08,T12 |
| Full/root-only cards, onsets/modulation, fixed controls, beat steps, home-note/chord previews | T03,T04,T08,T12 |
| Preview exclusivity, exact captured-frequency playback, replacement fades and cancellation | T07,T08,T13 |
| Mic permission/exclusive ownership, YIN/smoothing/fresh-versus-held frames and lifecycle cleanup | T09,T13 |
| Two-slot/Flip-Flop, target singing, persistent root/melody/chord-tone practice and run scoring | T09,T12,T13 |
| Saved per-song singing octave -2..+3, independent of source transpose/playback | T06,T13 |
| Full-v3 Aural catalog/evidence/popularity offline delivery and prepared-reader reuse | T05,T15,T26 |
| Most songs/global support ranking,80%default cutoff, search variants, modes/inversions/grouping/subsequences | T15,T17 |
| Recognize/Recall/Sing, adaptive/transfer scheduling, guidance/retry/resume/technical uncertainty | T14,T18 |
| Indexed real-source examples, seeded selection, overlapping familiarity, audible-exposure evidence | T14,T15,T16 |
| Complete Examples preview, reversible shuffle, stable saved ordering and safe section resolution | T19 |
| Generated-example repetition, previous/next boundaries, full-song round trip and retained quiz state | T12,T18,T19,T20 |
| Favorites/rollback, playlist counts/removal, named ordered queue snapshots, durable harvested overlay | T06,T10,T19,T22 |
| Help, privacy access, diagnostics/export/reset, visual60 fps/max preference and app updates | T12,T21,T26 |
| Optional accounts, email/password/Google, cloud sync and guest merging (new PWA requirements) | T23,T24,T25 |
| Physical browser/device parity, full offline capacity, accessibility and release provenance | T27,T28 |

Do not invent dormant standalone practice or empty custom-playlist management screens. Current named queue-to-playlist saving is in scope. Do not restore calibration, floating controls, background media service, the old family landing, old Chords arpeggio-speed UI or earlier queue behavior. Preserve foreground interruption handling and all current transport arpeggiation.

## Evidence and exclusions

Primary records: current Android source/tests and contracts; docs/quiz-controls-playback-plan.md; docs/worktree-consolidation-2026-09-05.md; docs/branch-maintenance-2026-10-02.md; docs/aural-curriculum.md; docs/aural-corpus-offline.md; docs/aural-catalog.md; docs/aural-catalog-publishing.md; android/archive/PITCH_RECORDING_AUDIT_2026-08-13.md. Legacy root handoffs describe the older web app and are historical context, not PWA authority. Published recovery snapshots contain superseded/unapproved copies and are preserved without wholesale replay. No unrelated exhaustive iOS/web history, secret/signing data, runtime databases or generated corpus internals were audited.

Validation: `python docs/pwa-port/validate_audit.py --render-history` checks exact frozen commit coverage, required annotations, historical evidence resolution,29 acyclic dependencies and plan/task agreement, then renders HISTORY.md. `git diff --check` checks final documentation whitespace. These checks do not establish runtime parity. No Android build, browser suite or device test was run during the audit itself. Later implementation checks and their limits are recorded in HANDOFF.md and tasks.json.

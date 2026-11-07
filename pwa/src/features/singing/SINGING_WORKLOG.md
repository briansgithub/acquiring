# Singing feature

2026-11-07 coordinator/cursor-grok; T13 first slice on `codex/pwa-continuation` from exact `e5ed284cb96f938335f2c77f9bda54185e3ff5bf`. Own `singing-octave.ts`, `.test.ts`, and this log only. Frozen `801cf798` `SingingTargets.kt` entire file plus `idealIntervalPlaybackMidis` in `HummingIntervalPopup.kt` 810-821. Brian 2026-11-07 priority: playback/singing/note-chord cards first; Aural quiz, T15 song-rank, and progression family trees last.

Pure Int tessitura math: clamp -2..+3, signed label, 12-semitone shift, mic MIDI includes manual transpose once, preview MIDI omits transpose because AudioEngine reapplies it, both interval slots share one shift, missing second slot is null. Song playback is not an input. No microphone, dock UI, persistence, Flip-Flop, scoring, Aural, timeline, or accepted card/source recapture. T09 remains required for scoring; this slice uses the T12 interval-cards-accepted development gate only.

Expected checks: focused vitest, `npm run typecheck`, `npm run check`. Android `SingingTargetsTest` / interval MIDI cases are the oracle; no JVM recapture of this 65-line leaf. Browser UI proofs wait for a later selector/dock slice.

T13-octave-unit-001 FIRST PASS 11 tests/1 file 123ms. T13-octave-typecheck-001 PASS. Combined T13-octave-check-001 FIRST PASS: 971 unit/73 files 16.15s + 1 parity + types + production shell `1a7e9ac45427` (unbundled; App import unchanged). Lineage note: remaining T15/Aural last; next playback surface after this kernel is visual timeline geometry, then octave selector/dock (T09 still required for scoring).

2026-11-07T09:36Z thin PlaybackScreen −/+ chrome reuses this kernel (no singing/ source edits). Local only; T06 songOctaveOffsets persistence is next. Octave buttons do not start source audio (Chrome proof). No mic/dock/Flip-Flop/scores.

# Android→iOS porting roadmap

This is the working checklist for rebuilding the iOS UI (reset in `claude/ui-reset`) feature by feature, in the exact order the Android app originally developed them. It is derived from the full chronological git history of Android-touching commits and is meant to be worked top to bottom.

Status tags, updated in place as work lands:

- **[ ]** not started
- **[wip]** in progress / partially landed
- **[x]** done and verified on iOS
- **[skip]** Android-only concern (branding/build/release/tooling) — no iOS action needed
- **[deferred: reason]** attempted and set aside; needs another pass or a human decision

Legend for the original categorization: **[done]** = already true on iOS, verify only · **[wire]** = logic already exists in `AcquiringKit`/`AppEnvironment`, needs SwiftUI wiring · **[port]** = needs new Swift logic beyond wiring.

## Methodology

1. **Four testing layers, most autonomous first:**
   - `swift test --package-path ios/Packages/AcquiringKit` for pure logic (theory, chords, DSP, timing, tessitura) — fast, fully autonomous, and the primary safety net since most of this logic is already ported and tested.
   - Rebuild → reinstall → relaunch → screenshot in the `iPhone 17` simulator after every change (per `ios/AGENTS.md`).
   - Coordinate-based interactive verification via macOS System Events, now that Accessibility access is granted — tap points are computed from a fresh screenshot each time, never hardcoded, since the Simulator's screen is a bitmap to macOS (no accessibility-label introspection from the host side).
   - `xcodebuild test` (XCUITest), rewritten incrementally as each screen's design settles, for durable regression coverage.
   - Audio-perceptual correctness and full VoiceOver experience are the two things that can't be fully closed-loop verified without a human; these are implemented and structurally checked, then flagged rather than claimed as fully autonomous.
2. **Per-feature loop:** identify the existing `AcquiringKit`/`AppEnvironment` API that already covers the logic → implement the minimal SwiftUI wiring → run the applicable testing layers → commit referencing the feature number → move on.
3. **One flagged decision point:** Android used a custom draggable "puck"/dial widget for several controls (audiation target puck, arpeggio rate knob). iOS has no native equivalent. Default plan: use native SwiftUI controls (`Picker`/`Stepper`/`Slider`) instead of a custom dial. Flagged once at item 22, not re-asked at each of the six items it touches (22, 25, 27, 85, 88, 91).
4. Items marked **[skip]** are noted for completeness but require no iOS work.

## Phase 1 — Foundation

1. [skip] Initial commit for Android repository
2. [skip] Fix Room coroutines / Kotlin+AGP upgrade
3. [x] Song search by title + real-time suggestions
4. [x] Port chord/roman-numeral logic from web player (`ChordInterpreter.swift`)
5. [x] Recent Songs + Dark Mode theme
6. [skip] Clean up scratch scripts
7. [skip] 7-circle diatonic app icon assets
8. [skip] Icon solid black background / 3D nodes
9. [x] Search history + tests
10. [ ] Fix song section labeling via Hooktheory API (`SectionOrdering.swift`, verify)

## Phase 2 — Quiz engine emerges

11. [ ] Dynamic key modulation, polyphonic audio engine, ChordInterpreter parity
12. [ ] Cancel playback on skip/reset
13. [skip] Add compact Android agent rules
14. [ ] Remove tonic letter from Quiz key display
15. [ ] Fix root-relative chord degree labels
16. [ ] Polish chord/scale-degree rendering
17. [ ] Quiz tempo as a percentage with reset
18. [x] Match Hooktheory suspended extension voicings
19. [ ] Fix quiz playback controls and looping
20. [x] Fix hierarchical back navigation
21. [ ] Add Hooktheory URL button to Quiz page
22. [ ] Add audiation aural-practice and pitch calibration (control-widget decision)
23. [x] Custom borrowed scales + web-parity applied chord voicing
24. [x] Artist search, refine UI layout, sawtooth default
25. [ ] Optimize QuizTab layout, puck positioning (control-widget decision)
26. [ ] Reorganize search UI, remove suggestion limits
27. [ ] Audiation puck → magnifying glass, reorganize search layout (control-widget decision)
28. [ ] Improve playback looping (endBeat estimation)
29. [ ] Adjust default volume balance to 55%
30. [x] Unique page per artist when searching by artist
31. [ ] Improve artist normalization, quiz navigation (`LibraryDiscovery.swift`)
32. [ ] Refresh recent selections after navigation
33. [ ] Fix quiz audiation and chord previews
34. [ ] Improve quiz UI and artist history
35. [x] Make quiz playback controls update in real time
36. [ ] Fix seamless song loop playback
37. [x] Add spelling-aware interval analysis (`SpelledInterval.swift`)
38. [ ] Integrate interval playback into quiz UI
39. [ ] Add relative Ionian label context (`RelativeIonianContext.swift`)
40. [ ] Keep Ionian context fixed across modulations

## Phase 3 — Interval & audiation deepening

41. [ ] Color-coded pitch deviation, root interval consistency
42. [ ] Persistent Humming Interval Tool (`ComfortablePitchCapture.swift`)
43. [ ] Restore complex UI chord objects, unify scrub bar, remove skip button
44. [ ] Refine quiz playback controls
45. [ ] Polish Android quiz controls
46. [ ] Fix interval direction and coordinate mismatch
47. [ ] Default Chord/Melody balance to 0.5
48. [ ] Add inertia to timeline scrubbing (native `DragGesture` velocity)
49. [ ] Refactor Quiz UI layout/spacer alignment
50. [ ] Search suggestion paging + audiation pitch target on transpose
51. [ ] Tap-to-replay nearest hummed pitch; double-tap to re-record
52. [ ] Fix double-tap behavior of the Humming Interval Tool

## Phase 4 — All Songs & Info polish

53. [ ] Performance-safe All Songs browser (`LibraryDiscovery.swift`; pagination gap already flagged)
54. [x] Fix Lock in Major chord-tone spelling, applied+borrowed secondary dominants
55. [ ] Exact recorded frequency playback on pitch-slot tap
56. [ ] Quicken timeline inertia, fix drag/tap edges
57. [ ] Redesign Info tab (grouped sections, chord progression view) — first real `SongDetailView` build-out
58. [ ] Prevent search auto-focus/keyboard on launch (verify)
59. [ ] Double-tap interval singing; fix search/download filtering & catalog validation
60. [ ] Show relative-major tonic in header when Lock in Major checked
61. [ ] Tessitura octave-shift display, negative transpose range, melody interval buttons
62. [x] Fix systematic flat bias in YIN (`PitchDetector.swift`)

## Phase 5 — Tessitura & pitch practice maturity

63. [ ] Model tessitura singing targets (`TessituraSession.swift`)
64. [ ] Isolate singing targets from source playback
65. [ ] Centralize tessitura calibration lifecycle
66. [ ] Polish tessitura target feedback
67. [ ] Harden tessitura integration
68. [ ] Refine melody pitch cards and playback
69. [ ] Rename tessitura button, add octave stepper, restyle clear control
70. [ ] Repair the tessitura button
71. [ ] Add melody pitch singing targets (`SingingTargets.swift`)
72. [ ] Keep chord degree labels relative to chord root
73. [ ] Fix Quiz playback and add draggable transport
74. [ ] Add persistent quiz pitch practice (`PersistentPitchPractice.swift`)
75. [ ] Live per-note scoring; fix playback/octave-lock bugs
76. [ ] Extract tessitura calibration UI, add melody run scoring
77. [skip] Rename Android app Sacred Ring → Inquiring
78. [ ] Simplify quiz navigation, move header controls to title/key rows

## Phase 6 — Icon & UX polish, rename to Acquiring

79. [skip] Adjust app icon: circle size and grouping
80. [skip] Refine app icon: facets/glints/shadows
81. [ ] UX polish: "Search Hooktheory" option, Transpose/Volume controls, stabilize transport
82. [skip] Archive pitch recording audit
83. [x] Update EXPECTED_BROWSE_SONGS to 40,609
84. [ ] Redesign quiz controls and pitch practice
85. [ ] Revise arpeggio knob rate options (control-widget decision)
86. [ ] Report the pitch actually sung, not inferred (`PitchSmoother.swift`)
87. [ ] Make tessitura and tempo behave as claimed settings
88. [ ] Reset arpeggio dial on tap (control-widget decision); [skip] stale IDE naming fix
89. [skip] Rename Inquiring → Acquiring
90. [skip] Complete Codex replay integration
91. [ ] Align arpeggio test with four-cycle maximum
92. [ ] Update Tessitura/Transpose buttons UI
93. [ ] Anchor tessitura to the hummed pitch, not a fixed octave

## Phase 7 — Background media & audio hardening

94. [ ] Stop Quiz card previews from clicking through
95. [ ] Play song sections as media, with a transport notification (verify parity)
96. [ ] Name the section in the notification, not its id
97. [ ] End the balance fader level with the cards it belongs to
98. [x] Sound card previews off the main thread
99. [x] Play every track on one audio session
100. [x] Synthesise at the device's own output rate
101. [ ] Publish the media session on events, not a timer (currently polls every 50ms)
102. [ ] Collapse the singing tool when backgrounded (`scenePhase`)
103. [ ] Keep favourite songs in playlists the catalog swap cannot reach
104. [ ] Draw the unfavourited star hollow, not merely grey

## Phase 8 — Monorepo + release engineering

105–110. [skip] Monorepo integration, contracts, Gradle wrapper, DAO fixture, root layout
111. [skip] Target SDK 36, edge-to-edge
112. [skip] Restore accepted Android launcher icon lighting
113. [skip] Prepare Android beta version 3 and release signing

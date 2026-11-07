# Bounded Android history / current PWA feature ledger

Native authority: `801cf7984171d772afc4406ddb5c79c0cb7fd20a`. Default frozen PWA inspection: `7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5` on `codex/pwa-continuation`; a row's explicit inspectionHead pins its bounded follow-up.

Initial docs-only breadth-first feature discovery; feature rows are bounded groups, not a total app feature count. Later bounded implementation updates may pin individual PWA rows to a newer inspectionHead without advancing other frozen rows or claiming full acceptance.

new_current_gap records a concrete PWA omission newly itemized by the initial audit, not an Android feature absent from prior history. This discovery classification persists after a later bounded implementation; current PWA status/inspectionHead show progress. Broad T12/T13/T21 packages already exist.

## Findings and use

**58 behavior groups; 5 integration gaps discovered in the initial audit, 4 still open in the latest pinned rows.** This is not a count of all app features. Existing task IDs are broad packages; NEW rows do not create acceptance decisions or change their statuses.

| Initial new gap | Surviving behavior | Existing package | Latest PWA status |
|---|---|---|---|
| [N01](#n01) | Root-only mode supports persistent SimpleRoot monitoring from the header, with target updates and a root gauge. | T12, T13 | missing |
| [N02](#n02) | Truncated Playback title opens a selectable full-title bottom sheet. | T12, T21 | missing |
| [N03](#n03) | Contextual Playback help scrim dismisses anywhere without activating covered controls. | T12, T21 | missing |
| [N04](#n04) | Tempo/arpeggio/mix rotary controls support angular drag and tap reset (100%, DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX, 0.5 mix). | T12 | partial |
| [N05](#n05) | Singing tape note names use section-key relative-major signature preference for sharps/flats. | T03, T13 | implemented |

**Bounded implementation follow-up:** S06 is **implemented** at [d30df565](https://github.com/briansgithub/acquiring/commit/d30df5659016dee6068f92dbdb83d44e069f8cbc). Only that row's PWA references advance. Its scoped test results and remaining gates are below and in HANDOFF; other audit rows keep their original frozen evidence. This does not complete T13 or the port.

**Bounded implementation follow-up:** N05 is **implemented** at [503cfd2d](https://github.com/briansgithub/acquiring/commit/503cfd2dda5a22fd9d8d7988727acb36d64c8a23). Only that row's PWA references advance. Its scoped test results and remaining gates are below and in HANDOFF; other audit rows keep their original frozen evidence. This does not complete T13 or the port.

## Method, range, coverage and limits

Reverified the exact 262-commit android/contracts full-history inventory and 575 prior evidence objects; reviewed scoped functional excerpts from 50 selected first-parent patches plus surviving native/PWA entry points. See FEATURE_AUDIT_COVERAGE.json. Not exhaustive line-by-line review.

The reused inventory is [HISTORY.md](HISTORY.md) with foundation/revision/Aural JSON and findings. Its 262 commits equal `git log --full-history <authority> -- android contracts`, through the pinned authority, including reachable merge ancestry. The earliest scoped inventory commit is `099cadf943b30f3d6dd57604e6035354754de3a7` (2026-07-28); the end is the pinned authority. All 575 historical object references were rechecked: 572 present directly, three deletion references present in the deleting commit's first parent. Object validation verifies references, not the truth of every old summary.

Fresh patch scope: 50 selected commits spanning introduction, behavioral fixes, replacement/deletion and package/monorepo renames. Full first-parent Android/contracts diffs were captured locally; only bounded matching functional excerpts were read, not all patch lines. Merge-resolution/second-parent history is covered by the prior inventory, not freshly reconstructed here. `5f706322` changes shared contracts/tooling rather than native production source. No literal revert subjects were found in the scoped log; deletion/replacement diffs, not that subject search, determine disposition.

Surviving source checks use concrete entry points and callers; PWA checks include actual hooks/routes/components and existing test bodies, not only kernels. Source links below are frozen at inspection revisions; historical commit links expose change/deletion diffs. Historical evidence paths may use earlier package names. Detailed fresh patch hashes/scopes and validation receipts are in [FEATURE_AUDIT_COVERAGE.json](FEATURE_AUDIT_COVERAGE.json). Machine source: [feature-ledger.json](feature-ledger.json); renderer/reference check: [validate_feature_ledger.py](validate_feature_ledger.py).

**Blind spots:** 111 native production files were enumerated, not all read in full. Selected excerpts can miss later hunks/edge cases. Unselected historical patches, all merge resolutions, resource/layout/theme/accessibility diffs, build/platform/release internals and all Android test bodies were not freshly audited line by line. Library/Song/Playback routes and selected storage/audio entry points were inspected; not every PWA module/test assertion. No browser/device/Android/unit/parity/build tests were rerun in this docs-only audit. Existing tests listed are inspectable acceptance evidence, not fresh pass receipts. External service behavior, physical mic/touch/Pixel/Safari/BFCache and trusted-tab remain unverified. Thus this is breadth coverage, **not an exhaustive unknown-feature guarantee**.

## Priority and reconciliation

Owner priority remains playback/singing/note/chord cards first, secondary full-port infrastructure next, Aural quiz/T15 song-rank/family trees last; motion polish follows functional work. [HANDOFF.md](HANDOFF.md) is chronological; [LINEAGE_PRIORITY.md](LINEAGE_PRIORITY.md), [tasks.json](tasks.json), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and [historical roadmap](../ios-android-parity-roadmap.md) contain historical snapshots. That pointer now leads to the iOS-only porting-plan; its execution/review rules and iOS completion claims do not govern this PWA audit. This ledger inspects code at the stated head and supersedes stale *descriptive* claims only: T22 is no longer payload-only (query overlays, handler and atomic persistence landed); 300ms singing exit landed. Their remaining UI/service/parse/device gaps stay open. No task status, original assertion, owner acceptance or sequencing rule is changed.

Settings Back strict <3px versus earlier 110px remains DEFERRED, unchanged. The original trusted-tab skip remains open after both unsupported environments failed to hide tabs; no retry or fabricated event proof. SYNTHETIC oscillator, fake/silent capture, emulated touch and physical-device evidence remain distinct. Updates must say status unavailable with no fake Play/SW mapping or build number. No live Hooktheory/deployment/production mutations occurred.

The five NEW rows are current integration omissions, despite their introductions already appearing in the old history ledger. Root-only Mic is source-backed; triple-tap and merely surviving ChordTone types are not new requirements. Full-title sheet and local help are separate from displaying a title/global Help. Tape key spelling is separate from captured-slot relative spelling. Rotary/reset behavior is separate from exposing numerical settings. Favorited confirmation already exists and is not a new gap. Current fixed transport does not establish old beat-step buttons as a requirement merely because an earlier plan mentioned them.

**Next independent ready primary slice:** N01 actual root-only persistent-monitoring selection/target/gauge with native mode/session/section reset and explicit opt-in/cancellation. S06 Stop/owner handoff now has a separately pinned bounded implementation follow-up. The original audit made no owner tradeoff decision; title/help/reset leaves remain open; the N05 tape-label follow-up is separately pinned below. Aural stays last.

## Behavior ledger

<a id="p01"></a>

### P01 — playback/audio

Timeline section order, end-beat and silent seek cancel old sounding notes; controls restart only requested transport.

- Native: **surviving**. [PlaybackTiming.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackTiming.kt); [SectionOrder.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/SectionOrder.kt); [PlaybackController.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackController.kt)
- History: [eb9e7fdf](https://github.com/briansgithub/acquiring/commit/eb9e7fdf51d9f3ed7db74875ca540d615d94dc4b), [0886615a](https://github.com/briansgithub/acquiring/commit/0886615a0c3651dfe38781850632d6455dea76d9), [c551d100](https://github.com/briansgithub/acquiring/commit/c551d100c5eac460ebaf44e894e6527856e26f69). Uses source section order and page-tab metadata; fixes seek-only scrubbing, local scheduling bounds and end-loop cancellation to avoid duplicate/skipped notes.
- PWA: **implemented**. Controller and shared timeline fixtures exist; prior product proof is scoped to Chromium.
- Current code/tests: [controller.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/controller.ts); [timeline-builder.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/audio/transport/timeline-builder.ts); [playback.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/playback.spec.ts)
- Tracking: **known**; T02, T08, T12. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Retain original seek/end/loop assertions; device latency and focus remain P03/P04.

<a id="p02"></a>

### P02 — playback/audio

Per-layer generation invalidation, bounded PCM, PREVIEW retirement/fade; literal measured Hz bypasses transpose.

- Native: **surviving**. [AudioEngine.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AudioEngine.kt); [SynthVoice.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/SynthVoice.kt)
- History: [1e22a132](https://github.com/briansgithub/acquiring/commit/1e22a1322db5c395f3d5336197a7bc956dd0b669), [60e853e3](https://github.com/briansgithub/acquiring/commit/60e853e300f581d67cd738dbbe5de12738c93f92), [2c7b8ae0](https://github.com/briansgithub/acquiring/commit/2c7b8ae019b6eab8dab59b2074bcf0231f554721). Per-layer playback generations and snapshots allow live control changes without stale tracks.
- PWA: **implemented**. PCM/preview implementations and tests; history 60e853e3 adds click-suppressing preview fade; 2c7b8ae0 literal Hz.
- Current code/tests: [playback-pcm.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/audio/synth/playback-pcm.ts); [card-preview.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/card-preview.ts); [interval-preview-audio.test.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/interval-preview-audio.test.ts)
- Tracking: **known**; T07, T08. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Retain sample/stream/preview fixtures and real audio-sink assertions; acoustic/device quality unverified.

<a id="p03"></a>

### P03 — playback/audio

Foreground owner/focus loss stops sound; explicit activation governs resume after departure. Background notification service is retired.

- Native: **surviving**. [PlaybackController.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackController.kt); [MainActivity.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/MainActivity.kt)
- History: [f89a775c](https://github.com/briansgithub/acquiring/commit/f89a775cd3b8e14a6998e20a974cbbdd50792544). Introduce saved-default/session instrument ownership and stable transport selectors; make playback foreground-owned and remove persistent media service.
- PWA: **partial**. pagehide/reload proven previously; real trusted-tab test.fixme remains unchanged. Headless/headed Xorg did not hide tabs.
- Current code/tests: [controller.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/controller.ts); [audio-preview.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/audio-preview.spec.ts)
- Tracking: **known**; T08. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Genuine hidden-tab stop/explicit resume, BFCache and Safari events; no dispatched DOM events as acceptance. Physical Pixel remains open.

<a id="p04"></a>

### P04 — playback/audio

Browser interruption/clock reconciliation is a platform adaptation of native focus-locked playback requests.

- Native: **surviving**. [PlaybackController.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackController.kt); [AppAudioOutput.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AppAudioOutput.kt)
- History: [2c16f571](https://github.com/briansgithub/acquiring/commit/2c16f571b99cb0b86f732dc796cb36331a8bed62). Serialize active playback-owner and audio-focus transitions to reject stale ownership.
- PWA: **unverified**. Native focus transitions and PWA acknowledgment tests are separate from OS/device proof.
- Current code/tests: [audio-preview.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/audio-preview.spec.ts); [pcm-queue-sink.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/audio/transport/pcm-queue-sink.ts)
- Tracking: **known**; T08, T27. Priority **primary**; dependencies T07, T08, T27.
- Acceptance still required / boundary: Physical interruption/suspend/resume; no auto-start after cancellation; trusted device evidence.

<a id="p05"></a>

### P05 — playback/cards

Current/previous/Home/interval cards, tap preview and double-click singing, root/melody contexts and Lock in Major.

- Native: **surviving**. [PlaybackView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackView.kt); [PlaybackRootOnlyRow.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackRootOnlyRow.kt); [PlaybackMelodyRow.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackMelodyRow.kt); [PlaybackIntervalState.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackIntervalState.kt)
- History: [eb9e7fdf](https://github.com/briansgithub/acquiring/commit/eb9e7fdf51d9f3ed7db74875ca540d615d94dc4b). Adds cancellation of sounding notes on seek/reset, global transposition, simple/root mode, direct Quiz opening, and a modulation/melody timeline device regression.
- PWA: **implemented**. Existing accepted bounded cards/theory contracts are retained, not reopened by this audit.
- Current code/tests: [PlaybackCards.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/PlaybackCards.tsx); [interval-preview.test.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/interval-preview.test.ts); [playback.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/playback.spec.ts)
- Tracking: **known**; T03, T04, T12. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Keep existing original source fixtures and card assertions; remaining visual/device gaps stay separate.

<a id="p06"></a>

### P06 — playback/cards

Chord inventory, individual tone cards and ranked transitions use interpreted voicings and block previews.

- Native: **surviving**. [SongInfoChords.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/SongInfoChords.kt); [ChordTransitions.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/ChordTransitions.kt)
- History: [69096194](https://github.com/briansgithub/acquiring/commit/69096194f907ca7d758de8fde811a25bfb909d61). Block-chord inventory, tone cards and ranked transitions replace old arpeggio-speed UI.
- PWA: **implemented**. Current Song Info surfaces exist; old arpeggio-speed editor is not the current target.
- Current code/tests: [SongScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/details/SongScreen.tsx); [playback.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/playback.spec.ts)
- Tracking: **known**; T11. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Retain tone/transition/native theory tests; no recapture of already accepted cards.

<a id="n01"></a>

### N01 — playback/singing

Root-only mode supports persistent SimpleRoot monitoring from the header, with target updates and a root gauge.

- Native: **surviving**. [PlaybackView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackView.kt); [PersistentPlaybackPitchPractice.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PersistentPlaybackPitchPractice.kt)
- History: [9973e748](https://github.com/briansgithub/acquiring/commit/9973e748fbecaf09db02575ff2f2339d4c7d7fc0), [86fd3959](https://github.com/briansgithub/acquiring/commit/86fd395917446b7b7df3200162ea2302fdfbfa29), [45e7012e](https://github.com/briansgithub/acquiring/commit/45e7012ed33d18cded02093780152494461009bd). Persistent root/melody/chord-tone practice and exclusive triple-tap activation.
- PWA: **missing**. Native header selects SimpleRoot when simple; PWA hook enables only !rootOnly and melody, cancels on rootOnly. Pure simple-root type is not product integration.
- Current code/tests: [use-playback-pitch-practice.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/use-playback-pitch-practice.ts); [persistent-pitch.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/persistent-pitch.ts)
- Tracking: **new_current_gap**; T12, T13. Priority **primary**; dependencies T08, T09, T12, T13.
- Acceptance still required / boundary: NEW root-monitoring gap: actual root-only UI activation/gauge, changing root/transpose/octave, lease handoff, stop/collapse/departure and no implicit restart.

<a id="n02"></a>

### N02 — playback/navigation

Truncated Playback title opens a selectable full-title bottom sheet.

- Native: **surviving**. [PlaybackDestination.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackDestination.kt)
- History: [877bb982](https://github.com/briansgithub/acquiring/commit/877bb982e61d93e244297a43a631cc768ab18c5b). Selectable expanded title sheet and dismissible contextual help.
- PWA: **missing**. Surviving showTitleSheet/ModalBottomSheet/SelectionContainer; PWA static h1 has no title action. Not absent merely because title text exists.
- Current code/tests: [AppShell.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/ui/shell/AppShell.tsx); [PlaybackScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/PlaybackScreen.tsx)
- Tracking: **new_current_gap**; T12, T21. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: NEW full-title gap: long title activation, complete selectable title, dismissal and retained transport/navigation state.

<a id="n03"></a>

### N03 — playback/navigation

Contextual Playback help scrim dismisses anywhere without activating covered controls.

- Native: **surviving**. [PlaybackDestination.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackDestination.kt)
- History: [877bb982](https://github.com/briansgithub/acquiring/commit/877bb982e61d93e244297a43a631cc768ab18c5b). Selectable expanded title sheet and dismissible contextual help.
- PWA: **missing**. Surviving showPlaybackHelp overlay explains cards/mic/octave/expand; global Help route exists but does not supply this overlay.
- Current code/tests: [PlaybackScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/PlaybackScreen.tsx); [HelpScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/help/HelpScreen.tsx)
- Tracking: **new_current_gap**; T12, T21. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: NEW contextual-help gap: reachable help action, exact current guidance, dismissal eats activation, keyboard/accessibility contract without unintended mic/play.

<a id="n04"></a>

### N04 — playback/gestures

Tempo/arpeggio/mix rotary controls support angular drag and tap reset (100%, DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX, 0.5 mix).

- Native: **surviving**. [PlaybackDial.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackDial.kt); [PlaybackView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackView.kt)
- History: [86fd3959](https://github.com/briansgithub/acquiring/commit/86fd395917446b7b7df3200162ea2302fdfbfa29). Rotary tempo/arpeggio/mix controls and updated streaming/pitch practice behaviors with regressions.
- PWA: **partial**. PWA exposes range/select values, no rotary handlers or tap-reset affordance. Native PlaybackView onTap branches survive; values alone do not close gestures.
- Current code/tests: [PlaybackSettingsPanel.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/PlaybackSettingsPanel.tsx)
- Tracking: **new_current_gap**; T12. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: NEW reset/rotary gap: source-derived reset branches and angular pointer behavior, accessible value changes, no unrelated transport restart; preserve accepted sound values.

<a id="s01"></a>

### S01 — singing

Two captured slots: tap literal-Hz replay, double-click recapture, interval replay and raw-MIDI interval/cents.

- Native: **surviving**. [HummingIntervalPopup.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HummingIntervalPopup.kt); [SpelledInterval.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/SpelledInterval.kt)
- History: [199b4061](https://github.com/briansgithub/acquiring/commit/199b406112e2eef32269fe6530e1edb9bf286f71), [9aa9fe6e](https://github.com/briansgithub/acquiring/commit/9aa9fe6e7d9f6e3481b6145e78bdd9014efb9e40), [2c7b8ae0](https://github.com/briansgithub/acquiring/commit/2c7b8ae019b6eab8dab59b2074bcf0231f554721). Tap captured pitch to replay and double-tap to recapture.
- PWA: **implemented**. 9aa9fe6e changes clear-on-start double-tap behavior; current slots/record/preview integration exists. SYNTHETIC is not physical mic.
- Current code/tests: [SingingDock.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/singing/SingingDock.tsx); [singing-microphone.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/singing/singing-microphone.ts); [playback-synthetic-scores.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/playback-synthetic-scores.spec.ts)
- Tracking: **known**; T09, T13. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Retain capture freshness/clear/preview tests; first actual permission and physical pitch remain unverified.

<a id="s02"></a>

### S02 — singing

Target listening/Flip-Flop, contiguous voiced-run median, no stale held score and two-second quiet rest.

- Native: **surviving**. [HummingIntervalPopup.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HummingIntervalPopup.kt); [MicrophonePitchTracker.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/MicrophonePitchTracker.kt); [PitchSmoother.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PitchSmoother.kt)
- History: [bc142c08](https://github.com/briansgithub/acquiring/commit/bc142c082e1782def9f7bf7da608ddf6f61b2829). Contiguous melody-run median scoring and extracted calibration UI.
- PWA: **implemented**. Pure/kernel and product synthetic evidence exist; Flip-Flop drops displayed target and stops mic during rest.
- Current code/tests: [singing-microphone.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/singing/singing-microphone.ts); [singing-score.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/singing/singing-score.ts); [pitch-publisher.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/audio/capture/pitch-publisher.ts)
- Tracking: **known**; T09, T13. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Keep raw vs held-display, silence/dropout, median and rest assertions; physical-mic proof remains open.

<a id="s03"></a>

### S03 — singing

Per-song octave -2..+3 is durable and affects singing targets, not source transport.

- Native: **surviving**. [SingingOctaveSelector.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/SingingOctaveSelector.kt); [SongOctaveOffsetViewModel.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/SongOctaveOffsetViewModel.kt)
- History: [45e7012e](https://github.com/briansgithub/acquiring/commit/45e7012ed33d18cded02093780152494461009bd). Remove tessitura/calibration/hints; add saved song octave owner, displayed-name search, revised cards/help.
- PWA: **implemented**. Current persistent octave selector replaces comfortable-pitch calibration.
- Current code/tests: [song-octave-session.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/singing/song-octave-session.ts); [singing-octave.test.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/singing/singing-octave.test.ts)
- Tracking: **known**; T06, T13. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Retain section-change/new-song/restore/failure fixtures; do not resurrect deleted calibration.

<a id="s04"></a>

### S04 — singing

Card auto-listen follows approved policy A800ms including first prompt; expand alone does not start recording.

- Native: **surviving**. [HummingIntervalPopup.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HummingIntervalPopup.kt); [PlaybackView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackView.kt)
- History: [67826471](https://github.com/briansgithub/acquiring/commit/6782647188c78dfcadb52c6981ab74af8f4a64bc). Collapse singing tool and release microphone when backgrounded.
- PWA: **implemented**. Owner accepted 800ms overrides older timing constants; visible Stop/collapse cancellation remains required.
- Current code/tests: [SingingDock.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/singing/SingingDock.tsx); [singing-microphone.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/singing/singing-microphone.ts); [audio-preview.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/audio-preview.spec.ts)
- Tracking: **known**; T09, T13. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Keep original 800ms first-prompt/cancel assertions; fake/silent permission delivery is not physical prompt proof.

<a id="s05"></a>

### S05 — singing/lifecycle

Exit retains inert visual content for native 300ms shrink; immediate operational cleanup, rapid reopen and departure clear.

- Native: **surviving**. [HummingIntervalPopup.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HummingIntervalPopup.kt)
- History: [67826471](https://github.com/briansgithub/acquiring/commit/6782647188c78dfcadb52c6981ab74af8f4a64bc). Collapse singing tool and release microphone when backgrounded.
- PWA: **implemented**. 7b889f1c HANDOFF records prior 17 pass/1 trusted-tab skip, not freshly rerun. Owner immediate cleanup overrides native ordinary-icon deferred cleanup; reduced motion is explicit web adaptation.
- Current code/tests: [singing-exit.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/singing/singing-exit.ts); [SingingDock.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/singing/SingingDock.tsx); [audio-preview.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/audio-preview.spec.ts)
- Tracking: **known**; T09, T13. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Retain actual animation/interrupted exit/pagehide/reduced-motion proofs; native pixel/density and physical lifecycle are not accepted.

<a id="s06"></a>

### S06 — singing/lifecycle

Collapsed singing handle exposes Stop while persistent monitoring remains active.

- Native: **surviving**. [HummingIntervalPopup.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HummingIntervalPopup.kt); [PlaybackDestination.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackDestination.kt); [MainActivity.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/MainActivity.kt)
- History: [45e7012e](https://github.com/briansgithub/acquiring/commit/45e7012ed33d18cded02093780152494461009bd). Adds the collapsed persistent-monitoring Stop and SimpleRoot/Melody header selection while retiring calibration; current pinned callers establish the surviving owner-handoff contract.
- PWA: **implemented**. Bounded desktop S06 follow-up: collapsed Stop cancels persistent only; explicit persistent activation collapses/cleans ordinary singing without killing the new owner; expanding cancels persistent without capture; pagehide clears controller latch immediately. Approved ordinary immediate cleanup and 800ms policy unchanged. Native distinction: ordinary exit snapshot is visual-only while explicitly enabled persistent may own capture. N01 root-only integration remains missing. Tests:1216 unit+1parity+types/build; browser29pass/1observer-race fail/1original skip then failed case1/1pass after waiting on unchanged completion predicate; all6new owner/async/navigation cases first-pass. Exact receipts and source hashes in HANDOFF/tasks T13; implementation checkpoint d30df5659016dee6068f92dbdb83d44e069f8cbc.
- Current code/tests: [SingingDock.tsx](https://github.com/briansgithub/acquiring/blob/d30df5659016dee6068f92dbdb83d44e069f8cbc/pwa/src/features/singing/SingingDock.tsx); [singing.css](https://github.com/briansgithub/acquiring/blob/d30df5659016dee6068f92dbdb83d44e069f8cbc/pwa/src/features/singing/singing.css); [PlaybackScreen.tsx](https://github.com/briansgithub/acquiring/blob/d30df5659016dee6068f92dbdb83d44e069f8cbc/pwa/src/features/playback/PlaybackScreen.tsx); [use-playback-pitch-practice.ts](https://github.com/briansgithub/acquiring/blob/d30df5659016dee6068f92dbdb83d44e069f8cbc/pwa/src/features/playback/use-playback-pitch-practice.ts); [persistent-pitch.test.ts](https://github.com/briansgithub/acquiring/blob/d30df5659016dee6068f92dbdb83d44e069f8cbc/pwa/src/features/playback/persistent-pitch.test.ts); [playback.spec.ts](https://github.com/briansgithub/acquiring/blob/d30df5659016dee6068f92dbdb83d44e069f8cbc/pwa/tests/browser/playback.spec.ts)
- Tracking: **known**; T13. Priority **primary**; dependencies T08, T09, T12.
- Acceptance still required / boundary: Retain current explicit opt-in/Stop/owner-safe delayed permission, rapid reopen, ordinary collapse, Back and genuine reload assertions. Desktop fake/silent and gated-delivery proof is bounded; trusted tab/BFCache/Safari/physical mic/Pixel remain open. N01 SimpleRoot selection/target/gauge and native mode/session/section reset not implemented by this Stop slice.

<a id="n05"></a>

### N05 — singing/labels

Singing tape note names use section-key relative-major signature preference for sharps/flats.

- Native: **surviving**. [RelativeIonianContext.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/RelativeIonianContext.kt); [HummingIntervalPopup.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HummingIntervalPopup.kt); [MainActivity.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/MainActivity.kt)
- History: [5e469e56](https://github.com/briansgithub/acquiring/commit/5e469e56be85f41a25957e84ebacdbf026bf0d46). Spells chromatic singing note labels using the song modal key's relative-major signature, supports sharp/flat preference and updates interval popup context.
- PWA: **implemented**. Bounded product integration at 503cfd2dda5a22fd9d8d7988727acb36d64c8a23: selected section -> existing first-chronological-key relative-major preference -> both tapes; exit snapshots freeze preference. Default flats retained. Captured raw MIDI/relative spelling/Hz/cents, target transpose/octave and capture ownership are unchanged. FIRST PASS16focused,1217unit+1parity+strict types/build;9browser pass/1original trusted-tab skip. SYNTHETIC A#4/Bb4 product test proves both sharp tapes vs captured B♭4, no per-beat/display/transpose/octave signature changes, new section flat labels and no capture from label changes. Physical mic/Pixel and full T13 remain unaccepted.
- Current code/tests: [relative-ionian.ts](https://github.com/briansgithub/acquiring/blob/503cfd2dda5a22fd9d8d7988727acb36d64c8a23/pwa/src/domain/music/relative-ionian.ts); [PlaybackScreen.tsx](https://github.com/briansgithub/acquiring/blob/503cfd2dda5a22fd9d8d7988727acb36d64c8a23/pwa/src/features/playback/PlaybackScreen.tsx); [SingingDock.tsx](https://github.com/briansgithub/acquiring/blob/503cfd2dda5a22fd9d8d7988727acb36d64c8a23/pwa/src/features/singing/SingingDock.tsx); [SingingSlot.tsx](https://github.com/briansgithub/acquiring/blob/503cfd2dda5a22fd9d8d7988727acb36d64c8a23/pwa/src/features/singing/SingingSlot.tsx); [singing-tape.ts](https://github.com/briansgithub/acquiring/blob/503cfd2dda5a22fd9d8d7988727acb36d64c8a23/pwa/src/features/singing/singing-tape.ts); [singing-tape.test.ts](https://github.com/briansgithub/acquiring/blob/503cfd2dda5a22fd9d8d7988727acb36d64c8a23/pwa/src/features/singing/singing-tape.test.ts); [playback.spec.ts](https://github.com/briansgithub/acquiring/blob/503cfd2dda5a22fd9d8d7988727acb36d64c8a23/pwa/tests/browser/playback.spec.ts)
- Tracking: **new_current_gap**; T03, T13. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Keep native first-key/default/relative-major and tape geometry fixtures plus original capture/policy/exit/owner assertions. Bounded desktop SYNTHETIC product label proof passed; this is not physical mic/trusted-tab/Safari/BFCache/Pixel evidence, no native motion/density acceptance. N01 root-only and full T13 remain open.

<a id="s07"></a>

### S07 — singing/scoring

Persistent melody monitoring banks contiguous-run scores; live halo rest 0 cents, unscored dot and absent score are distinct.

- Native: **surviving**. [PlaybackView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackView.kt); [PersistentPlaybackPitchPractice.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PersistentPlaybackPitchPractice.kt)
- History: [bc142c08](https://github.com/briansgithub/acquiring/commit/bc142c082e1782def9f7bf7da608ddf6f61b2829). Contiguous melody-run median scoring and extracted calibration UI.
- PWA: **implemented**. Product SYNTHETIC oscillator banking exists; fake/silent proof is narrower. N01 root-only integration remains missing.
- Current code/tests: [use-playback-pitch-practice.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/use-playback-pitch-practice.ts); [melody-timeline-score.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/melody-timeline-score.ts); [playback-synthetic-scores.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/playback-synthetic-scores.spec.ts)
- Tracking: **known**; T09, T13. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Retain original settle/silence/run-entry/held-not-banked assertions and separate live vs banked indicators.

<a id="g01"></a>

### G01 — gestures/animations

Timeline centered lanes, silent tap/drag seek and cancellation of prior notes.

- Native: **surviving**. [PlaybackView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackView.kt)
- History: [0886615a](https://github.com/briansgithub/acquiring/commit/0886615a0c3651dfe38781850632d6455dea76d9). Uses source section order and page-tab metadata; fixes seek-only scrubbing, local scheduling bounds and end-loop cancellation to avoid duplicate/skipped notes.
- PWA: **partial**. Basic real mouse and emulated touch input documented; CSS/dp/density equivalence unaccepted.
- Current code/tests: [PlaybackTimeline.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/PlaybackTimeline.tsx); [timeline-scrub.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/timeline-scrub.ts); [playback.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/playback.spec.ts)
- Tracking: **known**; T12, T27. Priority **primary**; dependencies T03, T08.
- Acceptance still required / boundary: Native geometry/font-scale comparisons and physical touch, not synthetic handler math.

<a id="g02"></a>

### G02 — gestures/animations

Timeline inertia coast, velocity threshold and tap-during-coast cancellation.

- Native: **surviving**. [PlaybackView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackView.kt)
- History: [1c674526](https://github.com/briansgithub/acquiring/commit/1c6745262f69aaf7996d7e246c8c0834d77c8002). Fixed Play/beat-step/Reset/section row replaces floating transport.
- PWA: **missing**. Known LINEAGE gap: native exponential decay1.4 / threshold0.5 beats/sec; no PWA coast. Historical reference anchors fixed layout, exact current source governs inertia.
- Current code/tests: [timeline-scrub.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/timeline-scrub.ts); [PlaybackTimeline.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/PlaybackTimeline.tsx)
- Tracking: **known**; T12. Priority **polish**; dependencies T03, T08.
- Acceptance still required / boundary: Source-derived motion/tap cancel/no-seek and playback resumption tests; keep below functional primary gaps.

<a id="g03"></a>

### G03 — gestures/animations

Pitch marker32ms tween, tape interpolation, density/sp font geometry and other native motion.

- Native: **surviving**. [PlaybackView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackView.kt); [HummingIntervalPopup.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HummingIntervalPopup.kt)
- History: [4299184a](https://github.com/briansgithub/acquiring/commit/4299184ab9bb65bbc8cfe68346f0791c8a176a0b). Persist60fps/maximum visual refresh separately from audio clock.
- PWA: **partial**. Snap tape and remaining marker/density differences explicitly unaccepted; S05 collapse is now implemented.
- Current code/tests: [timeline-live-pitch.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/timeline-live-pitch.ts); [singing-tape.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/singing/singing-tape.ts)
- Tracking: **known**; T12, T13, T27. Priority **polish**; dependencies T03, T08.
- Acceptance still required / boundary: Measured animation and geometry with reduced-motion web contract; do not equate CSSpx to native raw pixels.

<a id="l01"></a>

### L01 — library/search/artists

All Songs alphabetic/complexity/unrated/mode groups, membership, counts and stable ordered pages.

- Native: **surviving**. [AllSongsView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AllSongsView.kt); [SongBrowse.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/SongBrowse.kt); [SongDao.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/SongDao.kt)
- History: [4aff98b9](https://github.com/briansgithub/acquiring/commit/4aff98b9245fd164566d5e157cb2010aeaaaca2b). Performance-safe All Songs alphabetical/complexity/mode browsing, scalar queries and restore states.
- PWA: **implemented**. Current SQL overlay integration covers harvested membership/counts/modes; do not reuse obsolete songPayload-only gap.
- Current code/tests: [library-queries.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/catalog/library-queries.ts); [harvest-query-overlay.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/catalog/harvest-query-overlay.ts); [library-queries.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/library-queries.spec.ts)
- Tracking: **known**; T10, T22. Priority **secondary**; dependencies T05, T06, T10, T22.
- Acceptance still required / boundary: Retain catalog precedence/ghost/no duplicate/page-boundary SQLite fixtures; Artists gaps separate.

<a id="l02"></a>

### L02 — library/search/artists

Title/artist scopes, focus hides chrome, empty artist refusal, exact artist selection and suggestions.

- Native: **surviving**. [LibraryView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/LibraryView.kt); [LibrarySearchSuggestions.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/LibrarySearchSuggestions.kt); [SongDao.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/SongDao.kt)
- History: [562a66d2](https://github.com/briansgithub/acquiring/commit/562a66d27181845f744dbec6716dc32e707227ef). Hide Library playlists/All Songs during focused search and separate search scope.
- PWA: **partial**. Artists result pages20 vs native unbounded and suggestion NOCASE extension vs native unordered DISTINCT remain unaccepted.
- Current code/tests: [LibraryScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/library/LibraryScreen.tsx); [library-queries.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/catalog/library-queries.ts); [library.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/library.spec.ts)
- Tracking: **known**; T10. Priority **secondary**; dependencies T03, T08.
- Acceptance still required / boundary: Native result cardinality/order/empty/scope original assertions and pagination decision evidence; no silent relaxation.

<a id="l03"></a>

### L03 — library/search/artists

In-memory diacritic/case/alphanumeric folded index and Found N matches rendering.

- Native: **surviving**. [LibrarySearch.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/LibrarySearch.kt); [LibraryView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/LibraryView.kt)
- History: [562a66d2](https://github.com/briansgithub/acquiring/commit/562a66d27181845f744dbec6716dc32e707227ef). Hide Library playlists/All Songs during focused search and separate search scope.
- PWA: **missing**. Already HANDOFF gap; native catalogSearchKey strips diacritics/non-alphanumerics, distinct from SQLite LIKE.
- Current code/tests: [LibraryScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/library/LibraryScreen.tsx); [library-queries.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/catalog/library-queries.ts)
- Tracking: **known**; T10. Priority **secondary**; dependencies T03, T08.
- Acceptance still required / boundary: Fixture Unicode/punctuation/diacritic/native comparator behavior and actual count UI; do not approximate native with JS matching.

<a id="l04"></a>

### L04 — library/search/artists

Prefix subgroup scrubber for sufficiently large All Songs lists.

- Native: **surviving**. [BrowseSubgrouping.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/BrowseSubgrouping.kt); [BrowseScrubber.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/BrowseScrubber.kt); [AllSongsView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AllSongsView.kt)
- History: [4b2da530](https://github.com/briansgithub/acquiring/commit/4b2da5306e2f63ecbd68512211ef7aeba66cd1a0). Prefix navigation for large All Songs groups; row complexity scores.
- PWA: **missing**. Known lineage deferred scrubber, not newly discovered.
- Current code/tests: [LibraryScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/library/LibraryScreen.tsx)
- Tracking: **known**; T10. Priority **polish**; dependencies T03, T08.
- Acceptance still required / boundary: Native threshold/shared-prefix/run and jump target fixtures plus product navigation.

<a id="l05"></a>

### L05 — library/search/artists

Display-only cleanup preserves meaningful hyphens, IDs/URLs and recent title/artist history.

- Native: **surviving**. [CatalogDisplayName.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/CatalogDisplayName.kt); [HistoryManager.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HistoryManager.kt)
- History: [3b6fee65](https://github.com/briansgithub/acquiring/commit/3b6fee652239a55d2f6191e4231d3e250628e301). Canonicalize displayed song/artist names while preserving meaningful hyphens.
- PWA: **implemented**. Catalog identity remains raw; display formatting and native recent limits have existing contracts.
- Current code/tests: [LibraryScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/library/LibraryScreen.tsx); [index.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/user/index.ts)
- Tracking: **known**; T02, T06, T10. Priority **secondary**; dependencies T03, T08.
- Acceptance still required / boundary: Retain normalized-display/source-identity/history-order fixtures; no data rewrite.

<a id="l06"></a>

### L06 — library/persistence

Favorites/ordered playlists live separately from catalog; star rolls back on write failure and only successful addition shows brief Favorited.

- Native: **surviving**. [UserDataDatabase.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/UserDataDatabase.kt); [PlaylistDao.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaylistDao.kt); [FavoritedConfirmation.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/FavoritedConfirmation.kt)
- History: [9ab27cee](https://github.com/briansgithub/acquiring/commit/9ab27ceeeadde93347d97096a9060656b75cdf98), [d3ca9e2f](https://github.com/briansgithub/acquiring/commit/d3ca9e2f0dc15676a52bbf8852a611c6a6d8eb3f). Store favorites/playlists in separate durable database with DAO/tests and rollback.
- PWA: **implemented**. PWA confirmation exists; do not count missing merely because caller file lacks literal notice. d3ca9e2f adds native2000ms notice.
- Current code/tests: [favorites-session.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/favorites-session.ts); [PlaybackFavoriteStar.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/PlaybackFavoriteStar.tsx); [user.test.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/user/user.test.ts)
- Tracking: **known**; T06, T10, T12. Priority **secondary**; dependencies T06, T10.
- Acceptance still required / boundary: Retain success/failure/removal/no-false-confirmation and preserved playlist tests.

<a id="i01"></a>

### I01 — import/harvest

Page section tabs retain order/names, repeated API IDs fetch once but retain distinct section keys and full payload.

- Native: **surviving**. [HarvestService.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HarvestService.kt); [DataExtractor.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/DataExtractor.kt); [Scraper.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/Scraper.kt)
- History: [734ab3f5](https://github.com/briansgithub/acquiring/commit/734ab3f5d25519363139f58fd771527f60076359). Persist manually harvested songs in separate user ledger and restore/adopt them across full-catalog replacement.
- PWA: **partial**. Repo handler and disposable contract proofs exist, no live Hooktheory HTTP; current Library has no end-to-end harvest UI/service binding.
- Current code/tests: [harvest-handler.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/harvest/harvest-handler.ts); [page-sections.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/harvest/page-sections.ts); [harvest-worker.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/harvest-worker.spec.ts)
- Tracking: **known**; T22. Priority **secondary**; dependencies T02, T05, T06, T22.
- Acceptance still required / boundary: Fixture UI-to-worker progress/error/cancel/retry flow and bounded configured service contract; no live requests this audit.

<a id="i02"></a>

### I02 — import/harvest

Native lenient nested JSON/Unicode first-letter titlecasing/wider URL forms.

- Native: **surviving**. [HarvestService.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HarvestService.kt); [HooktheoryDataCompat.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HooktheoryDataCompat.kt)
- History: [734ab3f5](https://github.com/briansgithub/acquiring/commit/734ab3f5d25519363139f58fd771527f60076359). Persist manually harvested songs in separate user ledger and restore/adopt them across full-catalog replacement.
- PWA: **partial**. Strict JSON and narrower URL/ASCII assumptions remain explicit HANDOFF gaps, not parity-lowered acceptance.
- Current code/tests: [raw-json.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/harvest/raw-json.ts); [harvest-url.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/harvest/harvest-url.ts); [harvest-handler.test.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/harvest/harvest-handler.test.ts)
- Tracking: **known**; T02, T22. Priority **secondary**; dependencies T03, T08.
- Acceptance still required / boundary: Pinned native fixtures for malformed-but-native-accepted JSON, Unicode titlecase and URL grammar; surface material ambiguity.

<a id="i03"></a>

### I03 — import/harvest

Harvest preservation: bounded one-time outgoing adoption, persist, catalog activate, replay/startup repair nonfatal; existing catalog slug wins including ghost.

- Native: **surviving**. [HarvestLedger.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HarvestLedger.kt); [DatabaseDownloader.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/DatabaseDownloader.kt)
- History: [734ab3f5](https://github.com/briansgithub/acquiring/commit/734ab3f5d25519363139f58fd771527f60076359). Persist manually harvested songs in separate user ledger and restore/adopt them across full-catalog replacement.
- PWA: **implemented**. PWA readonly overlay substitutes native catalog writes, retaining adopt/replay semantics and immutable catalog. Original browser query/swap/recovery coverage exists.
- Current code/tests: [catalog-swap.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/harvest/catalog-swap.ts); [catalog-harvest.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/catalog/catalog-harvest.ts); [harvest-swap.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/harvest-swap.spec.ts)
- Tracking: **known**; T05, T06, T22. Priority **secondary**; dependencies T05, T06, T22.
- Acceptance still required / boundary: Keep native unrated+browse modes/table-equivalence, ghost precedence and startup missing-target repair fixtures.

<a id="i04"></a>

### I04 — import/persistence

Harvest result plus established T06 mutation receipt/outbox commit atomically, retries duplicate safely and worker loss recovers.

- Native: **surviving**. [HarvestService.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HarvestService.kt); [UserDataDatabase.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/UserDataDatabase.kt)
- History: [734ab3f5](https://github.com/briansgithub/acquiring/commit/734ab3f5d25519363139f58fd771527f60076359). Persist manually harvested songs in separate user ledger and restore/adopt them across full-catalog replacement.
- PWA: **implemented**. df6a734 prior disposable proof covers rollback/cancel/lost response/restart/unrelated rows. Outbox is established PWA T06, not invented native network sync payload.
- Current code/tests: [commit-harvest.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/harvest/commit-harvest.ts); [catalog-worker.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/catalog/catalog-worker.ts); [atomic-harvest.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/atomic-harvest.spec.ts)
- Tracking: **known**; T06, T22. Priority **secondary**; dependencies T05, T06, T22.
- Acceptance still required / boundary: Retain actual IndexedDB failure/cancel/worker-cut tests; no catalog.db writes or real-data tests.

<a id="r01"></a>

### R01 — persistence/recovery

User database schema migrations and durable rows survive catalog swap; guest/account namespaces do not imply auth implemented.

- Native: **surviving**. [UserDataDatabase.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/UserDataDatabase.kt); [PlaylistDao.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaylistDao.kt); [HarvestedSong.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HarvestedSong.kt)
- History: [9ab27cee](https://github.com/briansgithub/acquiring/commit/9ab27ceeeadde93347d97096a9060656b75cdf98). Store favorites/playlists in separate durable database with DAO/tests and rollback.
- PWA: **implemented**. T06 records/sequence/outbox atomic; tests use disposable fixtures, sync absent.
- Current code/tests: [index.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/user/index.ts); [user-storage.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/user-storage.spec.ts)
- Tracking: **known**; T06. Priority **secondary**; dependencies T06.
- Acceptance still required / boundary: Retain original namespace/migration/tombstone/receipt isolation; no real user-data wipes.

<a id="r02"></a>

### R02 — persistence/recovery

Empty-catalog bootstrap/install freshness, staged verified catalog replacement and interrupted-install reader recovery.

- Native: **surviving**. [CatalogAutoInstall.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/CatalogAutoInstall.kt); [DatabaseDownloader.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/DatabaseDownloader.kt)
- History: [c1568dc5](https://github.com/briansgithub/acquiring/commit/c1568dc53d0ba6ac1473e14fb08c2d8886c8aac9). Auto-install an empty catalog; show freshness/update state in Settings.
- PWA: **partial**. Desktop full-size immutable catalog/recovery proof recorded; browser eviction/quota/install update remains platform gate.
- Current code/tests: [installer.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/catalog/installer.ts); [journal.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/catalog/journal.ts); [catalog-install.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/catalog-install.spec.ts)
- Tracking: **known**; T05, T26. Priority **secondary**; dependencies T05, T26.
- Acceptance still required / boundary: Disposable failure/cancel/restart and durable pointer tests; physical quota/eviction/full install-update product tests.

<a id="v01"></a>

### V01 — settings/navigation

Origin-preserving Back, Song Info detour and Library Settings overlay scroll continuity.

- Native: **surviving**. [PracticeNavigation.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PracticeNavigation.kt); [PlaybackDestination.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackDestination.kt); [MainActivity.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/MainActivity.kt)
- History: [1c674526](https://github.com/briansgithub/acquiring/commit/1c6745262f69aaf7996d7e246c8c0834d77c8002). Fixed Play/beat-step/Reset/section row replaces floating transport.
- PWA: **partial**. Settings Back original strict<3px got110px in earlier CI; owner DEFERRED. This audit does not alter or rerun it.
- Current code/tests: [routes.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/app/routes.ts); [playback-route-memory.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/playback-route-memory.ts); [library.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/library.spec.ts)
- Tracking: **known**; T10, T12, T21. Priority **secondary**; dependencies T03, T08.
- Acceptance still required / boundary: Retain assertion/decision deferred; other route/back state can be tested independently.

<a id="v02"></a>

### V02 — settings/navigation

Saved default instrument independent of session selection; deliberate default selection updates current session.

- Native: **surviving**. [InstrumentSession.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/InstrumentSession.kt); [AppSettings.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AppSettings.kt)
- History: [0f6fb283](https://github.com/briansgithub/acquiring/commit/0f6fb28301188034302f49005bae2f79f3861f92). Add Android default-instrument/settings maintenance and external Play listing handoff despite iOS-led subject.
- PWA: **implemented**. Settings already groups Synths/Waveforms. Playback flat selector is not evidence all instrument menus missing.
- Current code/tests: [instrument-session.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/settings/instrument-session.ts); [DefaultInstrumentControl.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/settings/DefaultInstrumentControl.tsx)
- Tracking: **known**; T21. Priority **secondary**; dependencies T03, T08.
- Acceptance still required / boundary: Retain reload/session/default/song-change and fallback tests.

<a id="v03"></a>

### V03 — settings/navigation

One-shot Introduction, offline Help/notation/Roman articles and privacy link.

- Native: **surviving**. [IntroductionPrefs.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/IntroductionPrefs.kt); [HelpContent.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HelpContent.kt); [HelpNotationArticles.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HelpNotationArticles.kt); [PrivacyPolicyLink.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PrivacyPolicyLink.kt)
- History: [c3cd59e2](https://github.com/briansgithub/acquiring/commit/c3cd59e21260c5991c0abe68a6e8145391b28c71). Add privacy-policy access and published policy resource with link tests.
- PWA: **implemented**. Existing global routes/content; separate N03 contextual Playback overlay still missing.
- Current code/tests: [IntroductionScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/onboarding/IntroductionScreen.tsx); [HelpScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/help/HelpScreen.tsx); [PrivacyPolicyLink.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/settings/PrivacyPolicyLink.tsx)
- Tracking: **known**; T21. Priority **secondary**; dependencies T03, T08.
- Acceptance still required / boundary: Retain article/navigation/one-shot persistence and offline accessibility evidence.

<a id="v04"></a>

### V04 — settings/navigation

Allow-listed bounded audio diagnostics export and engine stop/reset, not user-data reset.

- Native: **surviving**. [AudioDiagnostics.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AudioDiagnostics.kt); [AppSettings.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AppSettings.kt)
- History: [91623c45](https://github.com/briansgithub/acquiring/commit/91623c45bd9698c9af62a49c33653b93427ceace). Engine reset and allow-listed diagnostic export excluding song IDs/audio.
- PWA: **implemented**. Current diagnostic/reset code and test claims scoped to prior checkpoints.
- Current code/tests: [audio-diagnostics.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/settings/audio-diagnostics.ts); [AudioDiagnosticsControl.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/settings/AudioDiagnosticsControl.tsx)
- Tracking: **known**; T21. Priority **secondary**; dependencies T03, T08.
- Acceptance still required / boundary: Allow-list/redaction/bound/stop-preview+transport assertions; no secret extraction or data wipe.

<a id="v05"></a>

### V05 — settings/platform

60fps/Maximum affects visual timeline scheduling independent of audio; device maximum refresh is platform-specific.

- Native: **surviving**. [TimelineFrameRate.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/TimelineFrameRate.kt); [AppSettings.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AppSettings.kt)
- History: [4299184a](https://github.com/briansgithub/acquiring/commit/4299184ab9bb65bbc8cfe68346f0791c8a176a0b). Persist60fps/maximum visual refresh separately from audio clock.
- PWA: **partial**. Browser probe fallback60 is not Android preferredRefreshRate parity.
- Current code/tests: [timeline-frame-rate.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/settings/timeline-frame-rate.ts); [TimelineFrameRateControl.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/settings/TimelineFrameRateControl.tsx)
- Tracking: **known**; T21, T27. Priority **polish**; dependencies T03, T08.
- Acceptance still required / boundary: Refresh-cap/frame stability/device proof while audio stays unchanged.

<a id="v06"></a>

### V06 — settings/platform

Updates honestly unavailable; native Play listing/status and native versionCode have no accepted SW/build-number equivalent.

- Native: **surviving**. [PlayAppUpdate.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlayAppUpdate.kt); [AppSettings.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AppSettings.kt)
- History: [0f6fb283](https://github.com/briansgithub/acquiring/commit/0f6fb28301188034302f49005bae2f79f3861f92). Add Android default-instrument/settings maintenance and external Play listing handoff despite iOS-led subject.
- PWA: **partial**. No fake Open Play wired to SW; package version only; native (build N) remains gap.
- Current code/tests: [AppUpdateControl.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/settings/AppUpdateControl.tsx); [play-app-update.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/settings/play-app-update.ts)
- Tracking: **known**; T21, T26. Priority **secondary**; dependencies T03, T08.
- Acceptance still required / boundary: Actual supported update/install/version metadata and truthful status; do not fabricate build code.

<a id="v07"></a>

### V07 — settings/platform

Phone portrait vs tablet rotation policy, navigation restoration and responsive accessibility.

- Native: **surviving**. [PhoneOrientationPolicy.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PhoneOrientationPolicy.kt); [MainActivity.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/MainActivity.kt)
- History: [13e0b65c](https://github.com/briansgithub/acquiring/commit/13e0b65c5c67ba5afcaeabfd361ec92d7823f95e). Phones portrait-locked; tablets rotate.
- PWA: **unverified**. Native threshold600dp survives; browser adaptation is not proved by responsive CSS alone.
- Current code/tests: [App.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/app/App.tsx); [AppShell.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/ui/shell/AppShell.tsx)
- Tracking: **known**; T26, T27. Priority **secondary**; dependencies T03, T08.
- Acceptance still required / boundary: Real orientation/viewport/keyboard/screen-reader/browser restoration and touch; owner platform requirements if constraints differ.

<a id="x01"></a>

### X01 — auth/sync/platform

Auth/account verification/reset/Google, cloud conflicts/RLS/guest merge and feature sync are PWA roadmap requirements, not native shipping behavior inferred from a title.

- Native: **uncertain**. [UserDataDatabase.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/UserDataDatabase.kt)
- History: [9ab27cee](https://github.com/briansgithub/acquiring/commit/9ab27ceeeadde93347d97096a9060656b75cdf98). Store favorites/playlists in separate durable database with DAO/tests and rollback.
- PWA: **missing**. Current namespace/outbox foundation only. Native audited sources do not establish a shipping server auth/sync implementation.
- Current code/tests: [tasks.json](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/docs/pwa-port/tasks.json); [index.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/user/index.ts)
- Tracking: **known**; T23, T24, T25. Priority **secondary**; dependencies T06, T23, T24, T25.
- Acceptance still required / boundary: Approved API/schema/RLS isolation and disposable integration proof before claiming auth/sync; no production writes in audit.

<a id="x02"></a>

### X02 — auth/sync/platform

PWA install/service-worker upgrade/cache compatibility/recovery/a11y/release gates.

- Native: **uncertain**. [MainActivity.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/MainActivity.kt); [PlayAppUpdate.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlayAppUpdate.kt)
- History: [13e0b65c](https://github.com/briansgithub/acquiring/commit/13e0b65c5c67ba5afcaeabfd361ec92d7823f95e). Phones portrait-locked; tablets rotate.
- PWA: **partial**. Native platform/lifecycle intent exists; PWA delivery requirements require their own evidence. No whole CI queried this audit.
- Current code/tests: [tasks.json](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/docs/pwa-port/tasks.json); [App.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/app/App.tsx)
- Tracking: **known**; T26, T27, T28. Priority **secondary**; dependencies T08, T26, T27, T28.
- Acceptance still required / boundary: Safari/BFCache/Pixel/physical mic/a11y/offline/update/release evidence and unchanged original gates.

<a id="a01"></a>

### A01 — Aural/curriculum

Seven evidence skills, deterministic generation/assessment/scheduling, supported-independent-transfer gates and four microphone task kinds.

- Native: **surviving**. [AuralCurriculum.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCurriculum.kt); [AuralPitchAssessment.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralPitchAssessment.kt); [AuralSession.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralSession.kt)
- History: [b6b19077](https://github.com/briansgithub/acquiring/commit/b6b19077041b4ca40705b79b74e710492775d395). Adds pure deterministic aural curriculum, seven distinct evidence skills, adaptive scheduling, supported/independent/transfer gates, four microphone tasks, durable provenance and one-shot audio; renames song Quiz UI to Playback.
- PWA: **partial**. Substantial pure native fixtures exist; routes currently only Library/Song/Playback/Settings/Help. Not a shipping Aural quiz UI.
- Current code/tests: [aural-generator.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/learning/aural-generator.ts); [aural-evidence.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/learning/aural-evidence.ts); [aural-scheduler.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/learning/aural-scheduler.ts)
- Tracking: **known**; T14, T18. Priority **last**; dependencies T03, T06, T07, T09, T14, T18.
- Acceptance still required / boundary: Preserve pure contracts; integrate actual Recognize/Recall/Sing inputs, playback/capture/assistance and durable evidence last.

<a id="a02"></a>

### A02 — Aural/curriculum

Recognize/Recall/Sing mode labels, explicit named target makes supported practice; family prerequisite/progress model survives old landing removal.

- Native: **surviving**. [AuralPracticeModes.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralPracticeModes.kt); [AuralCurriculum.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCurriculum.kt); [AuralQuizScreen.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralQuizScreen.kt)
- History: [a11f560b](https://github.com/briansgithub/acquiring/commit/a11f560bdebe4d4a36a3e0f3d4c20c4f2749e9ae). Adds family/progression hierarchy and Recognize/Recall/Sing tabs, named variant targets and persistence; selecting an answer-bearing progression always makes evidence supported practice.
- PWA: **partial**. Pure learning contracts do not render mode tabs/family navigation. Six-family landing itself is superseded.
- Current code/tests: [builtin-current.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/learning/builtin-current.ts); [routes.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/app/routes.ts)
- Tracking: **known**; T14, T17, T18. Priority **last**; dependencies T03, T08.
- Acceptance still required / boundary: Current catalog-first routes/modes/progress/family tree and supported evidence tests last.

<a id="a03"></a>

### A03 — Aural/corpus

Corpus settings/popularity/variety/favorites/inversions, deterministic selector cache, provenance and honest synthetic fallback.

- Native: **surviving**. [AuralCorpus.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCorpus.kt); [AuralExampleSettingsPanel.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralExampleSettingsPanel.kt)
- History: [06e48208](https://github.com/briansgithub/acquiring/commit/06e48208072b03523dbacf112e6524f4c0b3b39e). Integrates read-only corpus provider, bounded target cache and selected-payload loading; popularity/variety/favorites/inversion settings, source provenance, synthetic fallback and separate inversion evidence.
- PWA: **partial**. Existing pure provenance/generation layers are not full UI/provider integration; no fake production examples.
- Current code/tests: [aural-generator.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/learning/aural-generator.ts); [generator-contracts.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/learning/generator-contracts.ts)
- Tracking: **known**; T16, T18. Priority **last**; dependencies T05, T06, T14, T16.
- Acceptance still required / boundary: Source-backed provider/cache/settings/cancel/fallback tests, actual catalog/sample access and UI disclosure.

<a id="a04"></a>

### A04 — Aural/corpus

Familiarity uses positive physical-transition overlap, shared endpoint stays fresh; actual audible exposure begins beyond sourceStart. Corrupt exposure history is conservative.

- Native: **surviving**. [AuralSession.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralSession.kt); [AuralAudio.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralAudio.kt); [AuralCorpus.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCorpus.kt)
- History: [5f706322](https://github.com/briansgithub/acquiring/commit/5f706322eba3b1db93c0cd47ec2b6dae5994c32f), [40aa1a37](https://github.com/briansgithub/acquiring/commit/40aa1a3717b79a6c3bf2f26ab6b4947ecab8b7d5). Records exposure only after output playback head passes the source start beat, cancels stale callbacks and recovers valid learning fields from partial corruption; damaged exposure history forces supported practice.
- PWA: **partial**. 5f706322 contract fixtures selector-v2 verified; actual native playback-head/onStarted source read. Full product exposure bank/roundtrip remains unverified.
- Current code/tests: [evidence-contracts.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/learning/evidence-contracts.ts); [pcm-worker-session.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/audio/transport/pcm-worker-session.ts)
- Tracking: **known**; T16, T20. Priority **last**; dependencies T03, T08.
- Acceptance still required / boundary: Actual audible-start/stop/failure/overlap fixtures; preload must not mark heard, corrupt history cannot grant independent credit.

<a id="a05"></a>

### A05 — Aural/catalog

Catalog-first ranking/search, counts independent of display filters, global frequency defaults and min length2..9999.

- Native: **surviving**. [AuralCatalog.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCatalog.kt); [AuralCatalogScreen.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCatalogScreen.kt); [AuralRankEligibility.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralRankEligibility.kt)
- History: [c7ad1443](https://github.com/briansgithub/acquiring/commit/c7ad144302453abbcdf482128d055c09929f596a), [ee37a312](https://github.com/briansgithub/acquiring/commit/ee37a31293cd1ea1b9c9c67165c2c9e1279a8d22). Adds exhaustive compact offline progression catalog, exact paged ranking/tree/search, arbitrary pattern exercises, evidence/diagnostics, streaming bounded PCM and durable assisted Playback round-trip preserving answer draft.
- PWA: **partial**. SQL/statistics and rank eligibility kernels exist; remaining song-rank/reachable browser UI is last. ee37a312 adds global counts and chooser defaults.
- Current code/tests: [aural-statistics-query.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/catalog/aural-statistics-query.ts); [song-rank-eligibility.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/catalog/song-rank-eligibility.ts); [aural-statistics.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/aural-statistics.spec.ts)
- Tracking: **known**; T15, T17. Priority **last**; dependencies T05, T14, T15, T17.
- Acceptance still required / boundary: Original native ranking/order/count/filter fixtures plus full product results and deterministic page boundaries.

<a id="a06"></a>

### A06 — Aural/catalog

Mode/relative-major source provenance, chord-query accidental/type variants, reorder and Apply, start-group trees.

- Native: **surviving**. [AuralProgressionQuery.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralProgressionQuery.kt); [AuralCatalogScreen.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCatalogScreen.kt); [AuralProgressionSearch.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralProgressionSearch.kt)
- History: [2d36e72f](https://github.com/briansgithub/acquiring/commit/2d36e72f21b59c09c2979ce508cf7177cb04d295), [0373d5dd](https://github.com/briansgithub/acquiring/commit/0373d5ddf34d9a95006b3787561fb6559a5b3071). Button/chip progression query with chord degree/accidental/quality variants and reorder controls.
- PWA: **partial**. Pure query/worker targets do not establish current native search-chip/tree UI. 2d36e72f adds mode-aware analysis.
- Current code/tests: [aural-progression-query.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/catalog/aural-progression-query.ts); [aural-target-query.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/catalog/aural-target-query.ts); [routes.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/app/routes.ts)
- Tracking: **known**; T15, T17. Priority **last**; dependencies T03, T08.
- Acceptance still required / boundary: Source-key/mode/token/variant/reorder roundtrip fixtures and current tree/chip browser navigation last.

<a id="a07"></a>

### A07 — Aural/catalog

Songs tab hierarchy, recursive drill/return state, complete distinct song/section examples and robust identity lookup.

- Native: **surviving**. [AuralCatalogScreen.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCatalogScreen.kt); [AuralPatternSongs.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralPatternSongs.kt); [AuralCatalog.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCatalog.kt)
- History: [988dfc78](https://github.com/briansgithub/acquiring/commit/988dfc780b68b0ec5a78bce84e3549d71d9d553a). Adds sequence Songs tab, lazy distinct supporting-song browser, numbered recursive hierarchy and saved return tab/scroll/draft.
- PWA: **partial**. Read/query and queue parts exist; not a complete native catalog/Songs browser.
- Current code/tests: [aural-target-query.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/catalog/aural-target-query.ts); [song-queue.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/library/song-queue.ts); [routes.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/app/routes.ts)
- Tracking: **known**; T15, T17, T19, T20. Priority **last**; dependencies T03, T08.
- Acceptance still required / boundary: Recursive state/back/selection/source-section identity/missing-section and complete-example fixtures.

<a id="a08"></a>

### A08 — Aural/queue

Examples use complete queue, reversible whole-list shuffle, ordered saved playlist snapshot; repeat with previous/next even expanded.

- Native: **surviving**. [SongQueueViewModel.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/SongQueueViewModel.kt); [SongQueueControls.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/SongQueueControls.kt)
- History: [e968a210](https://github.com/briansgithub/acquiring/commit/e968a210b439137384a82dae7d571973f85555b9), [8bd55189](https://github.com/briansgithub/acquiring/commit/8bd551894c10682e42834afa975b1621f00b7bf6), [de8c2891](https://github.com/briansgithub/acquiring/commit/de8c2891e6d6cc1db4559277530d0345421bfd24). Examples opens full queue preview; reversible whole-order shuffle and selection/save before play.
- PWA: **partial**. Generic Library queue/play/shuffle/save integrated; Aural Examples entry/origin begin/identity unresolved. e968a210 and de8c2891 confirm current native changes.
- Current code/tests: [song-queue.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/library/song-queue.ts); [SongQueueScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/library/SongQueueScreen.tsx); [queue-playback.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/queue-playback.ts)
- Tracking: **known**; T19, T20. Priority **last**; dependencies T06, T08, T19, T20.
- Acceptance still required / boundary: Retain native shuffle/order/repeat/completion/cancel proofs; full Aural origin plus actual roundtrip last.

<a id="a09"></a>

### A09 — Aural/roundtrip

Open source passage in full Playback, preserve draft/evidence/return destination and header passage jump; compact embedded player deleted.

- Native: **surviving**. [AuralQuizScreen.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralQuizScreen.kt); [PracticeNavigation.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PracticeNavigation.kt); [PlaybackDestination.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackDestination.kt)
- History: [ca89c5cc](https://github.com/briansgithub/acquiring/commit/ca89c5cc93c86b0fd3d427c022bc0e3633575767). Removes compact embedded source player, requires normal full-song Playback, restores full controls and moves passage-jump into header.
- PWA: **partial**. Full Playback exists, session envelope kernel exists; no full Aural route/return wiring.
- Current code/tests: [PlaybackScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/PlaybackScreen.tsx); [session-envelope.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/domain/learning/session-envelope.ts); [routes.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/app/routes.ts)
- Tracking: **known**; T18, T20. Priority **last**; dependencies T03, T08.
- Acceptance still required / boundary: Actual question draft/heard/plays/attempts/support state before and after song navigation; no accidental independent credit.

<a id="a10"></a>

### A10 — Aural/install

Automatic full-v3 example catalog, serial install/reader release, progress and supported v1-v3 mode compatibility.

- Native: **surviving**. [AuralCatalogDownloader.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCatalogDownloader.kt); [AuralCatalogStore.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCatalogStore.kt)
- History: [c01d433b](https://github.com/briansgithub/acquiring/commit/c01d433b3b6b15681c4b5bafb1ffc954cdfbf976). Automatically deliver full-v3 example bundle and Settings update with byte progress, serialized install, validation and reader release.
- PWA: **partial**. Catalog infrastructure does not by itself prove complete current Aural bootstrap/product flow.
- Current code/tests: [sources.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/storage/catalog/sources.ts); [installer.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/catalog/installer.ts); [catalog-install.spec.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/tests/browser/catalog-install.spec.ts)
- Tracking: **known**; T05, T15, T26. Priority **last**; dependencies T03, T08.
- Acceptance still required / boundary: Version-bundle/progress/failure/restart/readers and full-size disposable install tests; no deployment.

<a id="d01"></a>

### D01 — removed experiments

Outer-repo stray interval tool was deleted; real native tool has separate introduction/lineage.

- Native: **removed**. [HummingIntervalPopup.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HummingIntervalPopup.kt)
- History: [8e496fee](https://github.com/briansgithub/acquiring/commit/8e496feee385b26e49518ae6383e02bbd94d0eb5). Deletes the exact stray HummingIntervalPopup file from the outer repository.
- PWA: **unverified**. Removed-source diff verified; do not count two tools or port deleted outer experiment.
- Current code/tests: [LINEAGE_PRIORITY.md](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/docs/pwa-port/LINEAGE_PRIORITY.md)
- Tracking: **removed**; T13. Priority **excluded**; dependencies none (excluded history).
- Acceptance still required / boundary: No implementation target; surviving current HummingIntervalPopup only.

<a id="d02"></a>

### D02 — removed experiments

Triple-tap persistent monitoring was replaced; old chord-tone selection type alone does not prove reachable current activation.

- Native: **removed**. [PlaybackView.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackView.kt); [PersistentPlaybackPitchPractice.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PersistentPlaybackPitchPractice.kt); [TripleClickable.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/TripleClickable.kt)
- History: [9973e748](https://github.com/briansgithub/acquiring/commit/9973e748fbecaf09db02575ff2f2339d4c7d7fc0), [86fd3959](https://github.com/briansgithub/acquiring/commit/86fd395917446b7b7df3200162ea2302fdfbfa29), [45e7012e](https://github.com/briansgithub/acquiring/commit/45e7012ed33d18cded02093780152494461009bd). Rotary tempo/arpeggio/mix controls and updated streaming/pitch practice behaviors with regressions.
- PWA: **unverified**. 9973e748 adds tripleClickable;86fd3959 removes card triples; current header chooses SimpleRoot/Melody and chord cards combinedClickable only. ChordTone resolver/type remains.
- Current code/tests: [persistent-pitch.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/persistent-pitch.ts)
- Tracking: **removed**; T12, T13. Priority **excluded**; dependencies none (excluded history).
- Acceptance still required / boundary: Do not invent triple/chord-tone entry point. If future scope proposes one, establish reachable pinned caller first. N01 root header independently survives.

<a id="d03"></a>

### D03 — removed experiments

Puck/draggable target/calibration/comfortable-pitch capture removed; octave selector is replacement.

- Native: **removed**. [HummingIntervalPopup.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/HummingIntervalPopup.kt); [SongOctaveOffset.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/SongOctaveOffset.kt)
- History: [45e7012e](https://github.com/briansgithub/acquiring/commit/45e7012ed33d18cded02093780152494461009bd). Remove tessitura/calibration/hints; add saved song octave owner, displayed-name search, revised cards/help.
- PWA: **unverified**. Calibration deletion patch and current octave selector inspected; retain only current source behavior.
- Current code/tests: [LINEAGE_PRIORITY.md](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/docs/pwa-port/LINEAGE_PRIORITY.md)
- Tracking: **removed**; T13. Priority **excluded**; dependencies none (excluded history).
- Acceptance still required / boundary: No calibration implementation target.

<a id="d04"></a>

### D04 — removed experiments

Floating movable transport and background media notification service retired; fixed foreground transport survives.

- Native: **removed**. [PlaybackTransportBar.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackTransportBar.kt); [PlaybackController.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/PlaybackController.kt)
- History: [1c674526](https://github.com/briansgithub/acquiring/commit/1c6745262f69aaf7996d7e246c8c0834d77c8002), [f89a775c](https://github.com/briansgithub/acquiring/commit/f89a775cd3b8e14a6998e20a974cbbdd50792544). Fixed Play/beat-step/Reset/section row replaces floating transport.
- PWA: **unverified**. 1c674526 removes floating offsets; f89a775c retires service. Current transport exposes reset/play and queue previous/next, not proof old beat-step buttons survive.
- Current code/tests: [PlaybackScreen.tsx](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/features/playback/PlaybackScreen.tsx)
- Tracking: **removed**; T08, T12. Priority **excluded**; dependencies none (excluded history).
- Acceptance still required / boundary: Do not port historical movable/beat-step assumption from plan without current caller evidence.

<a id="d05"></a>

### D05 — removed experiments

Old Quiz naming, six-family landing, length-first ranks and compact source player superseded; family curriculum data still survives.

- Native: **removed**. [AuralCatalogScreen.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCatalogScreen.kt); [AuralCurriculum.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/AuralCurriculum.kt)
- History: [b6b19077](https://github.com/briansgithub/acquiring/commit/b6b19077041b4ca40705b79b74e710492775d395), [10b2dee3](https://github.com/briansgithub/acquiring/commit/10b2dee3f27917da4191f887cd047c890cc42564), [ee37a312](https://github.com/briansgithub/acquiring/commit/ee37a31293cd1ea1b9c9c67165c2c9e1279a8d22), [ca89c5cc](https://github.com/briansgithub/acquiring/commit/ca89c5cc93c86b0fd3d427c022bc0e3633575767). Adds pure deterministic aural curriculum, seven distinct evidence skills, adaptive scheduling, supported/independent/transfer gates, four microphone tasks, durable provenance and one-shot audio; renames song Quiz UI to Playback.
- PWA: **unverified**. b6b rename, catalog history and ca89c5cc player deletion distinguish data from discarded landing.
- Current code/tests: [LINEAGE_PRIORITY.md](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/docs/pwa-port/LINEAGE_PRIORITY.md); [routes.ts](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/pwa/src/app/routes.ts)
- Tracking: **removed**; T14, T15, T17. Priority **excluded**; dependencies none (excluded history).
- Acceptance still required / boundary: No resurrection of obsolete presentation; current catalog-first/family prerequisites inventory remains A02/A05/A06.

<a id="d06"></a>

### D06 — lineage/rename

SacredRing -> Inquiring -> Acquiring and monorepo moves are identity/path ancestry, not three copies of features.

- Native: **surviving**. [MainActivity.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/MainActivity.kt); [UserDataDatabase.kt](https://github.com/briansgithub/acquiring/blob/801cf7984171d772afc4406ddb5c79c0cb7fd20a/android/app/src/main/java/com/acquiring/android/UserDataDatabase.kt)
- History: [8cce75cb](https://github.com/briansgithub/acquiring/commit/8cce75cb357f043a4c94326d2953950618581cda), [007a8eb4](https://github.com/briansgithub/acquiring/commit/007a8eb4310403a65cb2f5347d380650c0da2db1), [20ec5c7e](https://github.com/briansgithub/acquiring/commit/20ec5c7eafda091e6c7fdd59b3f383c9c446c3f3). Rebrand/reorganize monorepo paths and source references; retire earlier conversion artifact.
- PWA: **implemented**. 8cce75cb/007a8eb4 rename diffs and20ec5c7e move/URL changes reviewed; old evidence paths remain historical.
- Current code/tests: [HISTORY.md](https://github.com/briansgithub/acquiring/blob/7b889f1c4b1cb55a7c807522e2a3aacfb4fb85d5/docs/pwa-port/HISTORY.md)
- Tracking: **known**; T00, T02. Priority **secondary**; dependencies T00, T02, T06.
- Acceptance still required / boundary: Preserve data identity/migration contracts if affected; do not duplicate port work from rename subjects.

## Audit validation

`python docs/pwa-port/validate_feature_ledger.py` verifies frozen source/historical references, task IDs, coverage hashes, enums, NEW count and exact generated-document consistency. This validates audit integrity, not product parity. The older `validate_audit.py` exits1 at its task-graph line70: T11 complete depends on T08 in_progress. RUNBOOK/tasks already allow the T08 static-preview milestone; the old validator does not honor that milestone. T22 also currently uses `in-progress`, outside that validator’s underscore enum (not reached in this run). Neither status nor validator assertion was changed. No acceptance is rewritten to make it green.

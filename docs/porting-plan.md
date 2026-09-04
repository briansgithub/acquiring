# Android-to-iOS feature-by-feature port

This is the only active execution plan for the native iOS port. Android
behavior at annotated tag `android-parity-ios-v1` is authoritative. Stable
capability IDs and release status live in [feature-parity.md](feature-parity.md),
while [android-app-analysis.md](android-app-analysis.md) records the audited
behavior. The old commit-by-commit checklist is retained only as a historical
pointer in [ios-android-parity-roadmap.md](ios-android-parity-roadmap.md).

## Goal and baseline

- Continue from `claude/ui-reset`; retain the tested `AcquiringKit`, catalog,
  audio/DSP, persistence, and `AppEnvironment` work.
- Rebuild the UI in the order surviving product features first appeared on
  Android, but implement each feature once in its final shipping form.
- Treat a later Android fix or redesign as acceptance criteria for the feature
  it refined. Give it a new checkpoint only when it added a new observable
  capability.
- Use native SwiftUI presentation while matching final behavior, information
  hierarchy, state transitions, and accessibility.
- Stop after every checkpoint for human UI/function review unless the active
  user-authorized fast track explicitly batches review through Phases 0-2.
  Automated evidence is necessary but never sufficient for approval.

Baseline verified September 4, 2026:

- `swift test --package-path ios/Packages/AcquiringKit --quiet` passed 164 tests.
- The `Acquiring` scheme built for the available iPhone 17 simulator.
- `AllSongsView`, `PlaylistSongsView`, and `SongDetailView` are intentional blank
  placeholders after the UI reset. Several UI tests still describe the removed
  screens and must not be treated as current passing evidence.

Do not copy the numeric test total into other status prose. Evidence rows record
the actual command, date, pass/fail/skip counts, and result bundle for each run.

## Status and traceability

Each checkpoint uses one status:

- `[ ]` not started
- `[review]` implemented and autonomously verified; awaiting human critique
- `[approved]` human accepted the checkpoint
- `[blocked-external]` requires unavailable hardware, service, or authority
- `[excluded]` absent from the final Android product or explicitly out of scope

Each approved row records its Android introduction commit, final Android source,
parity IDs, iOS commit, automated checks, screenshot/result bundle, and human
approval date. Source or test presence without a production caller is not
evidence of an Android feature.

## Per-checkpoint execution loop

1. Inspect the feature's first Android commit and its final production call site
   at `android-parity-ios-v1`.
2. Reuse existing Swift domain and service APIs. Add only the smallest store,
   view wiring, fixture, or interface required for the observable slice.
3. Add a deterministic `#Preview`, focused unit/store coverage, and one focused
   XCUITest. Never grow a multi-feature end-to-end test for convenience.
4. Run the narrowest relevant checks, rebuild, terminate any stale app process,
   reinstall/relaunch on the one warm simulator, exercise the behavior, and
   capture the review state with `XCTAttachment`.
5. Repair failures autonomously. Stop early only for new external authority,
   unavailable hardware, or a reproducible environment blocker after two
   diagnose/fix cycles.
6. Present a review packet: checkpoint ID, final Android behavior, screenshot,
   short interaction script, commands/results, and deliberate iOS adaptations.
7. Stop for human review after each checkpoint unless the active user-authorized
   fast track is batching review through Phases 0-2. If critiqued, remain on the
   same checkpoint. After approval—or, during the fast track, after the batched
   review packet is assembled—commit the implementation, tests, evidence, and
   status together, then advance.

For existing iOS code, verify and repair rather than rewrite it. Existing code
starts unapproved regardless of earlier roadmap checkmarks.

## Implementation boundaries

- Preserve `CatalogRepository`, `CatalogMaintenanceService`, `PreviewAudio`,
  `QuizTransport`, `PitchSource`, `AppEnvironment`, and the current package
  boundaries.
- Keep `LibraryStore`. Add focused `@MainActor @Observable` stores for Song
  Detail, All Songs, Quiz, interval practice, and tessitura as their checkpoints
  require them; do not reproduce Android's monolithic `MainActivity` state.
- Views never open GRDB, SwiftData, URLSession, AVAudioEngine, or microphone
  input directly.
- Add UI-test-only review scenarios through launch arguments and injected
  repositories/audio/pitch sources. Review configuration must not alter
  production behavior.
- Prefer standard SwiftUI controls. Custom drawing is limited to notation,
  timelines, pitch/scoring markers, and the product-required draggable
  transport.
- Centralize quiz-card gestures in one native interaction layer that arbitrates
  single tap, double tap, and long press so exactly one action fires, and expose
  equivalent named VoiceOver actions.

## Ordered atomic roadmap

Every numbered row is an agent checkpoint with status, capability IDs, model,
reasoning level, and concise acceptance. Agent work may include invisible
hardening, but only the phase-level human gates are review stops. Route the
least-cost capable model: Luna for bounded UI/documentation, Terra for stateful
integration, and Sol for audio/DSP, persistence replacement, timing,
concurrency, and release work.

### Phase 0 — Truth and review harness

1. `[review]` **0.1 Canonical plan (F001-F055).** **Luna/low.** Consolidate this
   plan, archive the deployment diary, and leave the old roadmap as a pointer.
2. `[review]` **0.2 Baseline reconciliation (F002, F004, F006-F012, F054).**
   **Luna/low.** Correct debounce claims, volatile test totals, blank-screen
   status, and over-broad Android-history skips.
3. `[review]` **0.3 Focused UI test inventory (F001-F054).** **Terra/medium.** Split
   stale post-reset tests by feature and mark pending parity tests with reasoned
   `XCTSkip`; release still requires zero skips.
4. `[review]` **0.4 Deterministic review fixtures (F001-F054).** **Terra/medium.**
   Add only the launch arguments, injected services, and small-data previews
   needed to reproduce each visual state without changing production behavior.

Human gate 0 — **Harness packet** — **Luna/low**, then **Terra/medium** for
fixture integration. Review baseline truth and the deterministic review method;
it is not human-approved yet.

### Phase 1 — Library and catalog acquisition

Android chronology: `0b7abac8` through `2f891ebe`'s Library/catalog work.

1. `[review]` **1.1 Library launch shell (F001).** **Luna/medium.** Show native dark
   loading, empty, ready, and failure states with stable identifiers.
2. `[ ]` **1.2 Manual harvest (F011).** **Terra/high.** Validate Hooktheory URL;
   show progress, retry/cancel, completion, and retained-catalog messaging.
3. `[ ]` **1.3 First catalog install (F010, F012).** **Terra/high.** Install a
   valid artifact with visible progress, cancellation, failure/retry, refreshed
   count, and an empty-catalog prompt.
4. `[ ]` **1.4 Resync, recovery, and durability (F010, F012, F053).**
   **Sol/high** (escalate to **Sol/xhigh** only for actual core recovery or
   durability work). Validate contract/schema/row floor/payloads, atomically swap,
   preserve a backup, recover failed/cancelled replacements, and retain user
   entries. No search or detail UI is included in Phase 1.

Human gate 1 — **Library/catalog packet** — **Terra/medium** for visible states;
**Sol/high** for install/recovery evidence. Batch this gate with gate 2 under
the fast-track authorization; do not mark it approved without human review.

### Phase 2 — Search, selection, Song Detail, and Chords

Android chronology: remaining `0b7abac8` through `2f891ebe` feature work.

1. `[ ]` **2.1 Title search input (F002).** **Terra/medium.** No autofocus,
   300 ms debounce, clear action, and loading/empty/error states.
2. `[ ]` **2.2 Title suggestions and paging (F002).** **Terra/high.** Render
   complete cards, 20-row pages, Load More, and retain prior results on paging
   failure.
3. `[ ]` **2.3 Song selection (F002, F010, F014).** **Terra/medium.** Exclude
   missing-payload rows, expose malformed-payload errors, record history, and
   enter Quiz first.
4. `[ ]` **2.4 Recent songs (F003).** **Terra/medium.** Blank-query view shows
   ten MRU items resolved against the current catalog and refreshes on return.
5. `[ ]` **2.5 Header and section selector (F014-F015).** **Terra/high.**
   Preserve artist/favorite actions, canonical ordering, and section changes.
   Normalize section types, de-duplicate by normalized type, and keep the
   earliest explicit index for each type.
6. `[ ]` **2.6 Info overview (F016).** **Terra/medium.** Show key, tempo, meter,
   duration, beats/bars, chord counts, and sounded/total melody counts,
   including chord-only songs.
7. `[ ]` **2.7 Info detail and links (F017).** **Terra/medium.** Show progression
   and change lists, source metadata, slug, system-browser links, and
   progression-pill preview.
8. `[ ]` **2.8 Chords inventory (F018).** **Terra/high.** Remove rests, dedupe,
   adapt the grid, handle empty/failure states, and use key-at-chord-onset.
9. `[ ]` **2.9 Semantic chord display (F019, F021-F024).** **Terra/high.**
   Support Roman/letter selection and fitted inversion, accidental, applied,
   and borrowed-harmony notation.
10. `[ ]` **2.10 Chord preview (F020).** **Sol/high.** Support block/arpeggiated
    modes, 30-1000 ms step, cancellation, fades, and replacement.

Human gate 2 — **Search/Detail/Chords packet** — **Terra/high** for navigation,
state, and notation; **Sol/high** for preview cancellation/replacement. Batch
with gate 1; no human approval is implied by `[ ]` status.

### Phase 3 — Quiz

1. `[ ]` **3.1 Quiz shell and navigation (F014, F026).** **Terra/high.** Final
   header, Full/Root-only selector, Hooktheory action, and exact-origin
   Quiz → Info → Back behavior.
2. `[ ]` **3.2 Chord timeline (F025).** **Terra/high.** Render durations, gaps,
   key-at-onset notation, fixed playhead, and reduced-motion behavior.
3. `[ ]` **3.3 Melody timeline (F025).** **Terra/high.** Render pitch, duration,
   rests, overlap, key regions, and live playhead.
4. `[ ]` **3.4 Play/pause transport (F027, F038).** **Sol/high.** Publish live
   state from app-scoped synthesized melody/chord audio.
5. `[ ]` **3.5 Loop/reset/section continuity (F027, F029, F038).** **Sol/xhigh.**
   Seamlessly wrap, cancel reset, and preserve requested play state.
6. `[ ]` **3.6 Active chord/root card (F035).** **Terra/high.** Bind notation to
   events, roots, rests, and modulation.
7. `[ ]` **3.7 Tempo/timbres/balance (F030, F032, F034).** **Terra/medium.**
   Provide 0-200% tempo with reset/zero pause, ten instruments with sawtooth
   default, labeled 0.5 balance, headroom, and progress preservation.
8. `[ ]` **3.8 Card previews (F035-F036).** **Sol/high.** Root, melody, interval,
   chord, and chord-tone previews cancel exclusively without click-through.
9. `[ ]` **3.9 Root interval and melody cards (F026, F035-F036).** **Terra/high.**
   Derive previous/current intervals, spell them, handle rests, and implement
   collapse/repeat and chord-tone rows.
10. `[ ]` **3.10 Root-only and Lock in Major (F026, F028, F037).** **Terra/high.**
    Hide full-only surfaces, provide native seek, preserve playback, and use
    fixed relative-Ionian/major spelling.

Human gate 3 — **First coherent Quiz UI** — **Terra/high**, escalating to
**Sol/high** for transport and loop behavior. This is the first product review
after the Phase 0-2 fast track.

### Phase 4 — Interval tool and timeline seeking

1. `[ ]` **4.1 Interval shell (F043-F044).** **Terra/high.** Collapsed/expanded
   manual and target modes, cancellation, and deterministic fake-pitch state.
2. `[ ]` **4.2 Microphone ownership (F040-F041).** **Sol/xhigh.** Just-in-time
   permission, exclusive lease, denial/error states, stale-owner safety, cleanup.
3. `[ ]` **4.3 Two-slot capture (F043).** **Sol/high.** Three-second capture,
   stable window, silence/dropout handling, and independent slot state.
4. `[ ]` **4.4 Live feedback and gestures (F043-F044).** **Sol/high.** Measured
   pitch/spelling/cents, interval direction/name, exact replay, and rerecord
   arbitration.
5. `[ ]` **4.5 Pair playback, Flip-Flop, seeking (F043, F045, F028).**
   **Sol/xhigh.** Support pair/alternating playback, final pause, bounded drag,
   and pause/resume arbitration.

Human gate 4 — **Interval/seeking packet** — **Sol/xhigh** for ownership,
capture, and seek arbitration; **Terra/high** for presentation.

### Phase 5 — All Songs and sing-back/actions

1. `[ ]` **5.1 All Songs shell and alphabetical browse (F006).**
   **Terra/medium.** Provide entry, states, A-Z/0-9/# groups, counts, one
   expanded group, indexed navigation, and sorted rows.
2. `[ ]` **5.2 Complexity and mode browse (F007-F008).** **Terra/medium.**
   Provide ten complexity buckets, Unrated, seven canonical modes, counts, and
   cross-mode membership.
3. `[ ]` **5.3 Fuzzy filter and restoration (F009).** **Terra/high.** Normalize
   title/artist matching, filter locally at 250 ms, show no-match/legacy
   warning, and restore grouping/filter/expansion/scroll without payload loads.
4. `[ ]` **5.4 External search (F005).** **Luna/low.** Open Hooktheory in the
   system browser with unavailable/failure and return continuity.
5. `[ ]` **5.5 Sing-back (F042).** **Sol/high.** Double tap root, melody,
   interval, or chord tone into target-guided listening after preview settles.
6. `[ ]` **5.6 Shared gestures and transpose (F031, F035-F036, F042, F046, F054).**
   **Sol/xhigh.** Arbitrate exactly one single/double/long action, expose named
   VoiceOver actions, and apply -12...+12 transpose once everywhere.
7. `[ ]` **5.7 Melody interval actions (F035-F036, F042).** **Sol/high.**
   Separate previous, current, together, and sing-back operations.

Human gate 5 — **Discovery/card-actions packet** — **Terra/high** for browse and
gestures; **Sol/high** for sing-back/audio coordination.

### Phase 6 — Tessitura and persistent practice

1. `[ ]` **6.1 Tessitura modal and calibration (F048).** **Sol/high.** Permission,
   cancel/error/retry, three voiced seconds, final-two-second average, silence
   pause, and dropout grace/restart.
2. `[ ]` **6.2 Target placement/presentation (F048-F049).** **Terra/high.**
   Comfortable window, interval unit, contour/tritone rules, anchor, octave
   stepper, and clear-adjustment/session distinction.
3. `[ ]` **6.3 Timeline targets and transport (F029, F042, F046, F049).**
   **Sol/high.** Follow root/melody/interval/chord tones, save normalized drag,
   reset, continue sections, and offer accessible non-drag control.
4. `[ ]` **6.4 Persistent practice modes (F046).** **Sol/high.** Long-press root,
   low-latency melody/rest, chord-tone clamping, and index restoration.
5. `[ ]` **6.5 Pitch gauge and run scoring (F046-F047).** **Sol/xhigh.** Show
   bounded live marker/no-signal state; score contiguous settled runs with
   median, unscored result, marker, and badges.
6. `[ ]` **6.6 Final header/navigation (F014, F025).** **Terra/medium.** Compact
   native arrangement without changing state ownership.

Human gate 6 — **Practice packet** — **Sol/high** for DSP/timing/scoring;
**Terra/high** for presentation and accessibility.

### Phase 7 — Platform audio and media

1. `[ ]` **7.1 Arpeggiation/settings (F029-F034, F049).** **Terra/medium.**
   Support the full picker, off default, four-cycle maximum, and exact setting
   continuity/reset semantics.
2. `[ ]` **7.2 Audio hardening (F036, F038).** **Sol/high.** One audio session,
   off-main synthesis, native output rate, and no click-through.
3. `[ ]` **7.3 Now Playing/remotes (F039).** **Sol/high.** Publish section,
   elapsed state and remote play/pause/stop/seek events.
4. `[ ]` **7.4 Interruptions/routes/cleanup (F027, F038-F039, F041-F049).**
   **Sol/xhigh.** Recover background/lock/route changes and release microphone
   ownership while rejecting stale results.

Human gate 7 — **Platform-media packet** — **Sol/high**, escalating to
**Sol/xhigh** for background, routes, and concurrency.

### Phase 8 — Favorites and playlists

1. `[ ]` **8.1 Favorites (F050).** **Terra/medium.** Built-in Favorites,
   optimistic rollback, hollow star, uniqueness, and errors.
2. `[ ]` **8.2 Playlist Library section (F051).** **Terra/medium.** Accordion
   summaries/counts, states, expansion persistence.
3. `[ ]` **8.3 Playlist page and durability (F051, F053).** **Terra/high.**
   Newest-first songs, Quiz navigation, swipe removal, unresolved-slug hiding,
   and survival across successful/failed/cancelled catalog replacement.

Human gate 8 — **User-library packet** — **Terra/medium** for persistence,
restoration, and errors. F052 custom-playlist management UI remains excluded.

### Phase 9 — Accessibility and release

1. `[ ]` **9.1 Accessibility/adaptive audit (F054).** **Terra/high.** Verify
   VoiceOver, Dynamic Type, reduced motion, focus, orientations, small phone,
   and iPad evidence.
2. `[ ]` **9.2 Clean install and recovery release checks (F010, F012, F039, F053).**
   **Sol/high.** Verify full catalog, upgrade/offline, interrupted download,
   background soak, privacy, and durable user data.
3. `[ ]` **9.3 Archive and release gate (F001-F054).** **Sol/xhigh.** Verify
   archive/signature/manifests, zero pending/skipped parity tests, and required
   release evidence. TestFlight remains explicit-only.

Human gate 9 — **Release sign-off** — **Terra/high** for accessibility/adaptive
review; **Sol/xhigh** for release integration and hardware/background diagnosis.

### Fast-track review policy

The user authorized batching human review and accepting checkpoint commits
through Phases 0-2, even at the expense of broad testing, provided focused
tests, deterministic previews, and screenshots are retained. After those
commits, stop at Human gate 3 with the first coherent Quiz UI. Broad matrices,
full parity-test cleanup, and TestFlight remain deferred until explicitly
requested or until Phase 9.

## Verification matrix

- Static visual changes: deterministic `#Preview`, focused view/store test,
  simulator build, relaunch, screenshot.
- Interactive changes: targeted XCUITest with stable accessibility identifiers
  and an attached post-interaction screenshot.
- Shared theory/catalog/audio changes: targeted tests during iteration and the
  entire Swift package suite at the phase boundary.
- Phase boundary: iPhone 17 and iPhone 14 Pro simulators in portrait and
  landscape, one booted simulator at a time.
- Hardware-only behavior: user-authorized TestFlight on the available iPhone;
  perceptual audio, microphone, interruptions, lock screen, headphones, and
  Bluetooth remain incomplete until signed by the human reviewer.
- Release: zero pending/skipped parity tests and complete required iPad evidence.

## Explicit exclusions and defaults

- `[excluded]` F013 missing-payload auto-harvest, F052 custom-playlist management
  UI, and F055 unused audiation container.
- `[excluded]` the puck/magnifying-glass UI, unused `TripleClickable` helper,
  obsolete Quiz skip button, database verification/search-by-slug controls,
  transient layouts, 55% balance intermediate, renames/icons, Android build work,
  and monorepo/release-only commits.
- Preserve the final gestures that replaced the magnifying glass: single tap
  preview, double tap sing-back, and long press persistent practice.
- Target iOS 17+, English, dark presentation, iPhone/iPad, both orientations,
  background audio, Dynamic Type, VoiceOver, and reduced motion.
- Open Hooktheory and YouTube in the system browser; do not add an in-app browser
  or region-specific policy.
- Normal review uses the iPhone 17 simulator; phase review adds iPhone 14 Pro.
  Do not claim iPad or hardware completion without corresponding evidence.
- TestFlight is an external action and runs only after explicit user direction.

# Android Aural Quiz

Status: implemented for human testing. Open **Library → Aural Quiz · learn by ear**. No song or catalog download is required. Browse **family → progression → Recognize / Recall / Sing** for targeted practice. **Next** keeps the progression and tab, choosing the next suitable activity with a new realization. **Adaptive** follows the curriculum scheduler; **Continue** resumes the pending exercise. The existing full-chord/root-only song page is now called **Playback**.

This is the first part of the project. Song-database selection, popularity weighting, occurrence indexes, native iOS parity, and the web curriculum UI are deliberately excluded pending human feedback.

## Curriculum navigation

The landing page groups progressions into six family cards. Each family opens its ordered progression diagrams. Selecting a progression opens three tabs: **Recognize, Recall, Sing**. Recognize includes a brief introduction for unfamiliar progressions, comparison and identification. Recall includes reconstruction, missing chords and silent endings. Sing includes root, bass, scale degree and root-sequence tasks. Play and optional **Guide** are actions within these activities, not separate tabs. All three tabs are reachable for supported exploration; independent prerequisite gates still apply to Adaptive. Changing tabs cancels playback/capture and resets the response without grading. Back moves through the hierarchy. Continue restores the pending progression, activity and corresponding tab; interruptions and resumed exercises remain practice.

Chord tiles show order visually, a large play/replay/stop button controls listening, and short prompts replace the former instruction paragraphs. Hints, family progress details, microphone preferences, and learning explanations live behind small controls or the info button. The three family dots correspond to Recognize, Recall and Sing: outlined = new, filled = practicing, check = mastered. A tab receives a mastery check only when all its assessed skills are mastered; guided listening is introductory practice. Detailed **family × skill** evidence remains separate in the info panel, not merged into one score or presented as mastery of each individual progression. Status has accessibility labels as well as color.

Selecting a named progression reveals its identity by design, so **all selected-progression exercises remain practice even after guidance fades**. This is enforced both in the session and pure evidence engine. Adaptive hides the family/progression breadcrumb and solution before an unsupported answer; its independent and transfer checks remain separate. Explicit progression selection is an optional generator target field, validated within the family and retained in saved provenance and attempt history. The original random draw is preserved for backward-compatible generation of existing seed-only examples.

For named practice, the app chooses activities within a tab: one introductory acknowledgement leads directly into comparison; four successful responses prepare the next activity, with weak activities repeated and older activities revisited after all are introduced. Recall similarly builds from reconstruction to missing chords and silent endings. These are supported-practice readiness rules, not independent mastery gates. Singing automatically chooses a less-practiced task kind, repeats a failed kind, and permits manual selection. Existing seven skill identifiers, saved attempts, assistance rules and the independent Adaptive scheduler remain unchanged.

## Learning design

The learner moves from hearing with functional guidance through distinguishing, identifying, recalling, completing a modeled progression, internally hearing its silent ending, and singing. A separate evidence cell exists for every harmonic family × aural skill. Recognition does not establish recall, audiation, or reproduction mastery.

| Family | Relationships | Prerequisites |
| --- | --- | --- |
| Dominant return | V–I; I–V–I | None |
| Plagal return | IV–I; I–IV–I | Dominant recognition |
| Preparing the dominant | ii–V–I; IV–V–I; I–ii–V–I | Dominant and plagal recognition |
| Deceptive return | V–vi; ii–V–vi; I–V–vi | Dominant recognition |
| Relative motion | I–vi; I–vi–IV–I; vi–ii–V–I | Plagal and deceptive recognition |
| Dominant of the dominant | V/V–V–I; I–V/V–V–I | Predominant and relative-motion recognition |

Each skill begins with full guidance. After two successful first responses in supported practice it uses a starting-chord cue and a broader realization pool. After four it can test without guidance. Four guided listening acknowledgements prepare the first distinction phase; subsequent phases require at least two independent successes and at least 60% recent accuracy in the preceding skill. New families require the same evidence in prerequisite recognition. Unlocking a phase means ready to learn it, not mastered.

Distinction starts with two similar, same-length alternatives; identification increases the choice count. Recall uses a constant chord vocabulary without candidate progressions. Missing-harmony and silent-ending exercises first establish a complete model, then replay it with an exactly timed silent slot. This gives a defined answer instead of treating one of several valid harmonizations as uniquely correct. Responses are indirect evidence of internal hearing; they do not prove a private mental experience or assess free composition.

Realizations vary across major keys, inversions, register, spread voicings, tempo, and preceding harmonic context. Quiz playback uses the **Default Instrument** selected in the main Settings screen; changing that preference intentionally replaces automatic timbre variation. Pools widen with support removal. Transfer adds different tempo/context/voicing combinations. The existing `ChordInterpreter` supplies actual notes and applied-dominant semantics; `V/V` is a distinct token from diatonic `ii`. Difficulty includes function, harmonic context, inversion, memory demand, and assistance—not just chord count.

## Evidence and adaptive review

- Named-progression selection, full or partial guidance, hints, replays, retries, resumed questions, interrupted playback, and familiar realizations are practice. The engine additionally enforces eligibility; the screen cannot award independent evidence merely by displaying an “independent” badge.
- Exposure is persisted before playback. Familiarity uses sounding content, not the random seed or phase. Intentional same-example retries remain supported.
- Mastery requires six independent successes, at least six recent independent observations, at least 80% accuracy in the last eight, successes in three keys, and two transfer successes. Thresholds are initial product choices requiring human calibration.
- Independent success spaces review from one day up to 30 days. A mistake schedules a short review (about 58 minutes). Assisted success never erases that failure, resets its streak, or pushes its review out. Recent accuracy permits recovery after early mistakes.
- Scheduling interleaves weak cells, due review, gradual introductions, phase advancement, and transfer. Prerequisites are rechecked; weaknesses can return the learner to a foundational relationship.
- The microphone phase introduces each task kind with support before crediting it independently. Reproduction readiness additionally requires an independent success in all four kinds; counts remain separately available within the reproduction cell.

## Microphone and audio

Tasks explicitly request a chord root, the actual lowest voiced bass note, scale degree 1/3/5 of the established key, or roots in progression order. Root sequences are captured one note at a time, with no correctness feedback until the full sequence is complete. Sing in any comfortable octave; this release assesses pitch class and sequence order, not register or rhythm reproduction. Context chords are separated from exercise chords by a pause and described in the listening status.

The existing microphone tracker supplies confidence and held-estimate information. The assessor requires stable, confident voiced evidence; silence, held readings, insufficient coverage, unstable pitch, missing sequence boundaries, capture errors, and lost microphone ownership yield **uncertain**. An uncertain capture does not increment musical errors or mastery. Permission denial offers a retry or microphone opt-out. No microphone audio is saved or uploaded.

`AuralAudio` uses the existing `PlaybackPcmRenderer` and `AppAudioOutput` session. It owns one-shot output separately from looping song transport, preserves silent durations, and waits for the actual playback head before allowing a response or capture. Cancellation, replacement, output stalls, focus loss, navigation, lifecycle changes, and headphone disconnection release output. Global song transpose does not alter a generated exercise. All reference, model and exercise chords use the saved default instrument, independently of temporary instrument choices in Playback. The same full Settings screen is available through the Aural Quiz header’s gear. Opening Settings stops active playback/capture and returning preserves the selected progression and phase. Changing instrument updates the pending example’s instrument provenance and exposure identity without changing its harmony, timing or answer; an already-heard example remains practice. Completed results keep the instrument actually heard.

The curriculum screen does not mount the existing song chord displays or pitch gauge. Before an unsupported response it renders generic skill instructions, answer alternatives or a constant vocabulary, and task-specific singing instructions. Full guidance enters the Compose/accessibility tree only during supported practice or after grading. A hint immediately makes the attempt supported.

Quiz playback is raised **one octave (+12 semitones)** from the original register range, including key references and modeled repetitions. Root, bass and scale-degree targets move with it; singing still accepts any comfortable octave. The shift is stored in the generator target and attempt provenance. Older saved examples remain reproducible and pending questions migrate when opened, without erasing learning progress.

Adjacent quiz chords now sustain to the next onset with a short **20 ms overlap**, replacing the former 10% dead-air gap. The reference/model separator is shortened from two beats to **0.75 beats**. Written missing-harmony slots and the two-beat internal-hearing tail retain their full duration; no overlap enters these rests. Chord onset tempo stays unchanged.

## Architecture and persistence

- `AuralCurriculum.kt`: data-driven family definitions, pure deterministic generation, prerequisites, scheduler, evidence updates and normalization.
- `AuralSession.kt`: single attempt owner; playback-before-response guard, duplicate-submission guard, assistance, resumption and persistence failures.
- `AuralPracticeModes.kt`: three presentation groups and activity selection within named-progression practice; no merged mastery storage.
- `AuralQuizScreen.kt` / `AuralQuizComponents.kt`: hierarchical Compose navigation, mode tabs, chord diagrams, help/progress dialog, permissions and lifecycle cancellation.
- `AuralAudio.kt` / `AuralPitchAssessment.kt`: output lifecycle, timed silence, confidence assessment and cancellable capture.

Progress is versioned JSON in separate `aural_curriculum_v1` SharedPreferences; catalog replacement cannot remove it. The UI rename preserves this storage key. Existing Playback practice statistics are not imported because their assistance history is unknown. Writes report failure while allowing in-memory practice. Corrupt/incompatible progress starts fresh; an invalid unfinished example is discarded while valid progress is preserved. Returning to an unfinished example conservatively marks it supported.

Current examples persist their full provenance: seed, generator version, target family/phase/support/transfer/subtype/optional selected variant/default instrument override, realized variant, key, tempo, instrument, inversions, register, voicing spread and context. Recent attempts retain seed and target identifiers for reconstruction by the pinned generator. History is bounded at 120 attempts and 512 exposure fingerprints. Very old forgotten realizations can eventually count as fresh; there is no cloud sync or cross-device familiarity tracking. Seed reproducibility is version-specific and is not promised across future Kotlin/generator changes.

The next project should preserve the boundary **learning target → example provider → realization/prompt**. No song queries or popularity measures belong in this scheduler. A future provider can supply an eligible occurrence plus provenance while retaining these phase/evidence/audio contracts.

## Automated validation

Run from the repository root:

```powershell
android\gradlew.bat -p android testDebugUnitTest --tests 'com.acquiring.android.Aural*' --console=plain
android\gradlew.bat -p android assembleDebug --console=plain
```

Tests cover musical pitch classes and inversions, applied harmony, reproducibility/provenance, phase/prerequisite gates, supported versus independent evidence, recurrence, recovery, all four microphone tasks, a long successful learner simulation, optional microphone paths, corrupt storage, playback-before-answer, resumption, duplicate submissions, pitch uncertainty, audio completion/cancellation/stalls, timed silent gaps and answer visibility. Compose tests inspect accessibility semantics and drive representative listening/answer transitions with deterministic fake playback. These checks do not replace hearing the device output or testing a real voice.

Initial validation on September 16, 2026: **49 new curriculum tests and 62 related regression tests passed across focused runs**. The debug APK was built at `android/app/build/outputs/apk/debug/app-debug.apk`. At that checkpoint no Android device or emulator was connected; device installation followed later, as recorded below.

Historical integration command (before the UI naming migration; current equivalents are `PlaybackEngineTest`, `PersistentPlaybackPitchPracticeTest`, and `AuralQuizUiTest`):

```powershell
android\gradlew.bat -p android testDebugUnitTest --tests 'com.acquiring.android.Aural*' --tests 'com.acquiring.android.QuizPlaybackEngineTest' --tests 'com.acquiring.android.PersistentQuizPitchPracticeTest' --tests 'com.acquiring.android.LibrarySearchTest' assembleDebug --console=plain
```

It initially ran 109 tests: 106 passed, and three exposed a saved-session default-version compatibility defect. After correcting that defect, the affected suites and APK passed with:

```powershell
android\gradlew.bat -p android testDebugUnitTest --tests 'com.acquiring.android.AuralSessionTest' --tests 'com.acquiring.android.AuralCurriculumUiTest' assembleDebug --console=plain
```

That run passed all 16 tests. Two additional learner-path tests cover persistent hint use and microphone opt-out. The final provenance and learner-path check passed all 21 engine tests and rebuilt the APK:

```powershell
android\gradlew.bat -p android testDebugUnitTest --tests 'com.acquiring.android.AuralCurriculumTest' assembleDebug --console=plain
```

### Android UI naming validation

The learning UI is **Aural Quiz**; the former Quiz song UI is **Playback**, including Full-chord and Root-only. Android presentation symbols, shared playback audio types, navigation state, accessibility labels, diagnostic names, and corresponding tests use the new names. `AuralCurriculum` remains the learning model, and saved preferences/progress keys remain unchanged. iOS/web implementations and historical documents have not been mechanically renamed.

The following command passed **169 tests with zero failures/errors**, built the app, and compiled/built its instrumentation-test APK:

```powershell
android\gradlew.bat -p android testDebugUnitTest --tests 'com.acquiring.android.Playback*' --tests 'com.acquiring.android.PersistentPlaybackPitchPracticeTest' --tests 'com.acquiring.android.Aural*' --tests 'com.acquiring.android.PracticeNavigationTest' --tests 'com.acquiring.android.AudioDiagnosticsTest' --tests 'com.acquiring.android.InstrumentSessionOwnerTest' --tests 'com.acquiring.android.InstrumentVolumeTest' --tests 'com.acquiring.android.TimelineFrameRateWindowTest' assembleDebug assembleDebugAndroidTest --console=plain
```

Installed with `adb -s 3C081JEHN14930 install -r android/app/build/outputs/apk/debug/app-debug.apk` and launched with `adb -s 3C081JEHN14930 shell am start -S -W -n com.acquiring.android/.MainActivity`. Both succeeded on the attached Pixel 7a. Instrumentation tests were compiled, not executed on the device. Saved app data was retained.

### Hierarchical UI validation

The redesigned hierarchy passed **62 tests** (58 curriculum/audio/pitch/session/Compose tests plus four navigation regressions). The debug app and instrumentation APK both built:

```powershell
android\gradlew.bat -p android testDebugUnitTest --tests com.acquiring.android.Aural* --tests com.acquiring.android.PracticeNavigationTest assembleDebug assembleDebugAndroidTest --console=plain
```

After the final presentation cleanup, the affected **22 session/Compose tests** passed and both APKs rebuilt:

```powershell
android\gradlew.bat -p android testDebugUnitTest --tests com.acquiring.android.AuralQuizUiTest --tests com.acquiring.android.AuralSessionTest assembleDebug assembleDebugAndroidTest --console=plain
```

Coverage includes all 15 progression variants across seven phases and three support levels, selected-variant provenance reconstruction, gradual help removal without independent credit, phase navigation, next-example continuity, accessibility answer concealment, cancellation on tab changes, and resumption. Two new `AuralQuizDeviceTest` instrumentation tests exercise actual playback completion and cancellation with in-memory progress, leaving saved learner data untouched.

**Device validation completed:** Installed both APKs on the reconnected Pixel 7a (`3C081JEHN14930`) with existing app data retained. `AuralQuizDeviceTest` passed **both tests** in 14.768 seconds, covering actual audio completion and phase changes during playback. Relaunched the app successfully and opened Aural Quiz; the device accessibility tree confirmed the family screen. The launched process reported no AndroidRuntime errors. No screenshots were taken. Commands executed:

```powershell
adb -s 3C081JEHN14930 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s 3C081JEHN14930 install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s 3C081JEHN14930 shell am instrument -w -e class com.acquiring.android.AuralQuizDeviceTest com.acquiring.android.test/androidx.test.runner.AndroidJUnitRunner
adb -s 3C081JEHN14930 shell am start -S -W -n com.acquiring.android/.MainActivity
```

### Shared Settings and default-instrument validation

All **66 automated tests passed**, including rendering every one of the 13 Settings instruments, preserving the question and provenance when instruments change, and opening the actual shared Settings screen from Aural Quiz, changing the default, then returning to the same phase with audio cancelled safely:

```powershell
android\gradlew.bat -p android testDebugUnitTest --tests com.acquiring.android.Aural* --tests com.acquiring.android.InstrumentSessionOwnerTest assembleDebug assembleDebugAndroidTest --console=plain
```

After a formatting-only cleanup, `android\gradlew.bat -p android assembleDebug assembleDebugAndroidTest --console=plain` also passed. Both APKs were installed on the Pixel 7a with app data retained. `adb -s 3C081JEHN14930 shell am instrument -w -e class com.acquiring.android.AuralQuizDeviceTest com.acquiring.android.test/androidx.test.runner.AndroidJUnitRunner` passed **both device tests** in 15.251 seconds. The app launched successfully without AndroidRuntime errors. The final manual Settings navigation check was stopped when another app became foreground; shared Settings navigation is covered by the automated Compose test.

### Octave adjustment validation

`android\gradlew.bat -p android testDebugUnitTest --tests com.acquiring.android.Aural* assembleDebug assembleDebugAndroidTest --console=plain` passed **65 tests** and built both APKs. Tests verify exact +12-semitone movement of every exercise/context chord and all singing target kinds, preserved answers and instrument, provenance reconstruction, and migration of pending examples. Installed both APKs with `adb install -r`; the same targeted `AuralQuizDeviceTest` instrumentation command above passed **2 tests** in 14.837 seconds on the Pixel 7a. App data was retained.

### Chord-transition validation

`android\gradlew.bat -p android testDebugUnitTest --tests com.acquiring.android.AuralAudioTest --tests com.acquiring.android.AuralSessionTest --tests com.acquiring.android.AuralQuizUiTest assembleDebug assembleDebugAndroidTest --console=plain` passed **33 tests** and built both APKs. Timeline and rendered-audio tests verify 20 ms overlap across tempos, sound through the former dead-air interval, and completely silent written rests. Both APKs were installed on the Pixel 7a; the targeted `AuralQuizDeviceTest` instrumentation command above passed **2 tests** in 13.41 seconds. Judge the blend and shorter reference pause by ear during human testing.

### Consolidated modes validation

**74 distinct tests passed across the full and focused runs.** The initial full run passed all domain/audio/session/pitch tests; four UI tests needed their old horizontal-scroll actions removed because all three tabs now fit without scrolling. The affected UI suite and expanded mode-selection suite then passed all **16 tests**, and both APKs built:

```powershell
android\gradlew.bat -p android testDebugUnitTest --tests com.acquiring.android.Aural* assembleDebug assembleDebugAndroidTest --console=plain
android\gradlew.bat -p android testDebugUnitTest --tests com.acquiring.android.AuralQuizUiTest --tests com.acquiring.android.AuralPracticeModesTest assembleDebug assembleDebugAndroidTest --console=plain
```

Coverage includes the three-tab layout, introduction → comparison transition, gradual activity selection, all Recall activities, automatic and manually chosen singing tasks, retry after error, resumption, separate evidence cells, aggregate mastery badges, hidden-answer Adaptive checks, Settings return, and cancellation on tab changes. Both APKs were installed on Pixel 7a with saved data retained. The targeted `AuralQuizDeviceTest` instrumentation command above passed **2 tests** in 13.121 seconds, including actual playback and the transition from the introduction to Recognize practice. Human review should confirm that activity changes within Recall are clear from the short prompt and that the introductory guidance feels sufficient.

## Human validation checklist

1. Start in Library → Aural Quiz. Open the gear, change Default Instrument, return, and confirm all reference/model/exercise chords use that sound. Check that your progression and phase are retained. Browse family → progression → Recognize / Recall / Sing; confirm Next retains the progression and tab while adapting the activity, and Back returns one level. Follow several Adaptive examples, use a hint and replay, answer incorrectly then retry. Confirm practice and independent counters behave as labeled; revisit after restarting the app.
2. Open a family, choose a progression, and switch its three tabs to compare dominant/plagal/deceptive returns and V/V. Judge whether the harmonic function, chord spelling, voicing, register, timbre and key reference sound correct and balanced. Check that reduced guidance feels gradual.
3. Try recall, a middle missing chord, and a silent ending. Verify the model is clear, silent slots keep time, no answer appears before grading, and the task asks for remembered harmony rather than an arbitrary “right” composition. Check both named practice and hidden-target Adaptive. Inspect TalkBack announcements, phase-tab discovery, large text and smaller-screen scrolling.
4. Try root, inverted bass, scale degree and root-sequence singing in a comfortable octave. Test silence, noise, breath, vibrato and uncertain detection. Confirm no live answer guide and no musical penalty for technical failures. Calibrate the 45-cent, confidence and stability thresholds with singers of different ranges.
5. Interrupt playback/capture by leaving the screen, backgrounding, changing audio focus and unplugging headphones. Confirm sound and microphone stop, no stale answer is graded, and playback cannot silently earn independent credit.

Human musical judgment is still needed for family ordering, distractor quality, scaffolding pace, practical mastery thresholds, transfer difficulty, timbre balance and how well these tasks predict unaided musical reproduction. Minor/modal harmony, rhythm, exact-octave singing and more open-ended prediction are future curriculum extensions.

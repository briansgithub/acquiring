# T03 bounded theory core

2026-10-14. Owner: data_compat worker; assigned route GPT-6.1 Sol/high; runtime identifier unknown.
Branch codex/pwa-music-theory, worktree H:/Desktop/Acquiring/Acquiring-pwa-data-compat; clean start at276cc536b76548c2fa82b86f62b3a8631fb3ca88.
Owned scope: pwa/src/domain/music only. Coordinator owns task/contracts/dependencies/CI/routes. Shared usage at entry40%five-hour/42%weekly.

Authority: Android801cf7984171d772afc4406ddb5c79c0cb7fd20a. MusicTheory.kt; SpelledInterval.kt lines6-166 (letters/spelled pitch only); RelativeIonianContext.kt; AudioPitchAdapter.kt lines1-5. Source files are unchanged against that baseline. No old web/iOS runtime used.
Native fixtures inspected: MelodyAccuracyTest; EnharmonicLetterNameTest scale assertions; SpelledPitchResolutionTest first3 cases; RelativeIonianContextTest mode/signature/rotation/fixed-context assertions and root-spelling distinction. Remaining chord-dependent assertions are outside this slice.

Intent saved before implementation: port pitch/key/scale labels, degree parsing and MIDI resolution; written pitch parse/fromMidi/spellRelative; relative-major key/preference/degree/staff/preview pure helpers. Preserve static native major/minor spelling tables, custom intervals, fallback behavior and integer division semantics. Test native cases plus octave/accidental boundaries. Save coherent validated core, then wait for next large slice.

Remaining T03 acceptance: chord JSON interpretation; native/borrowed/applied/substitution root context; qualities/roman/letter formats; inversions/slash bass, extensions/suspensions/adds/omits/alterations; voicing and resolved tone roles; full shared/source/historic corpus parity. Named/measured interval analysis also remains unported. This bounded checkpoint must not mark T03 complete or claim full musical parity.
Next action: implement the bounded source port and native fixture tables, run focused Vitest and strict TypeScript, review scope, commit named paths. Own-worktree run-control holds mutations/child commands and immutable receipts; existing dependencies reused without install.

Source slice saved: pure theory/spelled/relative-major helpers plus six static tables translated mechanically from the exact native source. Table cardinalities and seven-degree rows checked during translation. No JSON chord interpreter or UI added. Next: native fixture translation and focused validation.

Validation2026-10-14:
- node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/vitest/vitest.mjs run --root H:/Desktop/Acquiring/Acquiring-pwa-data-compat/pwa --config H:/Desktop/Acquiring/Acquiring/pwa/vite.config.ts src/domain/music: PASS, 3files/18tests (final receipt t03-core-tests-20261014-02). Initial3files/17tests also passed; final run adds a source-evidenced native register boundary.
- node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/lib/tsc.js --project .artifacts/pwa-port/t03-tsconfig.json: PASS (receipt t03-core-types-20261014-02). Ignored local config extends pwa/tsconfig.json with only owned source includes; maps Vitest and node types to already installed primary dependencies. Imported data/contracts are typechecked transitively.
- Tested core digest: SHA256 of sorted .ts filenames + NUL + bytes + NUL: f318a8fd7f291f543cc6cd9f90456c2289f49c5040bb86cc5b7f647940100952.
- No dependency installation; no shared contracts/routes/tasks/CI changed. Final named-path/whitespace review follows. Full project build/browser tests are coordinator integration checks, not claimed here; no Kotlin/device/audio/corpus suite was run. Last observed allowance48%five-hour/43%weekly.

Native evidence mapping:
- MusicTheory.kt:107 generateScaleLabels, :138 getNoteLabel, :184 written degree resolution, :237 MIDI conversion, :261/:298 distinct nearest-degree tie rules.
- SpelledInterval.kt:34 written pitch; :50 parse; :82 MIDI-name preferences; :130 root-relative spelling.
- RelativeIonianContext.kt:36 relative key; :47 signature preference; :62 written degree; :85/:121 fixed-register previews; :162 fixed-context staff degree.
- AudioPitchAdapter.kt:4 supplies the sole written-pitch-to-audio offset.
- MelodyAccuracyTest all10 pitch assertions plus KeyChangePlaybackTest Bb modulation pitch; EnharmonicLetterNameTest scale-only cases; SpelledPitchResolutionTest first3 cases; RelativeIonianContextTest mode/signature/first-key/MIDI-name/rotation/fixed-context assertions. The chord-dependent D-sharp role case supplies a B spelled root explicitly here; complete chord root production remains future work.

Public API:
- getNoteLabel(number|string, tonic, scale, customIntervals?), generateScaleLabels(tonic, intervals), normalizeTonic, getModifierValue, getRawDegree.
- resolveScaleDegreePitch(sd, relativeOctave, key, baseOctave=4, customIntervals?) -> SpelledPitch|null. getMidiNote(sd, relativeOctave, key) -> audio note number; getDegreeLabelFromSpelling/getDegreeLabelFromMidi/getRelativeDegreeLabel return native combining-circumflex labels.
- SpelledPitch(letter, accidental, octave) has staffPosition/chromaticPosition/noteName/displayName and toAudioNoteNumber(); static parse(name, octave), fromMidi(midi, preference='flats'), spellRelative(root, midi). Numeric note/octave/degree arguments are integers, matching Kotlin Int APIs.
- relativeIonianKey(key), canonicalScaleName(scale), relativeIonianTonicDegree(scale); noteNameAccidentalPreference(key|section) -> 'flats'|'sharps'.
- degreeInKey(pitch,key)/relativeIonianDegree(pitch,sourceKey) -> {degree,alteration}|null. ionianContextDegreeLabel(pitch|midi,contextKey,rootPitch?) and relativeIonianDegreeLabel(pitch|midi,sourceKey).
- ionianContextPreviewAudioNote(pitch|midi,contextKey,referenceOctave=3,rootPitch?) -> number|null; ionianContextStaffDegree(sd,relativeOctave,sourceKey,contextKey)/relativeIonianStaffDegree(sd,relativeOctave,sourceKey) -> number|null.
- Index also exports readonly native note/scale/quality/Roman/major/minor maps; static quality/Roman tables do not implement chord interpretation.

Preserved native distinctions: getMidiNote uses pitch-class lookup and legacy fallback; resolveScaleDegreePitch retains written staff octaves. They intentionally differ for Cb/B# tonic register, so later audio/chord consumers must select the appropriate native path. Relative-major aliases canonicalize only in relative-major helpers. MIDI chord-relative labels choose the higher degree on ties; melody labels choose the earlier degree. Fixed context can be retained across source key changes; root spelling avoids enharmonic role loss.

Resume: review/integrate this bounded core, keep T03 in_progress, and wait for coordinator assignment before another large chord/voicing slice. No publication or branch/worktree cleanup performed.

## T03 written chord root slice — 2026-10-14

Owner chord_port; assigned GPT-6.1 Sol/high, runtime identifier unknown. Branch codex/pwa-chord-interpretation, worker H:/Desktop/Acquiring/Acquiring-pwa-data-compat; clean base818f910a0a26a4d01bb589d4b11140ca68cf35d6. Owned files pwa/src/domain/music only; coordinator owns catalog/contracts/dependencies/routing/tasks. Entry allowance3%five-hour/48%weekly. No active/incomplete worker receipts. Existing branches/worktrees preserved.

Prewritten intent: port Android ChordInterpreter.resolveChordRoot and its JSON primitive/custom-borrowed/quality helpers as the first bounded interpretation API. Authority801cf7984171d772afc4406ddb5c79c0cb7fd20a, native source unchanged. Preserve all six root contexts, four borrowed-applied exceptions, enharmonic written roots, fixed simple-mode register versus source-relative register, and Kotlin primitive parsing. Reuse accepted core; no legacy web/iOS runtime. Export resolveChordRoot and its result/context types; do not present this as the full interpret/voicing API.

Expected validation: direct Kotlin root assertions (SpelledPitchResolutionTest; all six AppliedBorrowedChordTest root cases; RelativeIonian root spelling), plus a root-only comparison against frozen shared/source/historic/role fixture expectedRootMidi normalized to the builder register48+pitch-class. This explicitly tests one output channel; Roman/letter/voicing/tone-role/source-accuracy acceptance remains incomplete. Run focused music Vitest and strict local TypeScript using installed primary dependencies; no install. Save source/test receipts and named-path checkpoint; then report to coordinator before another large slice.

Source saved: chord-root.ts and exports; root metadata deliberately preserves the native non-borrowed tritone quality-table behavior separately from the voiced-frame quality. Tests saved with direct native assertions, written-register/primitive/custom boundaries, and frozen corpus root-only comparisons. Next run focused checks; no full chord parity claim.

First check receipt t03-roots-tests-20261014-01:32 assertions passed,4 fixture-load failures. Diagnosed test URL traversing one directory too far; corrected to repository-local contracts. No product changes for this failure. Retest cycle1 follows.

Retest t03-roots-tests-20261014-02: PASS4files/36tests, including the four frozen root-only fixture channels. Strict TypeScript t03-roots-types-20261014-01 found one test-only inferred union with optional undefined root; annotated invalid-input fixture list as JsonObject[]. No product correction required; type retest follows.

Final written-root slice evidence2026-10-14:
- node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/vitest/vitest.mjs run --root H:/Desktop/Acquiring/Acquiring-pwa-data-compat/pwa --config H:/Desktop/Acquiring/Acquiring/pwa/vite.config.ts src/domain/music: PASS4files/36tests, receipt t03-roots-tests-20261014-03, after final test annotation.
- Frozen root-only cases:15,730 shared corpus +21,464 historic +1,824 Hooktheory/source parity +22 role fixtures =39,040 exact expectedRootMidi pitch-class matches. The root resolver returns a written pitch; tests normalize it to the native voiced-root register48+pitch-class solely for this comparison. This does not test ordered notes, Roman/letter strings, roles or independent captured-source accuracy.
- node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/lib/tsc.js --project .artifacts/pwa-port/t03-tsconfig.json: PASS strict owned-source/transitive-contract types, receipt t03-roots-types-20261014-02. The ignored config and primary installed dependencies were reused; no install/config/lock/contract/CI/routing edits.
- Tested music .ts digest (sorted filenames+NUL+bytes+NUL, SHA256): 71e2597090052ccccbb7afdcaf6785e17e42f2389b675b15575c89eb4c289415.
- Native evidence: ChordInterpreter.kt:41-90 primitive/custom helpers; :145 tritone selector; :194-379 written root resolver; :551-556 quality alterations. Direct current Kotlin tests translated from AppliedBorrowedChordTest:33/51/67/88/108/125, SpelledPitchResolutionTest:39-112, and RelativeIonianContextTest:182-200. Native sources checked unchanged against801cf798. Kotlin/Gradle/device suites were not run in this PWA-only slice.
- Added API resolveChordRoot(chord,key,referenceOctave=3) -> ResolvedChordRoot|null, plus ChordRootContext/ResolvedChordRoot types. Result preserves written/simple-mode pitches, source/effective degrees and keys, custom intervals, quality/context, generic steps and chromatic distance. Root JSON is accepted via existing shared JsonObject. No new full chord interpreter facade.
- Test-only failures retained in immutable receipts: one fixture URL correction and one strict type annotation, each resolved in one diagnose/fix/retest cycle; production port passed unchanged.
- Last live allowance10%five-hour/49%weekly. Review and named-path staging follow; no publication/cleanup.

Checkpoint handoff: keep T03 in_progress. Next bounded work is native ChordVoicing build/frame pipeline and tone roles, then native Roman/letter/relative-Ionian display interpretation and full six-channel corpus plus independent source/historic accuracy assertions. Named/measured interval analysis also remains unported. Current root-only parity must not substitute for the declared complete acceptance. Await coordinator assignment before starting another large slice.

## T03 ordered voicing and tone-role slice — 2026-10-14

Owner chord_port; assigned GPT-6.1 Sol/high, runtime identifier unknown. Same branch/worktree codex/pwa-chord-interpretation at9c0826463bb1c8c6cda6f5040236e93e96be00c8, clean before this slice; previous root checkpoint integrated by coordinator. Owned pwa/src/domain/music only. Entry live allowance18%five-hour/51%weekly. Root owns independent catalog work; no subworkers or shared interface/config edits.

Prewritten intent: port the entire current Android ChordVoicing.kt ordered build/frame pipeline from801cf798, preserving tone slots/degrees, literal MIDI versus written octave/normalized shift origin, scale-specific/custom/applied exception order, alterations/adds/omits/suspensions and inversion/register rules. Expose buildChordVoicing plus the native consumer helpers getChordNotes/getResolvedRootMidi/getChordToneLabels/getRootPositionChordNotes. Keep accepted written-root API unchanged and do not infer voiced roots from bass or regenerate fixture outputs.

Validation target: literal current Kotlin InversionChordPlaybackTest expectations, applied/borrowed native pitch sets, full frozen shared/source/historic expectedMidi/expectedRootMidi/expectedToneLabels and role-contract channels. Compare source-authority files against frozen native commit. Focused music Vitest and strict local TypeScript with installed primary dependencies and own run-control; at most2diagnose/fix/retest cycles per failure. Save tested tree digest and named-path checkpoint, report before Roman/letter/interval work. Full T03 remains incomplete until all declared display and independent accuracy evidence passes.

Partial source receipt: native tone metadata/build and frame construction through implicit extensions saved. Source intentionally incomplete until the next guarded write appends ordered scale adjustments, modifiers and register handling; no validation claim.

Full voicing source saved: ordered implicit scale adjustments, dual suspensions, omission policy, repeated alterations/additions, extension shells, applied/ordinary inversions, omitted-third second inversion and diminished spread. Native helper exports added; tests are next. Written root resolver unchanged.

Native inversion/applied/blank tests and frozen MIDI/root/tone-role/pitch-class assertions saved. Unknown modifier lookup guarded by own-property lookup to preserve native switch fallthrough for arbitrary JSON strings. Full source/frame modifier review and first validation follow.

Final ordered-voicing slice evidence2026-10-14:
- node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/vitest/vitest.mjs run --root H:/Desktop/Acquiring/Acquiring-pwa-data-compat/pwa --config H:/Desktop/Acquiring/Acquiring/pwa/vite.config.ts src/domain/music: PASS5files/58tests on first run, receipt t03-voicing-tests-20261014-01. No diagnose/fix/retest cycle required.
- Exact frozen channels:39,018 ordered MIDI arrays and sorted pitch-class sets (15,730 shared +21,464 historic +1,824 Hooktheory/source parity);39,040 harmonic roots and ordered tone-label arrays including22role fixtures. Existing written-root tests still pass39,040independent root comparisons. New checks compare immutable expected fields, not implementation-generated expectations. These outputs are app parity evidence; independent truthRoman/truthLetter/truthPcs/source/historic accuracy gates remain open.
- node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/lib/tsc.js --project .artifacts/pwa-port/t03-tsconfig.json: PASS strict owned-source/transitive-contract types on first run, receipt t03-voicing-types-20261014-01. Existing installed primary dependencies and ignored worker config reused; no installation or shared config changes.
- Tested music .ts digest (sorted filenames+NUL+bytes+NUL, SHA256): 0b2061dda024a167000102b96e30c7a12811c3dc4a7f079796eaa648de4b93e8. Source/test files unchanged since these passing checks.
- Native source authority verified unchanged against801cf798: ChordVoicing.kt and InversionChordPlaybackTest.kt. Port covers ChordVoicing.kt:9-27tone/root metadata and role labels;:30-100primitive/context/build dispatch;:102-203quality/scale/frame extensions;:204-345ordered scale/suspension/omit/alteration/addition policy;:346-380inversion/spread/register. Consumer helper source ChordInterpreter.kt:781-807. All10current InversionChordPlaybackTest cases translated,6AppliedBorrowedChordTest pitch sets, and native ChordInterpreterTest blank/rest formats.
- Added APIs: ChordTone(midi,slot,degree,writtenOctave?,shiftMidi?) with native shifted/raisedOctave behavior; VoicedChord(rootName,rootMidi,tones) with ordered labels; buildChordVoicing(chord,key); getChordNotes/getResolvedRootMidi/getChordToneLabels/getRootPositionChordNotes. Written-root resolver unchanged. Harmonic root remains independent of first sounding note; written/simple-mode/voicing registers retain their native distinctions.
- Reviewed full new source/test diff; named-path/whitespace/staged-isolation checks precede commit. Only music domain changed. No Kotlin/Gradle/device/audio suite, full application build, browser check or independent captured-source accuracy gate was run by this worker; coordinator integration remains required. Latest live allowance24%five-hour/51%weekly. No publication/cleanup.

Checkpoint handoff: keep T03 in_progress. Next bounded slice is native Roman/letter/relative-Ionian display interpretation and complete six-channel corpus checks, followed by independent source/historic accuracy and named/measured interval analysis. These remaining requirements must be established before full T03 completion. Await coordinator assignment before starting display work.

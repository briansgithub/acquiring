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

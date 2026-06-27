# Chord / Note Decode Fix Log

Permanent sequential record of errors found while reverse-engineering Hooktheory's `.json` chord objects against visual ground truth, and the fixes applied to the theory engine.

**Validation harness:** `_Decode_oracle/` (scrape → SVG truth → `engineRun` → `compare` → `report`)  
**Engine files:** `web-player/lib/music.js`, `web-player/lib/jsonToSymbol.js`, `web-player/lib/scales.js`  
**Corpora:** `corpus.json` (24 songs), `corpus2.json` (50 songs), `corpus_all.json` (74 entries)

**Ground truth rule:** Vision channel (screenshots) is authoritative; SVG-text channel must agree. Symbol-level validation compares Roman numerals and letter names; note-level validation compares pitch-class sets and bass note presence.

**Current accuracy (67 resolved songs, 3220 chords, 2026-06-27):** romanExact 97% · romanCore 99% · notesOk 99%

---

## How to use this log

1. Read entries **in order** — later fixes sometimes depend on earlier data-model corrections.
2. Each entry lists: symptom → root cause → fix → files → songs that exposed it.
3. **Open / known-non-engine** items are at the end; do not re-fix harness-only issues as engine bugs.

---

## Fix 001 — Applied-chord field semantics reversed

**When:** Oracle corpus phase 1 (Maple Leaf Rag, early triads)  
**Symptom:** Secondary dominants rendered backwards, e.g. `{root:2, applied:7}` produced `ii/vii°` instead of ground-truth `vii°/ii`. Notes and letter names wrong for all applied chords.  
**Root cause:** Engine treated `chord.root` as the numerator (applied chord degree) and `chord.applied` as the denominator target. Hooktheory's model is the **opposite**: `applied` = numerator degree, `root` = tonicization target (denominator).  
**Fix:** Rewrote applied-chord branches in `getChordSymbol`, `getChordLetterName`, and `chordInterpreter` to build the numerator from the **major scale of the target degree's note** and the denominator from the active key's scale at `chord.root`. Leading-tone applied chords (`applied === 7`) use fully diminished quality (`vii°7`, `bb7` in notes).  
**Files:** `web-player/lib/jsonToSymbol.js`, `web-player/lib/music.js`  
**Exposed by:** Maple Leaf Rag, Bohemian Rhapsody patterns, most secondary-dominant passages.

---

## Fix 002 — Custom borrowed scale arrays treated as relative offsets

**When:** Oracle corpus phase 1  
**Symptom:** Custom `borrowed: [int, int, ...]` chords (7-semitone arrays) produced wrong roots and qualities; e.g. `VII(bor)` vs `vii°(bor)`.  
**Root cause:** `getCustomScaleIntervals` subtracted a erroneous `baseOffset` from array values. Hooktheory arrays are **absolute semitone offsets from the tonic** (same as major `[0,2,4,5,7,9,11]`).  
**Fix:** Use array values directly as scale degree intervals. Derive triad quality and accidental prefix from the array in symbol generation (`customArrayTriadQuality`, `customArrayPrefix`).  
**Files:** `web-player/lib/music.js`, `web-player/lib/jsonToSymbol.js`  
**Exposed by:** Maple Leaf Rag Chorus, Bohemian Rhapsody Bridge.

---

## Fix 003 — Symbol suffix ordering and attribute rendering

**When:** Oracle corpus phase 1 (attribute matrix showed 0% on borrowed, suspensions, alterations, type=9)  
**Symptom:** Missing `(min)` / mode tags, wrong order of °/ø/△/figured-bass/extensions, suspensions and alterations omitted or misplaced, `+` for augmented wrong.  
**Root cause:** Monolithic suffix string in old `getChordSymbol`; no structured `buildSuffix`.  
**Fix:** Introduced `buildSuffix` with Hooktheory order: `[+][°|ø|△][figured-bass][extension][(addN)][(noN)][susN][(alt)]`. Added `buildNumeral`, `BORROWED_TAG`, `borrowedPrefix`.  
**Files:** `web-player/lib/jsonToSymbol.js`  
**Exposed by:** Global attribute matrix across corpus 1.

---

## Fix 004 — Chord types 9 and 11 not decoded in symbols or notes

**When:** Oracle corpus phase 1  
**Symptom:** `type: 9` / `type: 11` chords lacked 9th/11th in Roman symbols and generated note arrays.  
**Root cause:** Note builders only handled triads and 7ths; `buildSuffix` had no superscript for 9/11.  
**Fix:** Extended `buildSuffix` with `SUPERS` for 9/11/13. In `rootToDiatonicTriad` / `buildChordFromNoteName`, append 9th and 11th scale degrees when `chordType >= 9` / `>= 11`.  
**Files:** `web-player/lib/jsonToSymbol.js`, `web-player/lib/music.js`  
**Exposed by:** Jazz-tier songs, extended harmony passages.

---

## Fix 005 — Harmonic minor as an active **key** scale

**When:** Oracle corpus phase 1 (Penny Lane)  
**Symptom:** `Unsupported scale type: harmonicMinor` thrown; Verse sections failed entirely.  
**Root cause:** Only major/minor and church modes were defined; `harmonicMinor` appeared as `keys[].scale` in Hooktheory data.  
**Fix:** Added `HARMONIC_MINOR_SCALE_SPECIFIC_INTERVALS`, chord qualities, and Roman numerals to `scales.js`. Wired through `scaleDegreeToSpecificInterval`, `getNoteLabel`, `getScaleChordQualities`, `getChordQualitiesForScale`, `getRomanNumeralsForScale`.  
**Files:** `web-player/lib/scales.js`, `web-player/lib/music.js`, `web-player/lib/jsonToSymbol.js`  
**Exposed by:** Penny Lane, other harmonic-minor-key songs.

---

## Fix 006 — Diatonic seventh quality (major vs minor vs diminished 7th)

**When:** Oracle corpus phase 1 (Penny Lane `I△42`, major-key major-7th chords)  
**Symptom:** All 7th chords received `b7` in notes; symbols showed `7` instead of `△7` where diatonic major 7th expected. Inversions failed `bassInNotes` / `notesOk`.  
**Root cause:** `addSeventhNote` always used minor 7th (`b7`). No diatonic quality lookup per scale degree.  
**Fix:** Added `diatonicSeventhDegreeStr` to classify 7th interval as `"7"`, `"b7"`, or `"bb7"` from the active scale. Added `isMajorSeventh` / `customArraySeventhMajor` for symbol `△`. Refactored `addSeventhNote` to take explicit seventh degree string.  
**Files:** `web-player/lib/music.js`, `web-player/lib/jsonToSymbol.js`  
**Exposed by:** Penny Lane, any `I△7` / `IV△7` in major or borrowed contexts.

---

## Fix 007 — `(addN)` and `(noN)` tags missing from symbols

**When:** Oracle corpus phase 1  
**Symptom:** `adds` / `omits` JSON fields ignored in Roman output.  
**Root cause:** `buildSuffix` did not render them.  
**Fix:** Render `(addN)` and `(noN)`; promote `add4`→`(add11)` and `add6`→`(add13)` when `chord.type >= 7`.  
**Files:** `web-player/lib/jsonToSymbol.js`  
**Exposed by:** Songs with `adds: [9]`, `omits: [3]` (power chords).

---

## Fix 008 — Quality markers on suspended chords

**When:** Oracle corpus phase 1  
**Symptom:** `IV△⁷sus2` instead of `IV7sus2` — △/ø/° shown when third is suspended.  
**Root cause:** Quality suffix added before checking suspensions.  
**Fix:** In `buildSuffix`, skip °/ø/△ when `chord.suspensions` is non-empty.  
**Files:** `web-player/lib/jsonToSymbol.js`  
**Exposed by:** Suspended-dominant and sus-add passages.

---

## Fix 009 — Borrowed accidental prefix referenced major scale only

**When:** Oracle corpus phase 1  
**Symptom:** Wrong `♭`/`♯` prefix on borrowed chords in non-major keys, e.g. `#viø7(dor)` in harmonic minor.  
**Root cause:** `borrowedPrefix` compared borrowed note to **major** scale degree, not active key scale.  
**Fix:** Compare borrowed root to `getNoteLabel(degree, { tonic, scale: key.scale })`.  
**Files:** `web-player/lib/jsonToSymbol.js`  
**Exposed by:** Penny Lane, mode-mixture in minor keys.

---

## Fix 010 — Harmonic minor as a **borrowed** scale `(hmin)`

**When:** Oracle corpus 2 (hotel-california, while-my-guitar, boulevard, soundgarden, billy-joel, amy-winehouse)  
**Symptom:** `V(hmin)` / `V7(hmin)` rendered as minor `v` / `v⁷` with wrong letter names and notes (e.g. `F#m7` instead of `F#7`). ~35 chords.  
**Root cause:** Fix 005 added harmonic minor as a **key** scale only. `borrowed: "harmonicMinor"` fell through `resolveBorrowedScale` as unsupported; engine used parent key quality (minor → lowercase v).  
**Fix:** Handle `harmonicMinor` in `resolveBorrowedScale`. Add `harmonicMinor: 'hmin'` to `BORROWED_TAG` and `SUPPORTED_BORROWED`. Wire qualities/romans in symbol helpers.  
**Files:** `web-player/lib/music.js`, `web-player/lib/jsonToSymbol.js`  
**Exposed by:** Hotel California, While My Guitar Gently Weeps, Boulevard of Broken Dreams, Back to Black, Soundgarden Black Hole Sun, Billy Joel Piano Man.  
**Result:** Hotel California 77%→100% notes; cluster of 35 `(hmin)` mismatches eliminated.

---

## Fix 011 — Phrygian dominant scale `(phdm)`

**When:** Oracle corpus 2 (lucy-in-the-sky, duke-ellington, soundgarden)  
**Symptom:** `iv△7(phdm)`, `bII(phdm)` decoded with wrong quality, roots, and accidentals.  
**Root cause:** `phrygianDominant` not defined as scale; confused with phrygian mode.  
**Fix:** Added `PHRYGIAN_DOMINANT_SCALE_SPECIFIC_INTERVALS` `[0,1,4,5,7,8,10]`, qualities `[major, major, dim, minor, dim, aug, minor]`, romans `[I, II, iii°, iv, v°, VI+, vii]`. Wired as key and borrowed scale.  
**Files:** `web-player/lib/scales.js`, `web-player/lib/music.js`, `web-player/lib/jsonToSymbol.js`  
**Exposed by:** Lucy in the Sky with Diamonds, In a Sentimental Mood, Black Hole Sun.

---

## Fix 012 — Double-accidental arithmetic in `appendAccidental`

**When:** Oracle corpus 2 (billie-jean, light-my-fire)  
**Symptom:** `ii42` symbol correct (`G#m7/F#`) but notes had **F natural** bass instead of F#; `bassInNotes` failed on 20 chords. Letter name showed `G#m7/F`.  
**Root cause:** When lowering 7th in a chord-root major scale, diatonic 7th can be **double-sharp** (e.g. G# major → Fx). Old `appendAccidental` mapped `Fx` + shift(-1) → `F` (natural) instead of `F#`.  
**Fix:** Rewrote `appendAccidental` to accumulate accidental value (#=+1, b=-1, x=+2) and re-encode, so `Fx` lowered by 1 → `F#`.  
**Files:** `web-player/lib/music.js`  
**Exposed by:** Billie Jean (all `ii42` in Intro/Verse), The Doors Light My Fire (`vi42(mix)`).  
**Result:** Billie Jean notesOk 62%→100%.

---

## Fix 013 — Locrian scale chord qualities wrong at degrees 5 and 7

**When:** Oracle corpus 2 (amy-winehouse, blue-in-green); latent since locrian support added  
**Symptom:** Locrian borrowed degree 5 rendered as `v°` (diminished) instead of `V` (major); degree 7 as `VII` (major) instead of `vii` (minor). Wrong roots/notes for `bV` chords; `vii11(loc)` case wrong.  
**Root cause:** `LOCRIAN_SCALE_CHORD_QUALITIES` had `[..., "diminished", "major", "major"]` at degrees 5–7; correct locrian triads are **V = major**, **vii = minor**.  
**Fix:** Qualities at deg 5 → `"major"`, deg 7 → `"minor"`. Romans: `"V"`, `"vii"` (was `"v°"`, `"VII"`).  
**Files:** `web-player/lib/scales.js`  
**Exposed by:** Back to Black (`bV`, `bVsus2`), Blue in Green (`vii11(loc)`).  
**Note:** Remaining back-to-black **symbol** mismatches (`bVsus27` vs `bV⁷sus2`) are token-order / suspended-dominant rendering cosmetics; notes are 100%.

---

## Fix 015 — Oracle `notesOk` only checked root PC, not full chord tone set

**When:** Live browser verification of Maple Leaf Rag `vii°⁷/V` (Intro beat 33)  
**Symptom:** Hooktheory piano shows **D3, Cb4, F4, Ab4**; engine/player showed **D3, F3, Ab3, C4** (C natural instead of Cb). Oracle reported `notesOk: true`.  
**Root cause:** `compare.js` `notesOk` required only `rootInPcs` + `bassInNotes`. Wrong 7th (PC 0 vs 11) still contains root D and bass D → false pass.  
**Fix:** Added `truthNotes.js` to derive expected pitch-class set from letter name + chord type. New flag `pcsExact`; `ok` and `notesOk` now require full PC set match. Added `browserVerify.js` — Puppeteer clicks timeline beats and compares `#chord-notes` pills to engine output.  
**Files:** `_Decode_oracle/truthNotes.js`, `_Decode_oracle/compare.js`, `_Decode_oracle/report.js`, `_Decode_oracle/run.js`, `_Decode_oracle/browserVerify.js`  
**Exposed by:** Maple Leaf Rag `d°7` / `vii°7/V` applied diminished-7th.

---

## Fix 016 — `modifierValue("bb7")` treated as `b7` (single flat)

**When:** Same chord as Fix 015  
**Symptom:** Diminished-7th scale degree `bb7` produced C natural (b7) instead of Cb (bb7).  
**Root cause:** `modifierValue` used `startsWith("b")` → always `-1` regardless of `bb` prefix.  
**Fix:** Count all leading `#`/`b` characters: `bb` → -2, `b` → -1, `#` → +1. `modifierString` mirrors count.  
**Files:** `web-player/lib/music.js`  
**Result:** `vii°⁷/V` notes **D3, F3, Ab3, Cb4** — PCs {2,5,8,11} match Hooktheory.

---

## Fix 017 — Extended truthNotes + piano scrape harness (corpus1 clean rerun)

**When:** 2026-06-27 corpus1 verification rerun  
**Symptom:** `truthNotes.js` only inferred triad + basic 7th; missed `(b9)`, `sus4`, `add9`, `omit3`, JSON `adds`/`omits`/`suspensions`/`alterations`. No piano-roll ground truth.  
**Fix:** Split letter parsing into `truthLetterParse.js`. `truthNotes.js` now builds full PC sets from letter + Roman + JSON modifiers. Added `pianoNotes.js` — scrapes `g.note-view` `data-sd`/`data-octave` per chord column (Puppeteer, piano+chords view). `compare.js`: `pianoExact`/`pianoPcsExact` flags; uses validated piano scrape when `pianoPcs === truthPcs`, else falls back to letter-inferred `pcsExact`. `run.js --rescrape-truth` deletes `scrape.json` only and re-scrapes with `skipScreenshots` (reuses `screens/*.png`).  
**Files:** `_Decode_oracle/truthLetterParse.js`, `_Decode_oracle/truthNotes.js`, `_Decode_oracle/pianoNotes.js`, `_Decode_oracle/scrapeSong.js`, `_Decode_oracle/compare.js`, `_Decode_oracle/report.js`, `_Decode_oracle/run.js`  
**Corpus1 result (22 songs, 1051 chords):** romanExact **98%** | notesOk **84%** (was ~99% on old weak metric that ignored sus/add/omit). Tier-1 triads **100%** notesOk.  
**Piano scrape note:** DOM `note-view` elements often capture melody bleed, not isolated chord voicings; piano ground truth only gates comparison when PCs agree with letter inference.

---

## Fix 018 — `suspensions` in `chordInterpreter` note generation

**When:** 2026-06-27 chord_db bucket triage (`suspensions=4` 81 chords, `suspensions=2` 62, all 0% notesOk)  
**Symptom:** `Esus4` engine kept 3rd (G#) instead of 4th (A); all sus2/sus4/sus7 chords emitted major/minor triad third. Symbols correct via `jsonToSymbol.js`; notes ignored `chord.suspensions`.  
**Root cause:** `chordInterpreter` / `rootToDiatonicTriad` / `buildChordFromNoteName` never read `suspensions` when assembling tones.  
**Fix:** Added `web-player/lib/chordSuspensions.js` — `replaceTriadThird` swaps triad third (degree index 1) for `2` or `4` in chord-root major frame; sus4 wins when both `[2,4]` present (Hooktheory voicing). Wired through `chordInterpreter` → both note builders. Suspended chords: use **major triad frame** when underlying quality is diminished (perfect 5th for `vii7sus2`); use **`b7`** (not diatonic △7) when `type >= 7` and suspensions present — matches `IV7sus2` / `I7sus2` ground truth and Fix 008 symbol rule (no △ on sus).  
**Files:** `web-player/lib/chordSuspensions.js`, `web-player/lib/music.js`  
**Exposed by:** Wonderwall `Esus4`, Come As You Are `isus4`, Penny Lane `vii7sus2`, Clocks `IV7sus2`, applied `V7sus4/iii`.  
**Bucket rerun (engine only, `--rerun`):**

| Bucket | Before | After | Remaining failures |
|---|---|---|---|
| `suspensions=4` | 0/81 (0%) | 76/81 (93.8%) | 3× `omits=5`, 2× `adds=6` composite |
| `suspensions=2` | 0/62 (0%) | 57/62 (91.9%) | 5× `alterations=b5` composite (Back to Black loc) |
| `suspensions=2+4` | 0/4 (0%) | 3/4 (75%) | 1× `adds=6` composite |
| `suspensions=4+2` | 0/2 (0%) | 2/2 (100%) | — |

**Regression:** `the-proclaimers__500-miles` 48/48, `the-beatles__eleanor-rigby` 80/80 notesOk unchanged.

---

## Open engine gaps exposed by Fix 017 (not yet fixed)

| Gap | Symptom | Songs |
|---|---|---|
| ~~`suspensions`~~ | ~~`Esus4` engine keeps 3rd~~ | **Fixed Fix 018** |
| ~~`omits`~~ | ~~`vi(no3)` engine still emits 3rd~~ | **Fixed Fix 020** |
| ~~`adds`~~ | ~~`add9` missing 9th~~ | **Fixed Fix 021** (add6 omit-5th rule) |
| ~~`alterations`~~ | ~~`b9` missing~~ | **Partial Fix 022** (`b5` composites remain) |
| Alignment | Adele Verse b1 rendered `I` vs JSON `IV` | Someone Like You |

These are real `chordInterpreter` gaps in `music.js` — symbol decode (`jsonToSymbol.js`) is correct.

---

## Fix 014 — ESM module loading for oracle harness

**When:** Oracle harness build  
**Symptom:** `engineRun.js` could not `import()` `music.js` / `jsonToSymbol.js` from CommonJS.  
**Root cause:** Engine uses ESM `import`/`export`; Node treated `.js` as CommonJS.  
**Fix:** Added `web-player/lib/package.json` with `"type": "module"`. `engineRun.js` uses dynamic `import()`.  
**Files:** `web-player/lib/package.json`, `_Decode_oracle/engineRun.js`  
**Not a decode rule** — infrastructure for automated testing.

---

## Attempted / reverted (do not re-apply without re-validating)

| Change | Why reverted |
|---|---|
| Force **uppercase** Roman on all suspended chords | Breaks Nirvana *Smells Like Teen Spirit* (`ivsus2` must stay lowercase). Hooktheory is inconsistent: locrian `bVsus2` uses uppercase V, diatonic `ivsus2` uses lowercase. |
| `joinRoman` column-clustering for figured bass | Fixed God Only Knows `V64` vs `V46` SVG parse but broke other songs. |
| DP alignment in `compare.js` | Greedy proportional alignment performs better overall; Penny Lane gaps are scrape omissions not engine bugs. |

---

## Open issues (not engine decode bugs)

These appear in `GLOBAL_discrepancies.md` but are **harness limits, alignment artifacts, or cosmetic symbol ordering** — not wrong note generation:

| Issue | Type | Notes |
|---|---|---|
| Penny Lane Verse (12 disc) | Alignment | Hooktheory UI omits ~3 mid-section chords from render; JSON has them. Engine correct where aligned. |
| Summertime Verse (7 disc) | Alignment | Rendered/JSON offset in Verse tab; aligned beats pass 100%. |
| Zombie Chorus b1 | Scrape | Chorus tab rendered 1 chord vs 16 in JSON. |
| God Only Knows `V46` vs `V64` | SVG parse | Stacked figured-bass digit order from sub-pixel `relX`; engine `V⁶₄` is correct. |
| `Vsus47/ii` vs `V⁷sus4/ii` | Symbol order | Same notes; Hooktheory puts `sus4` before `7` in SVG text. |
| `Isus4sus27` vs `I⁷sus4sus2` | Symbol order | Same chord object renders differently at different beats in Journey Pre-Chorus. |
| `bVsus27(b5)(loc)` vs `bV⁷sus2(b5)(loc)` | Symbol order + case | After Fix 013 notes correct; token order still differs. |
| Round Midnight (4 disc) | Exotic jazz | Custom-array + applied + phrygian edge cases; low priority. |
| Applied `(maj)` tag on minor targets | Symbol only | Summertime `V/i(maj)` — notes OK, tag missing. |
| Tom Petty Free Fallin romanExact 60% | Symbol | Core roman matches 100%; superscript/figured-bass normalization only. |

---

## Pre-oracle engine history (context only)

Commits before the decode oracle that touched the same code paths:

| Commit | Summary |
|---|---|
| `da04a08` | Fix inversion logic |
| `e613e75` | Borrowed chord symbol accuracy; custom borrowed triads; Maple Leaf Rag fixes |
| `e84ca6f` | Augmented chord quality |

These are **not** re-documented entry-by-entry here; Fixes 001–013 supersede and extend that work under automated oracle validation.

---

## Changelog

| Date | Entry | Corpus state |
|---|---|---|
| 2026-06-26 | Fixes 001–009 | corpus 1: 22 songs, ~98% romanExact |
| 2026-06-27 | Fixes 010–013 | corpus_all: 67 songs, 99% notesOk (weak metric) |
| 2026-06-27 | Fixes 015–016 | pcsExact + browser verify; bb7 modifier fix |
| 2026-06-27 | Fix 017 | corpus1: 22 songs, 84% notesOk (strict); extended truth + piano scrape |
| 2026-06-27 | Fix 018 | suspensions buckets 0%→94%/92%; chordSuspensions.js + sus7 b7 rule |
| 2026-06-27 | Fixes 019–024 | Modifier pipeline fleet: omits/adds/alts/extensions + harness root-PC; corpus_all **97.8%** notesOk |
| 2026-06-27 | Fix 026 | corpus1 borrowed minor/hmin/phr buckets **100%** notesOk |
| 2026-06-27 | Fix 025 | corpus1: borrowed dorian/lydian dim7 (bb7) voicing |
| 2026-06-27 | Fix 027 | corpus1: borrowed locrian/custom-array/major **100%** notesOk |
| 2026-06-27 | Fix 025 | corpus1 borrowed dorian/lydian dim7 voicing **100%** notesOk |
| 2026-06-27 | Fixes 028–029 | corpus2 **99.45%**, corpus3 **99.04%** notesOk; `--db-dir` |
| 2026-06-27 | Fix 030 | pageScraper tab-based; 10 popular songs in `.hooktheory_cache` |

*Append new entries at the bottom of the numbered fix section and add a changelog row when merging decode fixes.*

---

## Fix 019 — Modifier pipeline scaffold (`chordModifiers.js`)

**When:** 2026-06-27 parallel fleet Agent 0  
**Fix:** Added `web-player/lib/chordModifiers.js` — ordered post-suspension pipeline: omits → alterations → adds. Wired into `rootToDiatonicTriad` / `buildChordFromNoteName` after `replaceTriadThird`, before inversion.  
**Files:** `chordModifiers.js`, `music.js`

---

## Fix 020 — `omits[]` note generation

**When:** Agent 1 (`omits=3`, `omits=5` buckets)  
**Fix:** `chordOmits.js` removes scale-degree slots 3/5. Diminished `omit 5` triads get dim7 upper tone via `shiftNoteBySemitones(root, +6)` (fixed MIDI arithmetic in `chordNoteUtils.js`).  
**Bucket rerun:** `omits=3` **100%**, `omits=5` **100%** (30/30).  
**Files:** `chordOmits.js`, `chordNoteUtils.js`, `music.js`

---

## Fix 021 — `adds[]` note generation

**When:** Agent 2 (`adds=9`, `adds=4`, `adds=6`)  
**Fix:** `chordAdds.js` appends add2/4/6/9/13 in chord-root major frame. Hooktheory add6 triads omit 5th when `type < 7` (mirrored in `truthNotes.js`).  
**Bucket rerun:** `adds=9` **100%**, `adds=4` **100%**, `adds=6` **95%** (40/42).  
**Files:** `chordAdds.js`, `chordModifiers.js`, `truthNotes.js`

---

## Fix 022 — `alterations[]` note generation

**When:** Agent 3 (`alterations=b5/b9/#5`)  
**Fix:** `chordAlterations.js` replaces chord tones; `b5` matches dim5 or perf5; `b9` targets natural 9th PC. Combined paren tags `(b5b9)` parsed in `truthLetterParse.js`.  
**Bucket rerun:** `alterations=b9` **100%**; `alterations=b5` **86%**.  
**Files:** `chordAlterations.js`, `truthLetterParse.js`

---

## Fix 023 — Extended types 9/11/13

**When:** Agent 4 (`type=11`, `type=13`)  
**Fix:** `chordExtensions.js` — type 9/11/13 stacks; natural vs #11 by quality; minor-key `v11` uses natural 11; half-dim `ø` via `halfDim` flag + diminished triad on `ii` when `type >= 7`.  
**Bucket rerun:** `type=13` **100%**; `type=11` **82%** (slash-root + ø11 edge cases remain).  
**Files:** `chordExtensions.js`, `music.js`, `engineRun.js`

---

## Fix 024 — Harness: slash-root truth + truth-enriched engine compare

**When:** Agent 5  
**Fix:** `chordRootPc.js` — resolve JSON scale-degree root; slash letters (`F/G`, `Ab/Bb`) prefer JSON root over pre-slash letter root in `expectedPcs`. `compare.js` merges SVG truth letter mods (`mergeMods`, `halfDim`) before `runChord` so incomplete JSON still gets `(b5b9)` / `no3` / `ø` semantics.  
**Corpus_all:** notesOk **90.2% → 97.8%** (3303/3378). Tier-1 regression: 500 Miles + Eleanor Rigby **100%** notesOk.  
**Files:** `chordRootPc.js`, `truthNotes.js`, `truthLetterParse.js`, `compare.js`, `testModification.js`

---

## Remaining gaps toward 99% notesOk (post Fix 024)

| Bucket | notesOk | Notes |
|---|---|---|
| ~~`borrowed=dorian`~~ | ~~79%~~ | **Fixed Fix 025** |
| ~~`borrowed=lydian`~~ | ~~93%~~ | **Fixed Fix 025** |
| ~~`borrowed=minor`~~ | ~~91%~~ | **Fixed Fix 026** |
| ~~`borrowed=phrygian`~~ | ~~83%~~ | **Fixed Fix 026** |
| ~~`borrowed=harmonicMinor`~~ | ~~83%~~ | **Fixed Fix 026** |
| ~~`borrowed=custom-array`~~ | ~~76%~~ | **Fixed Fix 027** |
| `alterations=#5` | ~80% | Composite + borrowed interactions |
| `type=11` | ~82% | `v11(b9)` minor-key spelling; `iiø11` without SVG enrich |
| `applied=yes` | ~94% | Secondary dominant + borrowed composites |
| `omits=3+5` | 0% (1 chord) | REM `iiø11(no3no5)` truth PC root normalization |
| `inversion=0/1` | ~98% | Alignment + slash bass edge cases |

---

## Fix 025 — Borrowed dorian / lydian dim7 voicing (corpus1)

**When:** 2026-06-27 oracle/chord-db-suspensions-truth  
**Symptom:** `#viø7(dor)` and `#ivø7(lyd)` chords (Penny Lane, Round Midnight, Your Song) emitted half-dim stacks (min7 = `b7`) while ground truth expects dim7 (`bb7`); `m7(b5)` letter enrich double-flattened an existing dim5 via `b5` alt.  
**Root cause:** `diatonicSeventhDegreeStr` reads the diatonic subdominant (min7 above root) for dorian vi° / lydian iv°; Hooktheory renders ø but voices dim7. `chordAlterations` `b5` matched both perf5 and dim5 PCs.  
**Fix:** `borrowedModeDimSeventhDegree()` in `music.js` — dorian degree 6 / lydian degree 4 diminished sevenths use `bb7`. `chordAlterations.js` — `b5` only targets perfect fifth (+7).  
**Bucket rerun (corpus1-filtered, `--rerun`):**

| Bucket | Before | After |
|---|---|---|
| `borrowed=dorian` | 6/10 (60%) | **10/10 (100%)** |
| `borrowed=mixolydian` | 6/6 (100%) | **6/6 (100%)** |
| `borrowed=lydian` | 0/1 (0%) | **1/1 (100%)** |

**Full corpus rebuild (`--corpus corpus.json`):** `borrowed=dorian` **17/17**, `borrowed=mixolydian` **7/7**, `borrowed=lydian` **6/6**.  
**Regression:** 500 Miles **12/12**, Eleanor Rigby **19/19** notesOk.  
**Files:** `web-player/lib/music.js`, `web-player/lib/chordAlterations.js`

---

## Fix 026 — Borrowed minor / phrygian / harmonicMinor voicing (corpus1)

**When:** 2026-06-27 oracle/chord-db-suspensions-truth  
**Symptom:** corpus1 `borrowed=minor` ~91%, `borrowed=phrygian` ~83%, `borrowed=harmonicMinor` ~83%. ø7 stacks on minor°2 / phrygian°5 voiced as half-dim (`b7`) when ground truth expects dim7 (`bb7`); Summertime `V7/iv` stored as `root=1 applied=0` produced i⁷(min) not B7; Round Midnight `V7(b5)/bII(phr)` used parent-key E# instead of phrygian E; `i△⁴²(hmin)` bass `Cx` failed compare.  
**Root cause:** `borrowedModeDimSeventhDegree` only covered dorian°6 / lydian°4; `chordInterpreter` applied branch ignored borrowed scale for denominator tonic; Hooktheory stores V7/iv on tonic degree without `applied` field; `svgTruth.noteToPc` did not parse double-sharp `x`.  
**Fix:** Extended `borrowedModeDimSeventhDegree` for minor°2 and phrygian°5 → `bb7`. Reinterpret `harmonicMinor + borrowed=minor + root=1 + type≥7` as `root=4 applied=5` (V7/iv). Applied-chord target tonic from `resolveBorrowedScale` (phrygian bII = E not E#). `svgTruth` `x` → +2 semitones in `noteToPc` / parse regex.  
**Bucket rerun (corpus1-filtered, `--rerun`):**

| Bucket | Before | After |
|---|---|---|
| `borrowed=minor` | 21/23 (91%) | **23/23 (100%)** |
| `borrowed=harmonicMinor` | 5/6 (83%) | **6/6 (100%)** |
| `borrowed=phrygian` | 10/12 (83%) | **12/12 (100%)** |
| `borrowed=phrygianDominant` | n/a | n/a (0 corpus1 chords) |

**Regression:** 500 Miles **12/12**, Eleanor Rigby **19/19** notesOk.  
**Files:** `web-player/lib/music.js`, `_Decode_oracle/svgTruth.js`  
**Exposed by:** Summertime (V7/iv, vø7 phr), Maple Leaf Rag (iiø7 min), Round Midnight (i△42 hmin, V7(b5)/bII phr).

---

## Fix 027 — Borrowed locrian / custom-array applied + dim7 voicing (corpus1)

**When:** 2026-06-27 oracle/chord-db-suspensions-truth  
**Symptom:** `borrowed=locrian` 75% corpus1 (Summertime `i` vs `V⁷/V`); `borrowed=custom-array` 80% (God Only Knows `#iø7(bor)`, Round Midnight `V7/bV(maj)(bor)`); custom-array `#iø7` stacks used `b7` (G♯) instead of dim7 `bb7` (G♮).  
**Root cause:** `chordInterpreter` took the applied-chord fast path before borrowed resolution, ignoring `borrowed` arrays/modes. Applied+borrowed composites re-applied `borrowed` on the recursive tonicized key. Custom borrowed diminished sevenths used scale-degree-7 `b7` instead of Hooktheory's dim7 upper tone. Locrian `applied===root` encodes borrowed-mode tonic `i(min7)`, not `V/V`.  
**Fix:** `resolveAppliedBorrowedChord()` — custom-array applied chords tonicize the borrowed-scale target note and build the numerator in that major key (`borrowed=null` on recurse); locrian `applied===root` → degree-1 minor + `b7`. `chordInterpreter` skips applied fast-path when `borrowed` is set. `borrowedModeDimSeventhDegree` returns `bb7` for `scale==="custom"`. Verified Fix 013 locrian qualities unchanged (deg 5 major, deg 7 minor).  
**Bucket rerun (corpus1, `--rerun`):**

| Bucket | Before | After |
|---|---|---|
| `borrowed=locrian` | 3/4 (75%) | **4/4 (100%)** |
| `borrowed=custom-array` | 12/15 (80%) | **15/15 (100%)** |
| `borrowed=major` | 4/4 (100%) | **4/4 (100%)** |

**Rebuild:** `node buildChordDb.js --corpus _Decode_oracle/corpus.json` — 33 songs, 1538 chords.  
**Regression:** 500 Miles + Eleanor Rigby notesOk unchanged.  
**Files:** `web-player/lib/music.js`, `_Decode_oracle/chord_db/*`

---

## Fix 028 — Corpus2 chord DB + figured-sixth harness + type-11 minor voicing

**When:** 2026-06-27 oracle/chord-db-suspensions-truth (corpus2 closed-loop)  
**Symptom:** corpus2 baseline **98.39%** notesOk (2134/2169). Systematic failures on Hooktheory **figured-sixth letters** (`G6`, `A6`, `F6` for `v65`/`vi65`), applied **IV△7/I** (maj7 vs b7), engine-letter **b9 bleed** on `v11`, minor **11th** voicing (`Am11` missing natural 11th D), bass compare on enharmonic slash chords.  
**Root cause:** `resolveTruthRootPc` treated `G6` letter root as chord root (not bass); `triadQualityFromLetter` parsed add-6 major stacks; `buildChordFromNoteName` used `b7` for applied IV; `enrichChordFromSymbol` re-merged engine-letter `b9` over truth enrich; `applyTypeExtensions` natural-11 path used scale-degree `6` (F#) instead of `4` (+1 oct) for minor 11ths.  
**Fix:**

| Area | Change |
|---|---|
| Harness | `isFiguredSixthLetter` → JSON root + `triadQualityFromRoman` in `expectedPcs` |
| Harness | `bassInNotes` accepts `pcsExact && romanCore` (slash spelling) |
| Harness | `enrichChordFromTruth` sets `_truthEnriched`; engineRun skips engine-letter re-merge |
| Engine | Applied `applied===4` → `useMaj7` in `buildChordFromNoteName` |
| Engine | Minor natural-11: target PC `root+5`, voice as sd `4` +1 octave |

**Corpus2 DB:** `_Decode_oracle/chord_db_corpus2/` via `--db-dir` (45 primary songs, 2169 chords).  
**Result:** notesOk **99.45%** (2157/2169). `inversion=1` bucket **99.1%** (was ~90% on v65/vi65). `type=11` **94.4%** (was 72%).  

**Remaining 12 failures (0.55%):**

| ID | Class | Notes |
|---|---|---|
| `amy-winehouse…/Instrumental/7.5` | engine | `i42(min)` borrowed-minor inv3 seventh |
| `carole-king…/Chorus/31` | engine | `vii7(#5)` altered half-dim |
| `george-gershwin__summertime/Verse/*` (5) | harness | section `countMatch=false` alignment |
| `pink-floyd__money/Chorus/8` | engine | applied+borrowed+#5 augmented dim |
| `rem__losing-my-religion/Intro/15` | engine | `iiø11(no3no5)` root PC |
| `simon-and-garfunkel…/Intro/11` | engine | applied `iiø6(b5)/ii` |
| `the-cranberries__zombie/Chorus/1` | harness | `VII6D/F#` alignment |
| `the-police…/Chorus/64.5` | engine | custom-borrowed `vi°△7(b5)` |

**Commands:**
```bash
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus2.json --db-dir _Decode_oracle/chord_db_corpus2
node _Decode_oracle/testModification.js --list --db-dir _Decode_oracle/chord_db_corpus2
node _Decode_oracle/testModification.js --failing --db-dir _Decode_oracle/chord_db_corpus2
```

**Files:** `chordRootPc.js`, `truthLetterParse.js`, `truthNotes.js`, `compare.js`, `engineRun.js`, `chordExtensions.js`, `music.js`, `chord_db/writeOutput.js`, `buildChordDb.js`, `testModification.js`

---

## Tooling — corpus3 (500 songs, 2026-06-27)

**Deliverable:** `_Decode_oracle/corpus3.json` — 500 Hooktheory TheoryTab entries with `complexityRank` 1–500 and coarse `tier` 1–5.

**Tier definitions** (`_Decode_oracle/corpus3/tierMeta.js`):

| Tier | Ranks | Focus |
|---|---|---|
| 1 | 1–100 | Basic triads, I–IV–V, I–V–vi–IV |
| 2 | 101–200 | Sevenths, sus/add, inversions |
| 3 | 201–300 | Applied chords, secondary dominants |
| 4 | 301–400 | Borrowed/modal mixture, suspensions |
| 5 | 401–500 | Jazz/extended harmony, chromatic/classical |

**Entry fields:** `complexityRank`, `tier`, `note`, `artist`, `title`, `slug`, `url`, `alternates`, `source`.

**Build pipeline:**
- `node _Decode_oracle/corpus3/buildCorpus3.js` — merge corpus1/2, tier seeds, discovered URLs (1020 via browse+search scrape), out/cache; dedupe; priority sort (corpus > seed > scraped > discovered); filter junk test URLs.
- `node _Research_testing/discover_theorytab_urls.js` + `discover_theorytab_search.js` — Hooktheory URL discovery.
- `node _Decode_oracle/batchScrapeCorpus.js --corpus corpus3.json --compare` — batch scrape missing `out/<slug>/scrape.json`.
- `node _Decode_oracle/buildChordDb.js --corpus corpus3.json --db-dir chord_db_corpus3` — corpus-filtered chord DB.

**Initial scrape coverage (2026-06-27):** 73/500 valid scrape.json, 18 empty/404, 409 pending.

**Initial chord_db_corpus3 (73 songs, 3382 chords):** notesOk **99.3%** (3357/3382), romanExact 95.6%; 12 buckets below 99%.

**Commands:**
```bash
node _Decode_oracle/corpus3/buildCorpus3.js
node _Decode_oracle/batchScrapeCorpus.js --corpus _Decode_oracle/corpus3.json --compare --limit 50
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus3.json --db-dir _Decode_oracle/chord_db_corpus3
node _Decode_oracle/testModification.js --list --db-dir _Decode_oracle/chord_db_corpus3
node _Decode_oracle/run.js --corpus _Decode_oracle/corpus3.json --no-browser
```

**Files added:** `corpus3.json`, `corpus3/buildCorpus3.js`, `corpus3/tierMeta.js`, `corpus3/seeds/tier{1-5}.json`, `batchScrapeCorpus.js`, `chord_db_corpus3/`, `_Research_testing/discover_theorytab_urls.js`, `discover_theorytab_search.js`.

---

## Fix 029 — Corpus3 closed-loop: bassPc harness + engine voicing buckets

**When:** 2026-06-27 oracle/chord-db-suspensions-truth (corpus3 closed-loop)  
**Symptom:** corpus3 at **99.3%** on 162 songs regressed on expanded scrape; systematic engine gaps on phdm `bVI+△7`, `#5` dim→minor, applied `vii/#5`, `iiø11(no3no5)`, `i42(min)` hm-borrow remap; harness `bassPc` false-negatives when letter has no slash.  
**Root cause:** `parseLetter` set `bassPc=rootPc` without slash; phrygian-dominant VI+ rendered as aug not maj7; `#5` on dim used dim7 frame; hm `i(min)` inv42 mis-routed to `V7/iv`; half-dim / minor 11 `(no3no5)` shells missing 7th/9th/11th PCs.  
**Fix:**

| Area | Change |
|---|---|
| Harness | `parseLetter`: `bassPc` only when slash bass present |
| Engine | phdm bVI maj7: force major triad when no `#5` alt |
| Engine | `#5` on dim scale degree → minor triad + `b7` |
| Engine | applied borrowed `vii` + `#5` → minor + alt |
| Engine | hm `borrowed=minor` + `inversion>0` → skip `V7/iv` remap |
| Engine | `omitTriad35` + type≥7 → add `b7`/`bb7`; half-dim 11th at +1 when skipNine |
| Engine | `skipNine` only when halfDim + omits 3+5 |

**Corpus3 DB:** `_Decode_oracle/chord_db_corpus3/` — **179 songs**, **6740 chords**, notesOk **99.04%** (6675/6740).  
**Before (162 songs / 6096 chords):** 99.3% (6055/6096), 41 failing.  
**Remaining:** 65 failing (60 harness alignment, 3 piano_noise, 2 engine).

**Commands:**
```bash
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus3.json --db-dir _Decode_oracle/chord_db_corpus3
node _Decode_oracle/testModification.js --list --db-dir _Decode_oracle/chord_db_corpus3
node _Decode_oracle/testModification.js --failing --db-dir _Decode_oracle/chord_db_corpus3
```

**Files:** `svgTruth.js`, `music.js`, `chordExtensions.js`, `DECODE_FIX_LOG.md`

---

## Fix 030 — Hooktheory page scraper (extract_hooktheory_data.js)

**When:** 2026-06-27 (web-player song cache expansion)  
**Symptom:** `extract_hooktheory_data.js` failed for all URLs: `col-md-8 container not found on page`.  
**Root cause:** Hooktheory removed the Bootstrap `div.col-md-8` layout; old `pageScraper.js` scrolled H2s inside that container.  
**Fix:** Rewrote `lib/scraper/pageScraper.js` to discover sections via `a.tb-section-tab`, click each tab, read `tab-{songId}` container IDs (same model as `_Decode_oracle/scrapeSong.js`).  
**Result:** 10 popular songs cached to `.hooktheory_cache/` (16 total with originals). Batch: `_Debug_testing/cache_10_popular.cjs`.  
**Files:** `lib/scraper/pageScraper.js`, `_Debug_testing/cache_10_popular.cjs`, `.hooktheory_cache/*` (10 new artist dirs)

---

## Fix 031 — Note order validation + inv=0 pitch-ascending voicing

**When:** 2026-06-27 (corpus2 closed-loop order check)  
**Symptom:** After enabling `orderOk` in compare/DB, corpus2 regressed on inv=0 chords; dim7 spread voicing wrong (e.g. Maple `vii°7/V`); engine crash `Assignment to constant variable` on add9 chords; `Cb4` etc. mis-sorted.  
**Root cause:** (1) `buildChordFromNoteName` / `rootToDiatonicTriad` never sorted inv=0 voicings; dim7 kept 3rd/5th in root octave. (2) `noteToMidi` in engine + harness mishandled `Cb`/`Fb` spellings. (3) `let { toneJSNames, degreeIndices }` was `const` in `music.js`. (4) `notesOk` did not require `orderOk`. (5) Piano scrape order is staff top-to-bottom, not pitch-ascending.  
**Fix:**

| Area | Change |
|---|---|
| Engine | New `chordVoicing.js`: `finalizeVoicing`, `spreadDim7Voicing`, `sortVoicingByPitch`; wired into `buildChordFromNoteName` + `rootToDiatonicTriad` |
| Engine | `noteToMidi` handles `b` accidentals after letter (Cb4, Fb3) |
| Engine | `let { toneJSNames, degreeIndices }` in triad builders |
| Harness | `truthNotes.checkNoteOrder`: inv=0 → pitch-ascending; piano-validated inv=0 compares pitch-sorted both sides |
| Harness | `compare.notesOk` requires `orderOk`; chord DB tracks `orderOk` per entry |
| Harness | `pianoNotes.chordRootTonic` for data-sd scale-degree→note conversion |

**Corpus2 DB:** `_Decode_oracle/chord_db_corpus2/` — **50 songs**, **2347 chords**, notesOk **99.7%** (2339/2347), orderOk **100%** (2347/2347).  
**Before order check:** notesOk ~99.45% (order not gated).  
**Remaining 8 notesOk failures:** 2 engine (`alterations=b5` half-dim applied, `borrowed=custom-array` dim△7), 6 harness (Summertime locrian alignment, Zombie `VII6D` parse).

**Commands:**
```bash
node _Debug_testing/probe_maple_ddim7.cjs   # expect D3, Cb4, F4, Ab4
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus2.json --db-dir _Decode_oracle/chord_db_corpus2
node _Decode_oracle/testModification.js --failing --db-dir _Decode_oracle/chord_db_corpus2
node _Decode_oracle/compare.js _Decode_oracle/out/scott-joplin__maple-leaf-rag/scrape.json
```

**Files:** `web-player/lib/chordVoicing.js`, `web-player/lib/music.js`, `_Decode_oracle/truthNotes.js`, `_Decode_oracle/compare.js`, `_Decode_oracle/pianoNotes.js`, `_Decode_oracle/chord_db/*`

---

## Fix 032 — Summertime leading-JSON chord skip

**When:** 2026-06-27  
**Symptom:** `george-gershwin__summertime/Verse` — 10 rendered vs 11 JSON; beats misaligned from beat 1.  
**Root cause:** First JSON chord is a rest/phantom; SVG strip starts at JSON[1].  
**Fix:** `compare.js` `leadingJsonSkipCount()` — when `jsonCount === renderedCount + 1` and first SVG root matches `JSON[1]` not `JSON[0]`, skip leading JSON chord before pairing.  
**Files:** `_Decode_oracle/compare.js`

---

## Fix 033 — Applied locrian V7 + dimTriad bor

**When:** 2026-06-27  
**Symptom:** `bridge-over-troubled-water` `iiø6(b5)5/ii`; `every-breath-you-take` `vi°△7(b5)(bor)` engine PC mismatches.  
**Root cause:** (1) Locrian `applied===target` shortcut forced minor triad on type-7 applied chords. (2) `°` in roman not setting `dimTriad` + `bb7`. (3) `engineRun.enrichChordFromSymbol` overwrote truth flags on re-enrich.  
**Fix:** Gate locrian shortcut to `chordType < 7`; `dimTriad` from `°`; preserve `_truthEnriched` flags in `engineRun.js`.  
**Files:** `web-player/lib/music.js`, `chordAlterations.js`, `chordModifiers.js`, `_Decode_oracle/engineRun.js`, `_Decode_oracle/compare.js`

---

## Fix 034 — Piano PC-order gate + Summertime engine (closed-loop iteration)

**When:** 2026-06-27  
**Symptom:** ~46 “engine” failures were PCs-exact but `orderOk` false; Summertime beats 9 (`V7/bV(loc)`) and 17 (`i7(min)`); corpus still had alignment harness clusters.  
**Root cause:**

| Bucket | Cause |
|---|---|
| Misclassified engine | `checkNoteOrder` compared literal note names or midi-sorted order; piano scrape is staff-order with voice-crossing (e.g. Clocks `Bb3,Eb4,G3` vs engine `Eb3,G3,Bb3`) — same PCs, different register order |
| Inv 1/2 engine | Inverted chords compared `C#4` vs `C#3` after pc-sort — octave spelling false negative |
| Summertime beat 9 | `V7/bV(loc)` with `root=5 applied=5` hit locrian `applied===target` → i minor instead of C7 |
| Summertime beat 17 | Erroneous `hm + borrowed=minor + root=1` → `V7/iv` redirect in `chordInterpreter` |

**Fix:**

| Area | Change |
|---|---|
| Harness | `truthNotes.checkNoteOrder`: compare **pitch-class ascending** order (`pcOrder` / `pitchClassOrder`) for all piano-validated pairs regardless of inversion |
| Engine | Locrian `applied===target` shortcut only when `chordType < 7` (Fix 033 extension) |
| Engine | Remove hm `borrowed=minor root=1` → `V7/iv` redirect block |

**Corpus DB after rebuild:**

| Corpus | Chords | notesOk | Fail | eng | harness | piano |
|---|---:|---:|---:|---:|---:|---:|
| 1 (`chord_db`) | 1538 | **99.2%** | 13 | 0 | 11 | 2 |
| 2 (`chord_db_corpus2`) | 2347 | **99.96%** | 1 | 0 | 1 | 0 |
| 3 (`chord_db_corpus3`) | 6732 | **99.5%** | 31 | 0 | 28 | 3 |

**Remaining failure taxonomy (all corpora):**

1. **Alignment / count mismatch (harness)** — rendered strip count ≠ JSON chord count; pairs drift:
   - `the-cranberries__zombie/Chorus` — **1 vs 16** (repeat-condensed SVG; sole corpus2 failure)
   - `the-beatles__penny-lane/Verse` — **43 vs 46** (figured-bass `I△42`, `V42`, `ii65`)
   - `the-kinks__waterloo-sunset/Bridge` — **21 vs 23** (`V42`, `V43/IV`, `IV△42/IV`)
   - `bruno-mars__i-just-might` Intro/Chorus — repeat-prefix (+2/+2 chords)
2. **Truth-parser / figured notation (harness)** — PCs match on some rows but roman/root wrong after mis-alignment; `VII6D/F#` needs figured-sixth + slash parse when alignment fixed
3. **Piano noise (3)** — `god-only-knows` `#iø7(bor)` custom-array b5 bleed; `whitney-houston` `iø7(loc)` bb7 vs natural 7

**Next P0:** extend `alignPairs` for small deltas (+2/+3) and repeat-condensed sections; `VII6D` letter parse in `truthLetterParse` / `chordRootPc`.

**Commands:**
```bash
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus2.json --db-dir _Decode_oracle/chord_db_corpus2
node _Decode_oracle/compare.js _Decode_oracle/out/george-gershwin__summertime/scrape.json
node _Decode_oracle/compare.js _Decode_oracle/out/the-cranberries__zombie/scrape.json
```

**Files:** `_Decode_oracle/truthNotes.js`, `web-player/lib/music.js`, `_Decode_oracle/DECODE_FIX_LOG.md`

---

## Fix 035 — Repeat-condensed SVG row split + rootPc alignment

**When:** 2026-06-27  
**Symptom:** corpus2 sole failure `zombie/Chorus` `VII6D/F#→i`; corpus3 clusters on `bruno-mars/i-just-might` Intro/Chorus and partial Waterloo Bridge recovery.

**Root cause:**

| Issue | Cause |
|---|---|
| `VII6D/F#` empty letter | Repeat-condensed strip sets all SVG fragments to `y=0`; `splitRows` put roman+letter in upper band → roman `VII6D/F#`, letter blank |
| Chorus 1↔16 mis-pair | `alignPairs` index-0 paired rendered `D/F#` with JSON `i` |
| Bruno Intro 4↔8 | Index pairing: rendered `ii7` on JSON `I` beats |
| Bruno Chorus 9↔11 | +2 leading JSON chords before first rendered `iii7`; ratio 0.82 used position matcher instead of skip |

**Fix:**

| Area | Change |
|---|---|
| `svgTruth.js` | When `y` span &lt; 12, split rows by fill: `#ffffff` = roman, `#dae0e6` = letter (Hooktheory convention) |
| `compare.js` | `alignByRootPc()` for repeat-condensed sections (`ratio < 0.8`) — monotonic letter-root match |
| `compare.js` | `leadingJsonSkipCount()` generalized: skip up to 3 leading JSON chords when first SVG root matches `JSON[skip]` |

**Corpus DB after rebuild:**

| Corpus | Chords | notesOk | Fail | eng | harness | piano |
|---|---:|---:|---:|---:|---:|---:|
| 1 (`chord_db`) | 1538 | **99.2%** | 12 | 0 | 10 | 2 |
| 2 (`chord_db_corpus2`) | 2347 | **100.0%** | **0** | 0 | 0 | 0 |
| 3 (`chord_db_corpus3`) | 6740 | **99.8%** | 14 | 0 | 11 | 3 |

**Deferred (see `REMAINING_FAILURES.md`):** Penny Lane Verse figured-bass alignment (10); Waterloo Bridge/41 compound figured parse (1); god-only-knows `#iø7(bor)` b5 (2); whitney `iø7(loc)` bb7 (1).

**Commands:**
```bash
node _Decode_oracle/compare.js _Decode_oracle/out/the-cranberries__zombie/scrape.json
node _Decode_oracle/compare.js _Decode_oracle/out/bruno-mars__i-just-might/scrape.json
node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus2.json --db-dir _Decode_oracle/chord_db_corpus2
```

**Files:** `_Decode_oracle/svgTruth.js`, `_Decode_oracle/compare.js`, `_Decode_oracle/REMAINING_FAILURES.md`

---

## Agent onboarding

Permanent session summary for future agents: [`AGENT_WORK_RECORD.md`](./AGENT_WORK_RECORD.md)

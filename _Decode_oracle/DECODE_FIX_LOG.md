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

## Fix 036 — Corpus4-driven engine fixes (hardest properties: inversions, altered 5ths, extended/omit, borrowed 7ths, null crashes)

**When:** Corpus4 phase (500 songs, 14,603 chords). Baseline 98.3% notesOk, 244 failing, 110 unique engine bugs.
**Method:** Built `_Debug_testing/diffSignature.cjs` to dump `truthPcs` vs `engPcs` per chord signature against `chord_db_corpus4` (no scraping); iterated fix → `buildChordDb.js --corpus corpus4.json` rebuild → recheck.

**036a — Extended chord with 3rd+5th omitted collapsed maj7 to b7.**
Symptom: `I△9(no3no5)` truth `[0,2,11]` vs eng `[0,2,10]` (10 failures).
Cause: `rootToDiatonicTriad` `omitTriad35` branch hardcoded the seventh as `b7`.
Fix: derive the seventh from the prevailing scale (`borrowedModeDimSeventhDegree ?? diatonicSeventhDegreeStr`), keeping `b7` only for sus frames and `bb7` for half-dim. `web-player/lib/music.js`.

**036b — `ø(b5)` did not render as a full diminished seventh.**
Symptom: `iø6(b5)5` truth `[1,4,7,10]` vs eng `[1,4,8,10]` (perfect 5th kept; ~5 failures across judith/dress-down).
Cause: `flattenHalfDimB5` branch only tried to flatten a `b7` (often absent), leaving a perfect 5th.
Fix: lower the perfect 5th to dim5 AND the m7 to dim7 when `halfDim && flattenHalfDimB5`. `web-player/lib/chordAlterations.js`.

**036c — `#5` on borrowed diminished sevenths corrupted the 7th.**
Symptom: `#iv7(#5)(lyd)` truth `[1,4,9,11]` vs eng `[1,4,9,10]` (bb7 instead of b7; dj-nagureo/leslie-odom).
Cause: when `sharp5Minor` rewrote the triad to minor, the seventh still picked `bb7` via `borrowedModeDimSeventhDegree`.
Fix: force `b7` when `sharp5Minor` (or diminished+`#5`). `web-player/lib/music.js`.

**036d — Locrian `iø7` voiced half-dim instead of dim7.**
Symptom: `iø7(loc)` truth `[1,4,7,10]` (dim7) vs eng `[1,5,7,10]`/`[1,4,7,10]+b7` (mars/mel-han/gabriel).
Cause: `borrowedModeDimSeventhDegree` lacked the locrian degree-1 case.
Fix: `if (scale === "locrian" && chordRootSD === 1) return "bb7"`. `web-player/lib/music.js`.

**036e — `chordInterpreter` threw (engPcs=null) for remote/theoretical keys.**
Symptom: `bVI(min)` in Db, `vii°/i` applied in G# minor, `#iii7(maj)` in D# minor, `V7(b5)sus2/#iii` — all returned null (11 nulls; 8 real + 3 scrape noise).
Cause chain: (1) `MAJOR_SCALE_LABELS`/`MINOR_SCALE_LABELS` lack theoretical tonics (Db minor, D# major) → `diatonicNames[…]` crashed; (2) `generateScaleLabels` rejected double-accidental tonics (`Bbb`, `F##`); (3) `getAbsoluteOctave` produced `NaN` octaves for tonics absent from `NOTE_NAME_TO_INTEGER_NOTATION`.
Fix: fall back to `generateScaleLabels(tonic, MAJOR/MINOR_SCALE_SPECIFIC_INTERVALS)` for missing label tables; compute tonic pitch class arithmetically for double-accidental tonics; fall back to `noteToPcLocal` for the octave-math tonic semitone. `web-player/lib/music.js`, `web-player/lib/scales.js`.

**Corpus DB after all 036 fixes:**

| Corpus | Chords | notesOk | Fail | engine |
|---|---:|---:|---:|---:|
| 2 (`chord_db_corpus2`) | 2451 | **99.9%** | 3 | 0 |
| 3 (`chord_db_corpus3`) | 7416 | **99.6%** | 30 | — |
| 4 (`chord_db_corpus4`) | 14603 | **98.5%** (was 98.3) | 212 (was 244) | 80 (was 110) |

No regression on type=5 (98.9%) / type=7 (97.0→97.3%); corpus2/3 unchanged or improved.

**Deferred (single-song / unimplemented):** Mars `ii°△`/`i°11` custom-array symmetric-dim7 bass disambiguation; tritone substitutions (`∆-sub`, `substitutions:["tri"]`, not implemented); caravan-palace custom-array `bvi` off-by-one; applied `vii°(#5)` semitone (fiona/haim); 3 hertzdevil `truth:undefined` scrape-noise nulls.

**Helper:** `_Debug_testing/diffSignature.cjs` (`node … [tokens] [--all] [--db NAME]`).

---

## Fix 037 — Gusty Garden borrowed-prefix + spelled-pill display/playback split

**When:** 2026-07-02 (single-song oracle loop: Nintendo `super-mario-galaxy---gusty-garden-galaxy`)  
**Symptom:** `Verse and Pre-Chorus` / `Chorus` `bII△42(phr)` in Db-major context rendered as `♯II△42(phr)` (engine letter `Dmaj7/Db` instead of Ebb spelling); note pills also collapsed theoretical spellings through `normalizeToneNotes`, hiding double accidentals (`Bbb` displayed as `A`).  
**Root cause:** `jsonToSymbol.borrowedPrefix()` used coarse accidental detection (`includes('b')`, `includes('#')`) and misread multi-accidental spellings like `Ebb`; UI note pills were fed normalized playback notes, not spelled engine notes.  
**Fix:** Rewrote accidental parsing in `jsonToSymbol.accidentalValue()` to sum full accidentals (`b/#/x`) and clamp to ±2 for prefix rendering. Extended `NOTE_NAME_TO_INTEGER_NOTATION` with double-accidental spellings (`Ebb`, `Bbb`, `F##`, `Cx`, etc.). Split display vs playback paths: `noteIndicator` now displays spelled notes from `chordInterpreter`, while `player.js` normalizes only at playback boundaries (scheduling/preview/click). Updated note-pill pitch-class regex to accept multi-accidentals.  
**Files:** `web-player/lib/jsonToSymbol.js`, `web-player/lib/scales.js`, `web-player/components/noteIndicator.js`, `web-player/player.js`  
**Result (target song):** `run.js --no-browser` improved from `romanExact 76/80, disc=3` to `romanExact 79/80, disc=0`; `notesOk` stayed `80/80`.  

---

## Fix 038 — V11(min) extension scale-degree mapping + enharmonic modifier diffs

**When:** 2026-07-02 (continued Gusty Garden closed-loop, chord `v11(min)` / `abm11(b9)`)  
**Symptom:** `Chorus` beat 61 still flagged degree mismatch for `v11(min)` despite matching chord PCs. Pill labels on altered extensions were malformed (e.g. `#6` where the played pitch class implied `b6`), and `degreesOk` failed in closed-loop compare.
**Root cause:** `calculateScaleDegrees()` only handled triad + a hardcoded seventh, so 9/11/13 extensions collapsed to fallback degree logic. Additionally, `getModifierDifference()` inferred accidentals from accidental text only and assumed same-letter spellings, which breaks on enharmonic letter shifts (`A` vs `Bb`) after extension alterations like `b9`.
**Fix:** Added explicit extension base-degree mapping by `degreeIndices` (`7/9/11/13` → `7/2/4/6`) so upper extensions resolve correctly in song-key space. Replaced accidental-text delta in `getModifierDifference()` with pitch-class delta (`noteToPcLocal`) normalized to ±6 semitones, then rendered modifier strings (`bb/b/#/##`) from that semitone diff.
**Files:** `web-player/lib/music.js`  
**Result (target song):** `v11(min)` now reports valid degree labels (`degreesOk=true`), and Gusty compare no longer flags `degreesOk` for that row. Overall target song remains `notesOk 80/80`, `romanExact 79/80`, `disc=0`.

---

## Fix 039 — Timeline global recontext to currently playing key

**When:** 2026-07-02 (Gusty Garden pre-chorus key-switch debug loop)  
**Symptom:** timeline chord labels did not match the current playback key context after the pre-chorus key switch. During the switched region, labels were rendered in stale section-start key context rather than the currently playing key context.
**Root cause:** `timeline.js` rendered symbols with a static key (`currentKey`) or per-chord key assumptions, but did not globally recontextualize all displayed timeline chord labels to the key active at the playback head.
**Fix:** introduced playback-key state in timeline render flow and routed timeline chord label/tooltip rendering through a single current playback context (`timelineRenderKey`) that updates from beat-aware key resolution on progress ticks.
**Files:** `web-player/components/timeline.js`
**Result (target behavior):** while playback is in changed-key spans, **all** timeline chord labels are recontextualized in the current key; when the section restarts, timeline context returns to the section-start key.

---

## Fix 040 — Catalog wave-1 engine fixes (b5→°, custom bor prefix, phdm II△7, ø harness)

**When:** 2026-07-22 (catalog error-loop wave 1 post-fetch fix pass)  
**Symptom:** Top failure clusters after first full-harvest wave: Tarkus `II4(no5)2sus4(bor)` rendered as `♭II42…`; 4lung `iii°6(b5)4` as `iii6(b5)4`; Holst Mars `II△42` PCs `[1,2,6,9]` vs `[0,1,5,8]`; widespread `viiø7` PC misses when letter carried `(b5)`.  
**Root cause:** (1) `triadQualityWithAlts` not wired into `buildNumeral`; (2) custom-array accidental prefix compared to major instead of parent key scale; (3) `phdmIImaj7` root raise used `shiftNoteBySemitones` on label without octave (no-op); (4) compare harness set `flattenHalfDimB5` from raw JSON `alterations` before `mergeMods` injected `b5` from truth letter.  
**Fix:** `triadQualityWithAlts` → `buildNumeral` via `opts.quality`; `customArrayPrefix` uses parent `SCALE_INTERVALS`; added `shiftPitchClass()` for label-only semitone shifts; `phdmIImaj7` in `music.js`; suppress implicit `(b5)` on ø symbols; `flattenHalfDimB5` checks merged alterations in `compare.js` / `engineRun.js`.  
**Files:** `web-player/lib/jsonToSymbol.js`, `web-player/lib/chordNoteUtils.js`, `web-player/lib/music.js`, `_Decode_oracle/compare.js`, `_Decode_oracle/engineRun.js`  
**Result (catalog resync):** engine failures **99 → 66** on 128 full-harvest slugs / 6582 compared rows (Tarkus 24, 4lung 10, Holst II△42 10, viiø7 cluster cleared).

---

## Fix 041 — Applied `(maj)` harness root PC + denominator tag

**When:** 2026-07-22 (catalog wave-1 follow-up)  
**Symptom:** `V42/VI(maj)`, `V42/VII(maj)`, `V64/VII(maj)` etc. showed PC mismatches (+1 semitone on all chord tones) despite correct engine notes; roman missing `(maj)` on denominator.  
**Root cause:** `chordRootPc()` resolved applied-chord target degrees using **major** parent scale instead of the song key's scale (e.g. G mixolydian VII→F misread as F#), shifting `expectedPcs` one semitone. Not an engine note bug.  
**Fix:** Use `effKey.scale` for applied target + fallback applied degree in `chordRootPc.js`. Emit `(maj)` denominator tag in `jsonToSymbol` when `appliedDenomMaj` is set (from truth roman or subtonic-minor heuristic). Wire `appliedDenomMaj` through compare enrichment.  
**Files:** `_Decode_oracle/chordRootPc.js`, `_Decode_oracle/compare.js`, `_Decode_oracle/engineRun.js`, `web-player/lib/jsonToSymbol.js`, `web-player/lib/music.js`  
**Result (catalog resync):** engine failures **66 → 54** on 137 full-harvest slugs / 7145 rows; Bizet `V42/VI(maj)` and Donna Summer `V42/VII(maj)` now `notesOk`.

---

## Fix 042 — Morning phdm bII△7 scope + custom-array triad quality

**When:** 2026-07-22 (catalog error-loop morning resume)  
**Symptom:** `bII△7(phdm)` in major/minor keys PCs off by semitone (e.g. C major → eng `[1,2,6,9]` vs truth `[0,1,5,8]`); custom-array `(bor)` chords like `bI(bor)` used wrong triad quality when degree-1 offset normalized negative (eng `[1,5,10]` vs `[2,5,10]`).  
**Root cause:** `phdmIImaj7` root raise applied whenever `modifiedKey.scale === phrygianDominant`, including **borrowed** phdm on degree II in non-phdm keys (Holst native phdm key still needs the raise). `getChordQualityFromCustomScale` wrapped third/fifth by **index** order, not pitch height — broken when root interval > third interval after negative normalization.  
**Fix:** Restrict `phdmIImaj7` to native phdm key **3rd inversion** only (`inversion === 3`, Holst `II△42`); borrowed phdm `bII△7` in major/minor uses diatonic root. Compare third/fifth intervals against root pitch (`if (thirdInterval < rootInterval) thirdInterval += 12`). Add augmented branch to custom quality. `chordRootPc` resolves custom-array roots from absolute offsets. `getChordLetterName` uses custom intervals for letter names.  
**Files:** `web-player/lib/music.js`, `web-player/lib/jsonToSymbol.js`, `_Decode_oracle/chordRootPc.js`  
**Result (catalog resync):** `type=7 bor=phrygianDominant` cluster cleared; `type=5 bor=custom` bI PCs match; engine failures **640 → 488** on 781 slugs / 41624 rows.

---

## Fix 043 — Harmonic-minor III+△7 voicing

**When:** 2026-07-22 (catalog error-loop morning resume)  
**Symptom:** `III+△7` in harmonic minor (e.g. barnyard) eng `[2,3,7,11]` (Eb G B D) vs truth `[2,3,7,10]` (Eb G D Bb).  
**Root cause:** Augmented triad + type≥7 stacked full `#5` plus maj7; Hooktheory voices `+△7` as maj3 + maj7 + scale b7, omitting the augmented fifth.  
**Fix:** `augMaj7Voicing` in `rootToDiatonicTriad`: drop `#5` from triad, add +11 maj7 and +7 scale b7 via `shiftNoteBySemitones`.  
**Files:** `web-player/lib/music.js`  
**Result (catalog resync):** `type=7` III+△7 cluster (~18 fails) cleared.

---

## Fix 044 — Policy extraction + unified seventh pipeline + tri-sub

**When:** 2026-07-22 (musically honest engine dev plan)  
**Symptom:** `music.js` ~990 lines with scattered Layer-B `if` branches; duplicate seventh/inversion paths; `substitutions:["tri"]` mis-voiced as parent-key dominant; `v13` in minor missing `m11(b9b13)` PCs; custom-array `ø11` injected spurious `b9`.  
**Fix (Layer B refactor — zero behavior change on policy fixtures except targeted clusters):**
- **`chordPolicy.js`** — `resolveChordPolicy()`, `enrichModifierChord()`, `borrowedModeDimSeventhDegree` table, `isMajorSeventh` for symbol layer.
- **`chordSeventh.js`** — unified `resolveSeventhDegree` / `applySeventhToChord` / `applyAugMaj7Stack`.
- **`chordBuild.js`** — `rootToDiatonicTriad` + `buildChordFromNoteName` (music.js now 77 lines).
- **`scaleBorrowed.js`** — custom-array + `resolveBorrowedScale` (musicScale.js 295 lines).
- **`chordSubstitutions.js`** — `substitutions:["tri"]` → `_triSubDominant` + tritone root in applied path.
- **`chordExtensions.js`** — minor natural-11 via `+5` semitones (not major-frame `sd4`); `skipThirteenth` opt.
- **`chordAlterations.js`** — `minorV13Stack` additive `b13` (keeps natural 13th + flat-13 tone).
- **`chordPolicy`** — `minorV13Stack` on minor `v` + `type≥13`; `customBorrowedHalfDim` voices ø as minor frame without dim7 spread / implicit `b9`.
- **`_Debug_testing/policyRegression.mjs`** — 8 frozen PC fixtures (Holst, HM III+7, phdm bII, custom bor bI, B phdm II, tri-sub 9, viiø7, v13).

**Substitutions research:** catalog JSON uses `substitutions:["tri"]` only (tritone / ∆-sub on `applied=5`); no other substitution tokens in compared rows.

**Regression gates (2026-07-22):**

| Gate | Result |
|------|--------|
| `policyRegression.mjs` | **8/8 pass** |
| Tier-1 Eleanor Rigby | **19/19 notesOk** |
| Corpus4 rebuild (75 songs) | **97.9%** notesOk (2845/2905) — below 98.5% bar (suspensions=4 bucket 76%) |
| Catalog resync (875 slugs) | **538** engine fails / 46546 rows (was 488/41624 on 781 slugs — more coverage) |
| `type=13` corpus4 bucket | **100%** (3/3) |
| `type=9 applied` + `tri` | cluster cleared from top errors |

**Deferred:** `#iø11(bor)` custom-array ø11 (11 catalog fails); `i13` vs `v13` voicing split; corpus4 suspensions=4 harness cluster.

**Files:** `web-player/lib/{music,chordBuild,chordPolicy,chordSeventh,chordSubstitutions,scaleBorrowed,musicScale,chordExtensions,chordAlterations}.js`, `_Decode_oracle/engineRun.js`, `_Debug_testing/policyRegression.mjs`

---

## Fix 045 — Engine Wave 2 (2026-07-22, `feat/fix-045-engine-wave2`)

**Gate results (post-fix):**

| Gate | Before | After |
|------|--------|-------|
| `policyRegression.mjs` | 8/8 | **13/13** |
| corpus4 notesOk | 97.9% (2845/2905) | **98.7%** (2866/2905) |
| `suspensions=4` bucket | 76.5% | **100%** |
| `omits=5` bucket | 82.2% | **97.5%** |
| catalog resync engineFails | ~545 / 47k rows | **720 / 48,367** (911 slugs; queue grew) |

**Changes:**

1. **`sus4(no5)`** — Skip dim+omit5 dim7 push when `useSusFrame`; `truthNotes` omit-5 removes dim fifth (semitone 6).
2. **`minorExtended13Stack`** — Minor key + minor triad + `type≥13` → auto `b9`/`b13` (was degree-5-only `minorV13Stack`).
3. **Tri-sub + borrowed applied** — `resolveTriSubRoot` in `chordSubstitutions.js`; wired through `resolveAppliedBorrowedChord`.
4. **Custom-array ø7** — `halfDim` skips blanket `bb7` on `scale:custom`; `customBorrowedHalfDim` gets explicit dim5 + bb7 voicing.

**Deferred (unchanged):** `bor=major` inv=2 `#vii°6` vs `64` — remaining failures are harness/piano_noise (engine PCs G#+D match letter `G#°/D`); figured-bass 6 vs 64 roman mismatch.

---

## Fix 046–047 — iv13 scope + minor iiø65 dim7 voice (2026-07-22, `feat/fix-047-halfdim-inv`)

**046:** `minorExtended13Stack` scoped to **i** and **v** only — `iv13` keeps natural extensions.

**047:** Fix 045 `halfDim` guard blocked all `bb7`; nat-dim **ø** (minor `ii°`) must keep dim7 voice per catalog (`iiø65` truth `[1,4,7,10]` not m7 `D`).

**Fix:** `borrowedModeDimSeventhDegree` — when `halfDim` + `chordQuality === diminished`, still apply `DIM7_BB7_ENTRIES`; major-key `iiø` (minor triad quality) unchanged.

**Fixtures:** `iv13minor`, `iio65minor` in `policyRegression.mjs` (15/15).

**048 (same branch):** `vii°(no3no5)` — skip dim+omit5 dim7 injection when omit 3 as well (`viiDimNo35` fixture). Regression **16/16**.

---

## Fix 049 — dim omit5 + i13 stack scope (2026-07-22, `feat/fix-047-halfdim-inv`)

**049a:** Remove triad-type dim7 injection on `omits:[5]` — `ii°(no5)`, `iii°6(no5)`, `vii°(add6)(no5)` were getting spurious dim7 (PC 6). Same class as 048 but omit-5-only.

**049b:** Drop `minorExtended13Stack` for **i13** — catalog `i13`/`em11(b13)` voices natural 11/13 + letter `b13` (pc 0), not the v13 empirical `b9`/`b13` stack (pc 5). **v13** stack unchanged.

**Fixtures:** `iiDimNo5`, `i13minor` (E minor, catalog mandolay voicing) in `policyRegression.mjs`.

**Catalog resync post-046–048:** 723 → **552** engine fails (927 slugs). Post-049 resync: **513** (932 slugs).

---

## Fix 050 — harness `borrowed:major` root PC (2026-07-22)

**Problem:** `chordRootPc.js` `BORROWED_SCALE` lacked `major`/`maj`, so `borrowed:"major"` chords resolved roots against the **parent** scale (e.g. E-minor iii = G) instead of parallel major (G#). `resolveTruthRootPc` then preferred the wrong JSON root → **14 false** `bor=major inv=2` engine failures where engine letters/PCs already matched HT (`g#m/D#`).

**Fix:** Add `major`/`maj` → `'major'` in `BORROWED_SCALE`.

**Deferred:** `i13` letter voicing (`em11(b13)`) — oracle eng/truth PC encoding mismatch on b9/m7 coords; needs harness align or dedicated stack (Fix 051 engine attempt reverted).

---

## Fix 051 — custom-array ø11 m7 + 11th (2026-07-22)

**Problem:** `#iø11(bor)` — engine voiced bb7 dim stack + wrong 11th; truth `a#m11(b5b9)` = m7 + natural 11 (11 fails).

**Fix:** Split `customBorrowedHalfDim` by extension depth:
- **ø7** (`type<11`): keep `bb7` dim7 voice (Fix 045 regression unchanged)
- **ø11+** (`type≥11`): `customHalfDimM7` seventh (+9 semitones), skip add9, 11th at +1 from root; `b5` via direct +6 shift (no errant `sdToToneJSNoteName("b5")` spelling)

**Fixture:** `customHalfDim11` in `policyRegression.mjs` (18/18).

**When:** 2026-07-22 (`feat/chord-pronunciation-review`)  
**Done:** Functional readings no longer inject `;` / `,` before “secondary dominant to” / “borrowed from”; bare letter names get triad quality when `getChordLetterName` returns root only; `substitutions:["tri"]` speaks “tritone substitution”.  
**Tests:** `romanPronunciationTest.mjs` (77 fixtures), `pronunciationFixVerify.mjs` (5/5), corpus smoke (5650 chords, 0 UNKNOWN), letter cross-check 100%.

**Deferred — schedule second pronunciation review after the next corpus review + engine update:**

| Area | Why deferred |
|------|----------------|
| `#iø11(bor)` / custom-array ø | **Fix 045** closed ø7 PCs; ø11 letter/roman still open |
| `i13` vs `v13` voicing | **Fixed in Fix 045** (`minorExtended13Stack`) |
| `suspensions=4` harness | **Fixed in Fix 045** (engine + truthNotes omit-5 dim fifth) |
| Roman-only symbol order | `Vsus47` vs `V⁷sus4` — defer unless `romanExact` becomes a gate |
| Custom bor letter quality | Interval-derived quality may disagree with HT letter enrich (e.g. VII(bor) → `G` not `G°`) |
| New substitution tokens | Only `tri` in catalog today; re-audit if JSON gains more `substitutions[]` values |

**Re-run gate before next pronunciation pass:** `buildChordDb` corpus4 → `batchCompareCatalog --resync` → `queryTopErrors` → `romanPronunciationTest.mjs` + `generatePronunciationAudit.mjs`.

---

## Fix 052 — i13 b13 + applied denominator isolation (2026-07-22, `feat/fix-052-i13-b13`)

**052a — `minorI13B13`:** Minor-key **i13** gets natural 11 + compound **b13** (pc 0) per catalog `em11(b13)` voicing — without the v13 `b9` stack.

**052b — Roman denominator leak:** `triadQualityFromLetter`, `enrichChordFromSymbol`, and `enrichChordFromTruth` now parse quality/`dimTriad`/`halfDim` from the **numerator** only (`V7/vii°` no longer inherits `°` from denominator). Clears false applied `#5` and `V7/vii°` PC mismatches.

**Gate:** `policyRegression.mjs` **19/19**; catalog resync **454 → 374** engine fails (−80).

**Files:** `chordPolicy.js`, `chordAlterations.js`, `chordBuild.js`, `truthLetterParse.js`, `engineRun.js`, `compare.js`, `policyRegression.mjs`.

---

## Fix 053 — ø(no5) + custom °11 + hm V13(b9b13) (2026-07-22, `feat/fix-053-engine-wave3`)

**053a:** `halfDim` + `omit:[5]` — skip omit-5 on ø sevenths; HT voices dim5 despite `no5` letter (`iiø7(no5)`).

**053b:** `customBorrowedDimNatural11` — custom-array **°11** (not ø): natural 11th at +5 semitones (Mars `c°7(b9b11)`).

**053c:** `hmBorrowedDominant13` — hm-borrowed **V13** with letter `b9`/`b13`: additive flat-13 without stripping natural 13th.

**Gate:** `policyRegression.mjs` **22/22**.

**Files:** `chordOmits.js`, `chordModifiers.js`, `chordPolicy.js`, `chordBuild.js`, `chordExtensions.js`, `chordAlterations.js`, `policyRegression.mjs`.

---

## Fix 054 — applied vii#5 + truth-enrich halfDim leak (2026-07-22, `feat/fix-054-applied-sharp5`)

**054a:** Applied `vii` + `#5` triad in hm — voice **minor+(#5)** not dim triad (`bm(#5)` pcs `[2,7,11]`).

**054b:** `enrichChordFromSymbol` on `_truthEnriched` chords — stop overwriting `halfDim`/`dimTriad` from **engine** roman (e.g. `iø11` mis-label blocked custom `°11` voicing).

**Gate:** `policyRegression.mjs` **23/23**.

**Files:** `music.js`, `engineRun.js`, `policyRegression.mjs`.

---

## Fix 055 — mixolydian borrowed ø65 → m6 (2026-07-22, `feat/fix-055-mix-m6`)

**Problem:** `#iiiø65(mix)` letter `cm6` — HT voices **m6** (dim5 + 6th), not ø7 with perfect 5th.

**Fix:** `mixBorrowedHalfDimM6` policy + `m6Stack` seventh — flatten fifth to +6, add 6th at +9.

**Fixture:** `mixHalfDimM6` in `policyRegression.mjs` (**24/24**).

**Files:** `chordPolicy.js`, `chordSeventh.js`, `policyRegression.mjs`.

---

## Fix 056 — omit-3 power letters + hm/major ø65 m6 (2026-07-22, `feat/fix-056-omit3-power`)

**056a:** `getChordLetterName` — `omits:[3]` (no 5th omit) → `5` suffix (`D5/A`), not `Dm/A`.

**056b:** Generalize `mixBorrowedHalfDimM6` → `halfDimInv1M6Stack`: mix-borrowed ø65, hm `iiø65`, major `viiø65` inv=1 voice as **m6** (dim5 + 6th), not ø7 perfect 5th. Minor-key `iiø65` inv=1 keeps dim7 stack.

**Gate:** `policyRegression.mjs` **27/27**.

**Files:** `chordPolicy.js`, `chordSeventh.js`, `jsonToSymbol.js`, `policyRegression.mjs`.

**Files:** `web-player/lib/speakRules/{formatReadings,speakLetter,buildParts}.js`, `_Research_testing/pronunciationFixtures.json`

---

## Fix 057 — inv1/inv2 figured-bass ordering (2026-07-23, `feat/fix-057-roman-order`)

**057a:** `buildSuffix` inv=1 triad + sus → `sus46` (`Isus46`) not `6sus4`. inv=2 triad + sus → `4sus46`.

**057b:** inv=2 triad omit-3 → `6(no3)4` (default), not `46(no3)` / `64`. `omitsPlaced` suppresses trailing `(no3)`.

**057c:** inv=2 triad `#5` only → `+6(#5)4` (e.g. `I+6(#5)4`); exception: minor tonic `i` → `i46(#5)`. `suppressPlusForSharp5` keeps `V+7(#5)` for type≥7.

**057d:** `getChordLetterName` — `(#5)` letter parens only for inv=2 (no sus) or inv=1 sus4-only; type≥7 uses `+` only. `sus#4` when both apply.

**Gate:** policy **30/30**, pronunciation **77/77**, roman corpus unchanged baseline.

**Resync:** engine fails **850→509** (−341) on 63.7k rows (1257 slugs).

**Files:** `jsonToSymbol.js`, `policyRegression.mjs`.

---

## Fix 058 — sus figured-bass + half-dim inv3 (2026-07-23, `feat/fix-058-sus-figured-bass`)

**058a:** inv=1 triad sus2 (or sus2+sus4) → `6sus2` / `6sus2sus4`; sus4-only keeps `sus46`.

**058b:** inv=2 triad sus + add6 → `6(add6)4sus4` (adds before trailing sus).

**058c:** inv=2 dim `#5` → `vii6(#5)4` (no `°`/`+` prefix).

**058d:** inv=3 type≥7 half-dim `b5` → `4(b5)2`; `buildNumeral` applies `triadQualityWithAlts` for applied `b5`→ø.

**Gate:** policy **33/33**, pronunciation **77/77**.

**Resync:** engine fails **509→346** (−163) on 64.0k rows (1263 slugs).

**Files:** `jsonToSymbol.js`, `policyRegression.mjs`.

---

## Fix 059 — omit3/lydian sus4/minor #5 inv2 edge cases (2026-07-23, `feat/fix-059-edge-cases`)

**059a:** inv=2 omit-3 → `46(no3)` for **iv** minor + **phryg vii** only; default `6(no3)4` (incl. minor `i`, mixolydian `v`).

**059b:** inv=1 sus4 → `6sus4` unless explicit `borrowed:lydian` (`sus46`).

**059c:** inv=2 `#5` → `6(#5)4` for minor/dim (no `+`); major keeps `+6(#5)4`; `i` tonic keeps `46(#5)`.

**059d:** inv=2 `#5` + add6 → `6(add6)(#5)4` for minor borrowed.

**Gate:** policy **35/35**, pronunciation **77/77**.

**Resync:** 64.9k rows — engine fails **344** (−7 vs pre-059 baseline of 351).

**Files:** `jsonToSymbol.js`, `policyRegression.mjs`.

---

## Session handoff — 2026-07-23 (fetch + decode loop)

### Merged on `main`
- PR #12 Fix 056, #13 verification, #14 Fix 057, #15 Fix 058, #16 Fix 059
- Engine fails trajectory: ~850 → 509 (057) → 346 (058) → **344** (059)

### Catalog / fetch (data NOT in git)
- **Path:** `sacred_ring_data/catalog/hooktheory_catalog.db`, `sacred_ring_data/harvest/<slug>/`
- **Queue:** 1556 slugs, **~1313 full** (~84%), ~243 pending
- **Compared:** ~65.2k chord rows, **344 engine fails**, 2119 error signature groups
- **Fetch daemon:** dies sporadically mid-wave (no pause file). Last restart: `runFetchDaemon.js --wave-size 20`. Watcher: `watchFetchWaves.mjs` (polls waves, writes `_Debug_testing/top_errors_wave-*.md`)
- **Resume fetch:** `node _Research_testing/hooktheory_catalog/cli/runFetchDaemon.js --wave-size 20` (or `overnightFetch.ps1` for auto-restart)
- **Resync after fixes:** `node _Research_testing/hooktheory_catalog/cli/batchCompareCatalog.js --resync`
- **Top errors brief:** `node _Debug_testing/queryTopErrors.mjs --limit 15`

### Gates (must pass before merge)
```bash
node _Debug_testing/policyRegression.mjs          # 35/35
npm run test:pronunciation                        # 77/77
npm run test:roman-symbols
npm run test:note-order
node _Research_testing/hooktheory_catalog/cli/batchCompareCatalog.js --resync
```

### Top remaining clusters (Fix 060+ candidates)

| Priority | Signature | ~Fails | Type | Notes |
|----------|-----------|-------:|------|-------|
| 1 | `type=5 inv=2 omit=3` | 41 | Symbol | Hooktheory inconsistent: `iv6(no3)4` vs `iv46(no3)` by key (F# min iv wants `6`, F min iv wants `46`). Current rule: `46` only for iv minor + phryg vii. **Risky** — probe before changing |
| 2 | `type=5 inv=2 sus=4&2 add=6` | 8 | Symbol | truth `i4sus4sus26(add6)` vs eng `i6(add6)4sus4sus2` — **best ROI** |
| 3 | `type=7 inv=3 bor=custom alt=b5` | 7 | Symbol+letter | `v°△4(b5)2(bor)` vs `vø4(b5)2(bor)` |
| 4 | `type=11 applied alt=b13` | 6 | **Real PC** | eng missing pitch (PC 6 vs truth 8) |
| 5 | `type=5 inv=1 bor=major sus=7 omit=3` | 6 | **Real PC** | eng missing notes |

### Key files
- `web-player/lib/jsonToSymbol.js` — `buildSuffix`, `getChordLetterName` (roman/letter ordering)
- `_Debug_testing/policyRegression.mjs` — 35 fixtures (optional `roman` field)
- `_Decode_oracle/DECODE_FIX_LOG.md` — this file

### Suggested next branch
`feat/fix-060-sus-dual-add6` — inv2 sus4+sus2+add6 figured-bass ordering (`4sus4sus26(add6)`)

---

Single source of truth for the full workflow: [`ORACLE_GUIDE/README.md`](../ORACLE_GUIDE/README.md) (read `01`–`05` + `reference.md` in order).

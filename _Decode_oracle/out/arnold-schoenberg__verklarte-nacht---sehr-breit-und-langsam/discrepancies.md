# Discrepancies (5)

## Intro beat 23
- truth: `Vsus47/iii` (C#7sus4) | engine: `V⁷sus4/iii` (C#7sus4)
- engine notes: ["C#3","F#3","G#3","B3"] | truth PCs: [1,6,8,11] | engine PCs: [1,6,8,11]
- json: root=3 applied=5 type=7 inv=0 sus=[4]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 11
- truth: `i°△4(b5)3(hmin)` (dmmaj7(b5)/A) | engine: `i△⁴³(b5)(hmin)` (Dmmaj7/A)
- engine notes: ["Ab3","Cb4","Ab3","D4","F4"] | truth PCs: [2,5,8,11] | engine PCs: [2,5,8,11]
- json: root=1 applied=0 type=7 inv=2 borrowed="harmonicMinor" alt=["b5"]
- failing: romanExact, romanCore, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 19
- truth: `vii°/iii` (gx°) | engine: `vii°/iii` (G##°)
- engine notes: null | truth PCs: [0,3,9] | engine PCs: []
- piano scrape: ["A#4","D#4"] | piano PCs: [3,10]
- json: root=3 applied=7 type=5 inv=0
- failing: bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- engine error: Cannot read properties of undefined (reading '0')

## Chorus beat 22
- truth: `vii°6/vi` (cx°/E#) | engine: `vii°⁶/vi` (C##°/E#)
- engine notes: null | truth PCs: [2,5,8] | engine PCs: []
- piano scrape: ["A#4","B4","F#4"] | piano PCs: [6,10,11]
- json: root=6 applied=7 type=5 inv=1
- failing: rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- engine error: Cannot read properties of undefined (reading '0')

## Bridge beat 121
- truth: `vii°6/vii°` (dx°/Fx) | engine: `vii°⁶/vii°` (D##°/F##)
- engine notes: null | truth PCs: [4,7,10] | engine PCs: []
- json: root=7 applied=7 type=5 inv=1
- failing: rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- engine error: Cannot read properties of undefined (reading '0')


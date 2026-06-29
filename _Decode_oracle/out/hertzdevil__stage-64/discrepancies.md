# Discrepancies (14)

## Instrumental beat 17
- truth: `iii64(bor)` (f#m/C#) | engine: `♭iii⁶₄(bor)` (F#/C#)
- engine notes: ["C#4","F#4","A4"] | truth PCs: [1,6,9] | engine PCs: [1,6,9]
- json: root=3 applied=0 type=5 inv=2 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 18.5
- truth: `vii(bor)` (c#m) | engine: `♭vii(bor)` (C#)
- engine notes: ["C#3","E3","G#3"] | truth PCs: [1,4,8] | engine PCs: [1,4,8]
- json: root=7 applied=0 type=5 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 21
- truth: `bii64(bor)` (em/B) | engine: `♭ii⁶₄(bor)` (E#°/B)
- engine notes: ["B3","E4","G4"] | truth PCs: [0,5,8] | engine PCs: [4,7,11]
- piano scrape: ["A#3","F#4"] | piano PCs: [6,10]
- json: root=2 applied=0 type=5 inv=2 borrowed=[-1,1,3,4,6,8,10]
- failing: rootPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 22.5
- truth: `vi(bor)` (bm) | engine: `♭vi(bor)` (B)
- engine notes: ["B3","D4","F#4"] | truth PCs: [2,6,11] | engine PCs: [2,6,11]
- json: root=6 applied=0 type=5 inv=0 borrowed=[-1,1,3,4,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 25
- truth: `vii°7/v(maj)` (gx°7) | engine: `vii°⁷/v` (G##°7)
- engine notes: null | truth PCs: [0,3,6,9] | engine PCs: []
- json: root=5 applied=7 type=7 inv=0
- failing: romanExact, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- engine error: Cannot read properties of undefined (reading '0')

## Instrumental beat 34.5
- truth: `#vii°7(hmin)` (cx°7) | engine: `♭viiø⁷(hmin)` (D°7)
- engine notes: ["D3","Cb4","F4","Ab4"] | truth PCs: [2,5,8,11] | engine PCs: [2,5,8,11]
- json: root=7 applied=0 type=7 inv=0 borrowed="harmonicMinor"
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 50.5
- truth: `V4sus46/iv(maj)` (D#sus4/A#) | engine: `V⁶₄sus4/iv` (D#sus4/A#)
- engine notes: ["A#2","D#3","G#3"] | truth PCs: [3,8,10] | engine PCs: [3,8,10]
- json: root=4 applied=5 type=5 inv=2 sus=[4]
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 54.5
- truth: `vii7(bor)` (c#m7) | engine: `♭vii⁷(bor)` (C#7)
- engine notes: ["C#3","E3","G#3","B3"] | truth PCs: [1,4,8,11] | engine PCs: [1,4,8,11]
- json: root=7 applied=0 type=7 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 57
- truth: `V/bI(maj)(bor)` (A) | engine: `V/i` (A#)
- engine notes: ["A3","C#4","E4"] | truth PCs: [1,4,9] | engine PCs: [1,4,9]
- piano scrape: ["B4","E5"] | piano PCs: [4,11]
- json: root=1 applied=5 type=5 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 58.5
- truth: `bI(bor)` (D) | engine: `♭I(bor)` (D#m)
- engine notes: ["D3","F3","A3"] | truth PCs: [2,6,9] | engine PCs: [2,5,9]
- json: root=1 applied=0 type=5 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 62.5
- truth: `bvii42(bor)` (cm/Bb) | engine: `♭♭vii⁴²(bor)` (C#7/B)
- engine notes: ["Bb3","C4","Eb4","G4"] | truth PCs: [1,4,8,11] | engine PCs: [0,3,7,10]
- json: root=7 applied=0 type=7 inv=3 borrowed=[-1,0,2,4,5,7,9]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 89
- truth: `undefined42` (B/Ab) | engine: `` ()
- engine notes: null | truth PCs: [3,6,9,11] | engine PCs: []
- json: root=0 applied=0 type=7 inv=3
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- engine error: Cannot read properties of undefined (reading '0')

## Instrumental beat 113
- truth: `undefined7` (B7) | engine: `` ()
- engine notes: null | truth PCs: [3,6,9,11] | engine PCs: []
- json: root=0 applied=0 type=7 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- engine error: Cannot read properties of undefined (reading '0')

## Instrumental beat 123
- truth: `V64/VI(maj)` (Db/Ab) | engine: `V⁶₄/VI` (Db/Ab)
- engine notes: ["Ab2","Db3","F3"] | truth PCs: [2,6,9] | engine PCs: [1,5,8]
- json: root=6 applied=5 type=5 inv=2
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano


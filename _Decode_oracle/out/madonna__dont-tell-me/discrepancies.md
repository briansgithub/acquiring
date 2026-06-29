# Discrepancies (15)

## Chorus beat 5
- truth: `v` (am) | engine: `VII` (C)
- engine notes: ["C3","E3","G3"] | truth PCs: [0,4,9] | engine PCs: [0,4,7]
- json: root=7 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 7
- truth: `VII` (C) | engine: `IV` (G)
- engine notes: ["G3","B3","D4"] | truth PCs: [0,4,7] | engine PCs: [2,7,11]
- piano scrape: ["D3","D#3"] | piano PCs: [2,3]
- json: root=4 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 9
- truth: `IV` (G) | engine: `I` (D)
- engine notes: ["D3","F#3","A3"] | truth PCs: [2,7,11] | engine PCs: [2,6,9]
- piano scrape: ["F#3","G3"] | piano PCs: [6,7]
- json: root=1 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 11
- truth: `I` (D) | engine: `v⁷sus4` (Am7sus4)
- engine notes: ["A3","D4","E4","G4"] | truth PCs: [0,2,7,9] | engine PCs: [2,4,7,9]
- piano scrape: ["E3","E#3"] | piano PCs: [4,5]
- json: root=5 applied=0 type=7 inv=0 sus=[4]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 13
- truth: `v7sus4` (a7sus4) | engine: `VIIsus4` (Csus4)
- engine notes: ["C3","F3","G3"] | truth PCs: [2,4,9] | engine PCs: [0,5,7]
- json: root=7 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 15
- truth: `v` (am) | engine: `IV` (G)
- engine notes: ["G3","B3","D4"] | truth PCs: [0,4,9] | engine PCs: [2,7,11]
- piano scrape: ["A3","B#4"] | piano PCs: [0,9]
- json: root=4 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 17
- truth: `VII` (C) | engine: `I` (D)
- engine notes: ["D3","F#3","A3"] | truth PCs: [0,4,7] | engine PCs: [2,6,9]
- piano scrape: ["B2","C3","D#3"] | piano PCs: [0,3,11]
- json: root=1 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 19
- truth: `IV` (G) | engine: `v⁷sus4` (Am7sus4)
- engine notes: ["A3","D4","E4","G4"] | truth PCs: [0,2,5,7] | engine PCs: [2,4,7,9]
- json: root=5 applied=0 type=7 inv=0 sus=[4]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 21
- truth: `I` (D) | engine: `VII` (C)
- engine notes: ["C3","E3","G3"] | truth PCs: [2,6,9] | engine PCs: [0,4,7]
- json: root=7 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 23
- truth: `v7sus4` (a7sus4) | engine: `IVsus4` (Gsus4)
- engine notes: ["G3","C4","D4"] | truth PCs: [2,4,9] | engine PCs: [0,2,7]
- json: root=4 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 27
- truth: `v` (am) | engine: `v⁷sus4` (Am7sus4)
- engine notes: ["A3","D4","E4","G4"] | truth PCs: [2,4,7,9] | engine PCs: [2,4,7,9]
- piano scrape: ["B3","B#4"] | piano PCs: [0,11]
- json: root=5 applied=0 type=7 inv=0 sus=[4]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 28.75
- truth: `VII` (C) | engine: `v` (Am)
- engine notes: ["A3","C4","E4"] | truth PCs: [0,4,7] | engine PCs: [0,4,9]
- piano scrape: ["C3","D3","D#3"] | piano PCs: [0,2,3]
- json: root=5 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 29
- truth: `IV` (G) | engine: `VII` (C)
- engine notes: ["C3","E3","G3"] | truth PCs: [2,7,11] | engine PCs: [0,4,7]
- piano scrape: ["C3","D3"] | piano PCs: [0,2]
- json: root=7 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 31
- truth: `I` (D) | engine: `IV` (G)
- engine notes: ["G3","B3","D4"] | truth PCs: [2,6,9] | engine PCs: [2,7,11]
- json: root=4 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 33
- truth: `v7sus4` (a7sus4) | engine: `Isus4` (Dsus4)
- engine notes: ["D3","G3","A3"] | truth PCs: [2,4,9] | engine PCs: [2,7,9]
- json: root=1 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano


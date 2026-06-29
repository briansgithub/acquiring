# Discrepancies (7)

## Verse beat 5
- truth: `#ii°64(bor)` (b°/F) | engine: `♯ii°⁶₄(bor)` (Bbm/F)
- engine notes: ["F4","B4","D5"] | truth PCs: [1,4,10] | engine PCs: [2,5,11]
- piano scrape: ["A3","C4","Db4"] | piano PCs: [0,1,9]
- json: root=2 applied=0 type=5 inv=2 borrowed=[1,3,4,6,8,9,11]
- failing: rootPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 13
- truth: `#ii°64(bor)` (b°/F) | engine: `♯ii°⁶₄(bor)` (Bbm/F)
- engine notes: ["F4","B4","D5"] | truth PCs: [1,4,10] | engine PCs: [2,5,11]
- piano scrape: ["A3","C4","Db4"] | piano PCs: [0,1,9]
- json: root=2 applied=0 type=5 inv=2 borrowed=[1,3,4,6,8,9,11]
- failing: rootPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 18
- truth: `viiø42` (g°/F) | engine: `viiø⁴²` (G°7/F)
- engine notes: ["F4","G4","Bb4","Db5"] | truth PCs: [1,4,7,10] | engine PCs: [1,5,7,10]
- json: root=7 applied=0 type=7 inv=3
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 22
- truth: `viiø43` (gm7(b5)/Db) | engine: `viiø⁴³(b5)` (G°7/Db)
- engine notes: ["Db4","F4","Db4","G4","Bb4"] | truth PCs: [1,4,7,10] | engine PCs: [1,5,7,10]
- json: root=7 applied=0 type=7 inv=2
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 21
- truth: `viiø65` (ebm6) | engine: `viiø⁶⁵` (C°7/Eb)
- engine notes: ["Eb3","Gb3","Bb3","C4"] | truth PCs: [0,3,6,9] | engine PCs: [0,3,6,10]
- json: root=7 applied=0 type=7 inv=1
- failing: rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 49
- truth: `bVI(phr)` (Bbb) | engine: `♯VI(phr)` (A)
- engine notes: ["A3","C#4","E4"] | truth PCs: [1,4,9] | engine PCs: [1,4,9]
- json: root=6 applied=0 type=5 inv=0 borrowed="phrygian"
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Outro beat 53
- truth: `bVI(phr)` (Bbb) | engine: `♯VI(phr)` (A)
- engine notes: ["A3","C#4","E4"] | truth PCs: [1,4,9] | engine PCs: [1,4,9]
- piano scrape: ["C4","A4"] | piano PCs: [0,9]
- json: root=6 applied=0 type=5 inv=0 borrowed="phrygian"
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano


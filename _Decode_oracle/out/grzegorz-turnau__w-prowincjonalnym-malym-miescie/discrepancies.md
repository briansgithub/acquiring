# Discrepancies (5)

## Verse beat 18
- truth: `bIIsus2(phr)(#5)` (Cb(#5)sus2) | engine: `♭II+sus2(#5)(phr)` (Cb+sus2)
- engine notes: ["Cb3","Db4","G4"] | truth PCs: [1,7,11] | engine PCs: [1,7,11]
- piano scrape: ["Db4","Eb4","Fb4"] | piano PCs: [1,3,4]
- json: root=2 applied=0 type=5 inv=0 borrowed="phrygian" sus=[2] alt=["#5"]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 20
- truth: `viiø7` (am7(b5)) | engine: `viiø⁷(b5)` (A°7)
- engine notes: ["A3","C4","Eb4","Eb4","G4"] | truth PCs: [0,3,6,9] | engine PCs: [0,3,7,9]
- piano scrape: ["F#3","B3","C#4"] | piano PCs: [1,6,11]
- json: root=7 applied=0 type=7 inv=0
- failing: romanExact, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 33
- truth: `iiiø65(mix)` (fm6) | engine: `iiiø⁶⁵(mix)` (D°7/F)
- engine notes: ["F3","Ab3","C4","D4"] | truth PCs: [2,5,8,11] | engine PCs: [0,2,5,8]
- json: root=3 applied=0 type=7 inv=1 borrowed="mixolydian"
- failing: rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 41
- truth: `iv°6(b5)(min)` (eb°(b5)/Gb) | engine: `iv⁶(b5)(min)` (Ebm/Gb)
- engine notes: ["Gb3","Bbb3","Bbb3","Eb4"] | truth PCs: [3,6,9] | engine PCs: [3,6,9]
- piano scrape: ["B2","C3","G3"] | piano PCs: [0,7,11]
- json: root=4 applied=0 type=5 inv=1 borrowed="minor" alt=["b5"]
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 43
- truth: `v°(b5)(min)` (f°(b5)) | engine: `v(b5)(min)` (Fm)
- engine notes: ["F3","Ab3","Cb4","Cb4"] | truth PCs: [5,8,11] | engine PCs: [5,8,11]
- piano scrape: ["D#3","A3","C4"] | piano PCs: [0,3,9]
- json: root=5 applied=0 type=5 inv=0 borrowed="minor" alt=["b5"]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano


# Discrepancies (5)

## Intro beat 3
- truth: `viiø7` (a#m7(b5)) | engine: `viiø⁷(b5)` (A#°7)
- engine notes: ["A#3","C#4","E4","E4","G#4"] | truth PCs: [1,4,7,10] | engine PCs: [1,4,8,10]
- json: root=7 applied=0 type=7 inv=0
- failing: romanExact, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Intro beat 19
- truth: `viiø7` (a#m7(b5)) | engine: `viiø⁷(b5)` (A#°7)
- engine notes: ["A#3","C#4","E4","E4","G#4"] | truth PCs: [1,4,7,10] | engine PCs: [1,4,8,10]
- json: root=7 applied=0 type=7 inv=0
- failing: romanExact, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 3
- truth: `viiø7` (gm7(b5)) | engine: `viiø⁷(b5)` (G°7)
- engine notes: ["G3","Db4","Db4","F4","Bb4"] | truth PCs: [1,4,7,10] | engine PCs: [1,5,7,10]
- json: root=7 applied=0 type=7 inv=0
- failing: romanExact, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 19
- truth: `viiø7` (gm7(b5)) | engine: `viiø⁷(b5)` (G°7)
- engine notes: ["G3","Db4","Db4","F4","Bb4"] | truth PCs: [1,4,7,10] | engine PCs: [1,5,7,10]
- json: root=7 applied=0 type=7 inv=0
- failing: romanExact, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 29
- truth: `bII+(#5)/V(∆-sub)` (Fb++(#5)) | engine: `V+(#5)/V` (Bb+)
- engine notes: ["Bb3","D4","Gb4"] | truth PCs: [0,4,8] | engine PCs: [2,6,10]
- piano scrape: ["Gb3","Bb3","C4"] | piano PCs: [0,6,10]
- json: root=5 applied=5 type=5 inv=0 alt=["#5"]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano


# Discrepancies (3)

## Chorus beat 7
- truth: `bII9(b5)/V(∆-sub)(maj)` (Cb9(b5)) | engine: `V⁹(b5)/v` (F9)
- engine notes: ["F3","A3","B3","Eb4","G4"] | truth PCs: [1,3,5,9,11] | engine PCs: [3,5,7,9,11]
- json: root=5 applied=5 type=9 inv=0 borrowed="major" alt=["b5"]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 11
- truth: `bII9(b5)/IV(∆-sub)` (Bbb9(b5)) | engine: `V⁹(b5)/IV` (Eb9)
- engine notes: ["Eb3","G3","A3","Db4","F4"] | truth PCs: [1,3,7,9,11] | engine PCs: [1,3,5,7,9]
- json: root=4 applied=5 type=9 inv=0 alt=["b5"]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus Lead-Out beat 5
- truth: `bII9(b5)/V(∆-sub)(maj)` (Cb9(b5)) | engine: `V⁷(b5)(maj)` (Bb7)
- engine notes: ["Bb3","D4","E4","Ab4"] | truth PCs: [3,5,9,11] | engine PCs: [2,4,8,10]
- piano scrape: ["F3","C4","Bb3","A3","D4","Eb3","D3","Bb2"] | piano PCs: [0,2,3,5,9,10]
- json: root=5 applied=0 type=7 inv=0 borrowed="major"
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano


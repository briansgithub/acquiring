# Discrepancies (4)

## Verse beat 8
- truth: `i°(b5)` (e°(b5)) | engine: `i(b5)` (Em)
- engine notes: ["E3","G3","Bb3","Bb3"] | truth PCs: [4,7,10] | engine PCs: [4,7,10]
- json: root=1 applied=0 type=5 inv=0 alt=["b5"]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 8.5
- truth: `iø7(loc)` (em7(b5)) | engine: `iø⁷(b5)(loc)` (E°7)
- engine notes: ["E3","Bb3","D4","G4","Bb4"] | truth PCs: [1,4,7,10] | engine PCs: [2,4,7,10]
- json: root=1 applied=0 type=7 inv=0 borrowed="locrian"
- failing: romanExact, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 24
- truth: `i°(b5)` (e°(b5)) | engine: `i(b5)` (Em)
- engine notes: ["E3","G3","Bb3","Bb3"] | truth PCs: [4,7,10] | engine PCs: [4,7,10]
- json: root=1 applied=0 type=5 inv=0 alt=["b5"]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Verse beat 24.5
- truth: `iø7(loc)` (em7(b5)) | engine: `iø⁷(b5)(loc)` (E°7)
- engine notes: ["E3","Bb3","D4","G4","Bb4"] | truth PCs: [1,4,7,10] | engine PCs: [2,4,7,10]
- json: root=1 applied=0 type=7 inv=0 borrowed="locrian"
- failing: romanExact, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano


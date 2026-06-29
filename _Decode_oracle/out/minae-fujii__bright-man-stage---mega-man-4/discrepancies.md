# Discrepancies (2)

## Chorus beat 9
- truth: `bVI△9(min)` (Bbbmaj9) | engine: `♭VI△⁹(min)` (Bbbmaj9)
- engine notes: null | truth PCs: [1,4,8,9,11] | engine PCs: []
- json: root=6 applied=0 type=9 inv=0 borrowed="minor"
- failing: bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- engine error: Cannot read properties of undefined (reading '0')

## Chorus beat 13
- truth: `bVI(min)` (Bbb) | engine: `♭VI(min)` (Bbb)
- engine notes: null | truth PCs: [1,4,9] | engine PCs: []
- json: root=6 applied=0 type=5 inv=0 borrowed="minor"
- failing: bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- engine error: Cannot read properties of undefined (reading '0')


# Discrepancies (2)

## Instrumental beat 17
- truth: `i(#5)` (cm(#5)) | engine: `i+(#5)` (Cm)
- engine notes: ["C3","Eb3","Ab3"] | truth PCs: [0,3,8] | engine PCs: [0,3,8]
- json: root=1 applied=0 type=5 inv=0 alt=["#5"]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 33
- truth: `i°(b5)` (c°(b5)) | engine: `i(b5)` (Cm)
- engine notes: ["C3","Eb3","Gb3","Gb3"] | truth PCs: [0,3,6] | engine PCs: [0,3,6]
- json: root=1 applied=0 type=5 inv=0 alt=["b5"]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano


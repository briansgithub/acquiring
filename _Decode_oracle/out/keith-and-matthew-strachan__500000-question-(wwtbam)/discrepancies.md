# Discrepancies (2)

## Instrumental beat 17
- truth: `i(#5)` (d#m(#5)) | engine: `i+(#5)` (D#m)
- engine notes: ["D#3","F#3","B3"] | truth PCs: [3,6,11] | engine PCs: [3,6,11]
- json: root=1 applied=0 type=5 inv=0 alt=["#5"]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Instrumental beat 33
- truth: `i°(b5)` (d#°(b5)) | engine: `i(b5)` (D#m)
- engine notes: ["D#3","F#3","A3","A3"] | truth PCs: [3,6,9] | engine PCs: [3,6,9]
- json: root=1 applied=0 type=5 inv=0 alt=["b5"]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano


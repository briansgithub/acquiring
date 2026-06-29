# Discrepancies (2)

## Bridge beat 53
- truth: `#III(bor)` (G#) | engine: `III(bor)` (G)
- engine notes: ["G#3","D#4","B#4"] | truth PCs: [0,3,8] | engine PCs: [0,3,8]
- piano scrape: ["E5","E#5"] | piano PCs: [4,5]
- json: root=3 applied=0 type=5 inv=0 borrowed=[1,2,4,6,8,9,11]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 61
- truth: `#VI(bor)` (C#) | engine: `VI(bor)` (C)
- engine notes: ["C#3","E#3","G#3"] | truth PCs: [1,5,8] | engine PCs: [1,5,8]
- json: root=6 applied=0 type=5 inv=0 borrowed=[1,2,4,6,8,9,11]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano


# Discrepancies (2)

## Intro beat 32
- truth: `v7(min)` (bm7) | engine: `V⁴²/IV` (E7/D)
- engine notes: ["D3","E4","G#4","B4"] | truth PCs: [2,6,9,11] | engine PCs: [2,4,8,11]
- json: root=4 applied=5 type=7 inv=3
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Intro beat 33
- truth: `V42/IV` (E/D) | engine: `IV△⁷` (Amaj7)
- engine notes: ["A3","C#4","E4","G#4"] | truth PCs: [1,4,7,9] | engine PCs: [1,4,8,9]
- piano scrape: ["F#3","G#3","A3"] | piano PCs: [6,8,9]
- json: root=4 applied=0 type=7 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano


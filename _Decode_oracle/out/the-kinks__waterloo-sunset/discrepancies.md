# Discrepancies (14)

## Bridge beat 3
- truth: `V` (F#) | engine: `IV/IV` (A)
- engine notes: ["A3","C#4","E4"] | truth PCs: [1,6,10] | engine PCs: [1,4,9]
- json: root=4 applied=4 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 4.5
- truth: `V42` (F#/E) | engine: `V` (F#)
- engine notes: ["F#3","A#3","C#4"] | truth PCs: [1,6,10] | engine PCs: [1,6,10]
- json: root=5 applied=0 type=5 inv=0
- failing: romanExact, romanCore, bassPcMatch, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 7
- truth: `iii7` (d#m7) | engine: `V⁴²` (F#7/E)
- engine notes: ["E4","F#4","A#4","C#5"] | truth PCs: [1,3,6,10] | engine PCs: [1,4,6,10]
- piano scrape: ["D#3","E3"] | piano PCs: [3,4]
- json: root=5 applied=0 type=7 inv=3
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 9
- truth: `V64` (F#/C#) | engine: `iii⁷` (D#m7)
- engine notes: ["D#3","F#3","A#3","C#4"] | truth PCs: [1,3,7,10] | engine PCs: [1,3,6,10]
- json: root=3 applied=0 type=7 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 11
- truth: `V7/IV` (B7) | engine: `V⁶₄` (F#/C#)
- engine notes: ["C#4","F#4","A#4"] | truth PCs: [3,6,11] | engine PCs: [1,6,10]
- json: root=5 applied=0 type=5 inv=2
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 13
- truth: `V43/IV` (B7/F#) | engine: `V⁷/IV` (B7)
- engine notes: ["B3","D#4","F#4","A4"] | truth PCs: [3,6,9,11] | engine PCs: [3,6,9,11]
- json: root=4 applied=5 type=7 inv=0
- failing: romanExact, romanCore, bassPcMatch, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 15
- truth: `IV` (E) | engine: `V⁴³/IV` (B7/F#)
- engine notes: ["F#3","A4","B4","D#4"] | truth PCs: [2,4,8,11] | engine PCs: [3,6,9,11]
- json: root=4 applied=5 type=7 inv=2
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 17
- truth: `IV/IV` (A) | engine: `IV` (E)
- engine notes: ["E3","G#3","B3"] | truth PCs: [1,4,9] | engine PCs: [4,8,11]
- json: root=4 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 19
- truth: `IV△42/IV` (A/G#) | engine: `IV/IV` (A)
- engine notes: ["A3","C#4","E4"] | truth PCs: [1,4,9] | engine PCs: [1,4,9]
- piano scrape: ["G#3","Gx3"] | piano PCs: [8,9]
- json: root=4 applied=4 type=5 inv=0
- failing: romanExact, romanCore, bassPcMatch, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 19.5
- truth: `V` (F#) | engine: `IV△⁴²/IV` (Amaj7/G#)
- engine notes: ["G#3","A4","C#4","E4"] | truth PCs: [1,4,6,10] | engine PCs: [1,4,8,9]
- json: root=4 applied=4 type=7 inv=3
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 20.5
- truth: `V42` (F#/E) | engine: `V` (F#)
- engine notes: ["F#3","A#3","C#4"] | truth PCs: [1,6,10] | engine PCs: [1,6,10]
- json: root=5 applied=0 type=5 inv=0
- failing: romanExact, romanCore, bassPcMatch, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 23
- truth: `iii7` (d#m7) | engine: `V⁴²` (F#7/E)
- engine notes: ["E4","F#4","A#4","C#5"] | truth PCs: [1,3,6,10] | engine PCs: [1,4,6,10]
- piano scrape: ["D#3","E3"] | piano PCs: [3,4]
- json: root=5 applied=0 type=7 inv=3
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 25
- truth: `V64` (F#/C#) | engine: `iii⁷` (D#m7)
- engine notes: ["D#3","F#3","A#3","C#4"] | truth PCs: [1,3,7,10] | engine PCs: [1,3,6,10]
- json: root=3 applied=0 type=7 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Bridge beat 41
- truth: `iiiø4(add13)2` (d#°(add13)/C#) | engine: `iiiø⁴²(add13)(add13)` (D#°7/C#)
- engine notes: ["C#4","B#5","D#4","F#4","A4"] | truth PCs: [0,3,6,9] | engine PCs: [0,1,3,6,9]
- json: root=3 applied=0 type=7 inv=3
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano


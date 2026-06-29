# Discrepancies (8)

## Chorus beat 1
- truth: `iv9sus4` (g#9sus4) | engine: `i⁶₄sus4` (D#msus4/A#)
- engine notes: ["A#3","D#4","G#4"] | truth PCs: [1,3,8] | engine PCs: [3,8,10]
- json: root=1 applied=0 type=5 inv=2
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 4
- truth: `iv7sus4` (g#7sus4) | engine: `iv⁶⁵sus4` (G#m7sus4/B)
- engine notes: ["C#4","D#4","F#4","G#4"] | truth PCs: [1,3,6,8] | engine PCs: [1,3,6,8]
- json: root=4 applied=0 type=7 inv=1 sus=[4]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 5
- truth: `iv7` (g#m7) | engine: `iv⁹sus4` (G#m9sus4)
- engine notes: ["G#3","C#4","D#4","F#4","A#4"] | truth PCs: [1,3,6,8,10] | engine PCs: [1,3,6,8,10]
- piano scrape: ["G#3","B#4","C#4","D#4"] | piano PCs: [0,1,3,8]
- json: root=4 applied=0 type=9 inv=0 sus=[4]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 9
- truth: `iv9sus4` (g#9sus4) | engine: `iv⁷sus4` (G#m7sus4)
- engine notes: ["G#3","C#4","D#4","F#4"] | truth PCs: [1,3,6,8] | engine PCs: [1,3,6,8]
- piano scrape: ["G#3","B#4","C#4"] | piano PCs: [0,1,8]
- json: root=4 applied=0 type=7 inv=0
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 13
- truth: `iv7sus4` (g#7sus4) | engine: `iv⁹sus4` (G#m9sus4)
- engine notes: ["G#3","C#4","D#4","F#4","A#4"] | truth PCs: [1,3,6,8,10] | engine PCs: [1,3,6,8,10]
- json: root=4 applied=0 type=9 inv=0 sus=[4]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 14.5
- truth: `iv(no3no5)` (g#m(n°3n5)) | engine: `iv⁷(no3)(no5)sus4` (G#m7sus4)
- engine notes: ["G#3","F#4"] | truth PCs: [1,6,8] | engine PCs: [6,8]
- piano scrape: ["B#4","C#4","D#4"] | piano PCs: [0,1,3]
- json: root=4 applied=0 type=7 inv=0 sus=[4]
- failing: romanExact, romanCore, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 17
- truth: `i7sus2` (d#7sus2) | engine: `iv(no3)(no5)sus2` (G#msus2)
- engine notes: ["G#3"] | truth PCs: [3,5] | engine PCs: [8]
- json: root=4 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 19.5
- truth: `iv9sus4` (g#9sus4) | engine: `i⁷sus2sus4` (D#m7sus2sus4)
- engine notes: ["D#3","G#3","A#3","C#4"] | truth PCs: [1,3,6,8] | engine PCs: [1,3,8,10]
- piano scrape: ["C#4","D#4"] | piano PCs: [1,3]
- json: root=1 applied=0 type=7 inv=0 sus=[2]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano


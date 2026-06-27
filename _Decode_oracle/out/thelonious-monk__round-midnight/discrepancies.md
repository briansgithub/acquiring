# Discrepancies (8)

## Verse beat 1
- truth: `i△42(hmin)` (d#m/Cx) | engine: `i△⁴²(hmin)` (D#mmaj7/D)
- engine notes: ["C##4","D#4","F#4","A#4"] | truth PCs: [2,3,6,10] | engine PCs: [2,3,6,10]
- piano scrape: ["A#2","A#3","D#3","E#3"] | piano PCs: [3,5,10]
- json: root=1 applied=0 type=7 inv=3 borrowed="harmonicMinor"
- failing: bassPcMatch, bassInNotes, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/thelonious-monk__round-midnight/screens/Verse_strip0.png)

## Verse beat 9
- truth: `#viø7(dor)` (b#m7(b5)) | engine: `♯viø⁷(dor)` (B#°7)
- engine notes: ["B#3","D#4","F#4","A#4"] | truth PCs: [0,3,6,9] | engine PCs: [0,3,6,10]
- piano scrape: ["A#3","B#4","C#4","D#3","F#3"] | piano PCs: [0,1,3,6,10]
- json: root=6 applied=0 type=7 inv=0 borrowed="dorian"
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/thelonious-monk__round-midnight/screens/Verse_strip0.png)

## Verse beat 13
- truth: `vi7(bor)` (bm7) | engine: `♭vi⁷(bor)` (Bmaj7)
- engine notes: ["B3","D4","F#4","A4"] | truth PCs: [2,6,9,11] | engine PCs: [2,6,9,11]
- piano scrape: ["Cx3","F#3","Gx3"] | piano PCs: [0,6,7]
- json: root=6 applied=0 type=7 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/thelonious-monk__round-midnight/screens/Verse_strip0.png)

## Verse beat 14
- truth: `V7/bV(maj)(bor)` (E7) | engine: `V⁷/v` (E#7)
- engine notes: ["E#3","G##3","B#4","D#4"] | truth PCs: [2,4,8,11] | engine PCs: [0,3,5,9]
- piano scrape: ["C#4","G#3"] | piano PCs: [1,8]
- json: root=5 applied=5 type=7 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/thelonious-monk__round-midnight/screens/Verse_strip0.png)

## Verse beat 24
- truth: `IV7(b5)(dor)` (G#7(b5)) | engine: `IV⁷(b5)(dor)` (G#7)
- engine notes: ["G#3","B#4","D#4","F#4"] | truth PCs: [0,2,6,8] | engine PCs: [0,3,6,8]
- json: root=4 applied=0 type=7 inv=0 borrowed="dorian" alt=["b5"]
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/thelonious-monk__round-midnight/screens/Verse_strip1.png)

## Verse beat 25
- truth: `#viø7(dor)` (b#m7(b5)) | engine: `♯viø⁷(dor)` (B#°7)
- engine notes: ["B#3","D#4","F#4","A#4"] | truth PCs: [0,3,6,9] | engine PCs: [0,3,6,10]
- piano scrape: ["F#3"] | piano PCs: [6]
- json: root=6 applied=0 type=7 inv=0 borrowed="dorian"
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/thelonious-monk__round-midnight/screens/Verse_strip1.png)

## Verse beat 26
- truth: `V7(b5)/bII(maj)(phr)` (B7(b5)) | engine: `V⁷(b5)/ii°` (B#7)
- engine notes: ["B#3","D##4","F##4","A#4"] | truth PCs: [3,5,9,11] | engine PCs: [0,4,7,10]
- piano scrape: ["D#3","E#3"] | piano PCs: [3,5]
- json: root=2 applied=5 type=7 inv=0 borrowed="phrygian" alt=["b5"]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/thelonious-monk__round-midnight/screens/Verse_strip1.png)

## Verse beat 29
- truth: `V7(b5b9)(maj)` (A#7(b5b9)) | engine: `V⁷(b5)(b9)(maj)` (A#7)
- engine notes: ["A#3","C##4","E#4","G#4"] | truth PCs: [2,4,8,10,11] | engine PCs: [2,5,8,10]
- piano scrape: ["A#3","Cx3"] | piano PCs: [0,10]
- json: root=5 applied=0 type=7 inv=0 borrowed="major" alt=["b5","b9"]
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/thelonious-monk__round-midnight/screens/Verse_strip1.png)


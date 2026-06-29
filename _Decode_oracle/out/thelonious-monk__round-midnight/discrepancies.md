# Discrepancies (3)

## Verse beat 13
- truth: `vi7(bor)` (bm7) | engine: `♭vi⁷(bor)` (Bmaj7)
- engine notes: ["B3","D4","F#4","A4"] | truth PCs: [2,6,9,11] | engine PCs: [2,6,9,11]
- piano scrape: ["Cx3","F#3","Gx3"] | piano PCs: [2,6,9]
- json: root=6 applied=0 type=7 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/thelonious-monk__round-midnight/screens/Verse_strip0.png)

## Verse beat 14
- truth: `V7/bV(maj)(bor)` (E7) | engine: `V⁷/v` (E#7)
- engine notes: ["E3","G#3","B3","D4"] | truth PCs: [2,4,8,11] | engine PCs: [2,4,8,11]
- piano scrape: ["C#4","G#3"] | piano PCs: [1,8]
- json: root=5 applied=5 type=7 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/thelonious-monk__round-midnight/screens/Verse_strip0.png)

## Verse beat 26
- truth: `V7(b5)/bII(maj)(phr)` (B7(b5)) | engine: `V⁷(b5)/ii°` (B#7)
- engine notes: ["B3","D#4","F4","A4"] | truth PCs: [3,5,9,11] | engine PCs: [3,5,9,11]
- piano scrape: ["D#3","E#3"] | piano PCs: [3,5]
- json: root=2 applied=5 type=7 inv=0 borrowed="phrygian" alt=["b5"]
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/thelonious-monk__round-midnight/screens/Verse_strip1.png)


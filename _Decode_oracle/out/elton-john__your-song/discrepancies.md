# Discrepancies (5)

## Verse beat 21
- truth: `vi4(add11)2` (cm(add11)/Bb) | engine: `vi⁴²(add11)` (Cm7/Bb)
- engine notes: ["Bb3","C4","Eb4","G4"] | truth PCs: [0,3,5,7,10] | engine PCs: [0,3,7,10]
- piano scrape: ["Eb3"] | piano PCs: [3]
- json: root=6 applied=0 type=7 inv=3
- failing: romanExact, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/elton-john__your-song/screens/Verse_strip0.png)

## Verse beat 61
- truth: `Vsus4` (Bbsus4) | engine: `Vsus4` (Bbsus4)
- engine notes: ["Bb3","D4","F4"] | truth PCs: [3,5,10] | engine PCs: [2,5,10]
- piano scrape: ["Eb3","F3"] | piano PCs: [3,5]
- json: root=5 applied=0 type=5 inv=0 sus=[4]
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/elton-john__your-song/screens/Verse_strip2.png)

## Verse beat 65
- truth: `Vsus2` (Bbsus2) | engine: `Vsus2` (Bbsus2)
- engine notes: ["Bb3","D4","F4"] | truth PCs: [0,5,10] | engine PCs: [2,5,10]
- json: root=5 applied=0 type=5 inv=0 sus=[2]
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/elton-john__your-song/screens/Verse_strip2.png)

## Chorus beat 21
- truth: `#ivø7(lyd)` (am7(b5)) | engine: `♯ivø⁷(lyd)` (A°7)
- engine notes: ["A3","C4","Eb4","G4"] | truth PCs: [0,3,6,9] | engine PCs: [0,3,7,9]
- piano scrape: ["Bb3","C4","Eb4"] | piano PCs: [0,3,10]
- json: root=4 applied=0 type=7 inv=0 borrowed="lydian"
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/elton-john__your-song/screens/Chorus_strip1.png)

## Chorus beat 35
- truth: `Vsus4` (Bbsus4) | engine: `Vsus4` (Bbsus4)
- engine notes: ["Bb3","D4","F4"] | truth PCs: [3,5,10] | engine PCs: [2,5,10]
- json: root=5 applied=0 type=5 inv=0 sus=[4]
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/elton-john__your-song/screens/Chorus_strip1.png)


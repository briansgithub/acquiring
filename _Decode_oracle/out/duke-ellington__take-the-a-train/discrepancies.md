# Discrepancies (3)

## Chorus beat 9
- truth: `V9(#11)/V` (D9(#11)) | engine: `V⁹(#11)/V` (D9)
- engine notes: ["D3","F#3","A3","C4","E4"] | truth PCs: [0,2,4,6,8,9] | engine PCs: [0,2,4,6,9]
- piano scrape: ["Ab2","E3"] | piano PCs: [4,8]
- json: root=5 applied=5 type=9 inv=0 alt=["#11"]
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/duke-ellington__take-the-a-train/screens/Chorus_strip0.png)

## Chorus beat 17
- truth: `V7sus2` (G7sus2) | engine: `V⁷sus2` (G7sus2)
- engine notes: ["G3","B3","D4","F4"] | truth PCs: [2,5,7,9] | engine PCs: [2,5,7,11]
- piano scrape: ["A2"] | piano PCs: [9]
- json: root=5 applied=0 type=7 inv=0 sus=[2]
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/duke-ellington__take-the-a-train/screens/Chorus_strip0.png)

## Chorus beat 29
- truth: `I9(add13)(mix)` (C9(add13)) | engine: `I⁹(add13)(mix)` (C9)
- engine notes: ["C3","E3","G3","Bb3","D4"] | truth PCs: [0,2,4,7,9,10] | engine PCs: [0,2,4,7,10]
- json: root=1 applied=0 type=9 inv=0 borrowed="mixolydian"
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/duke-ellington__take-the-a-train/screens/Chorus_strip1.png)


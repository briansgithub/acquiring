# Discrepancies (3)

## Verse beat 21
- truth: `iiø7` (bm7(b5)) | engine: `iiø⁷` (B°7)
- engine notes: ["B3","D4","F4","A4"] | truth PCs: [2,5,8,11] | engine PCs: [2,5,9,11]
- piano scrape: ["A2","D2","E2","F2"] | piano PCs: [2,4,5,9]
- json: root=2 applied=0 type=7 inv=0
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/frank-sinatra__fly-me-to-the-moon/screens/Verse_strip0.png)

## Verse beat 53
- truth: `V7(add13)sus2sus4` (G7(add13)sus2sus4) | engine: `V⁷(add13)sus2sus4` (G7sus2sus4)
- engine notes: ["G3","B3","D4","F4"] | truth PCs: [0,2,4,5,7] | engine PCs: [2,5,7,11]
- piano scrape: ["C2"] | piano PCs: [0]
- json: root=5 applied=0 type=7 inv=0 sus=[2,4]
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/frank-sinatra__fly-me-to-the-moon/screens/Verse_strip2.png)

## Verse beat 54.5
- truth: `v11(b9)(mix)` (gm11(b9)) | engine: `v¹¹(b9)(mix)` (Gm11)
- engine notes: ["G3","Bb3","D4","F4","A4","C5"] | truth PCs: [0,2,5,7,8,10] | engine PCs: [0,2,5,7,9,10]
- piano scrape: ["C2"] | piano PCs: [0]
- json: root=5 applied=0 type=11 inv=0 borrowed="mixolydian" alt=["b9"]
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/frank-sinatra__fly-me-to-the-moon/screens/Verse_strip2.png)


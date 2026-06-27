# Discrepancies (2)

## Intro beat 8
- truth: `IV(add9)` (Db(add9)) | engine: `IV(add9)` (Db)
- engine notes: ["Db3","F3","Ab3"] | truth PCs: [1,3,5,8] | engine PCs: [1,5,8]
- piano scrape: ["Eb4"] | piano PCs: [3]
- json: root=4 applied=0 type=5 inv=0
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/queen__somebody-to-love/screens/Intro_strip0.png)

## Intro beat 13
- truth: `V7sus4` (Eb7sus4) | engine: `V⁷sus4` (Eb7sus4)
- engine notes: ["Eb3","G3","Bb3","Db4"] | truth PCs: [1,3,8,10] | engine PCs: [1,3,7,10]
- piano scrape: ["Ab3","Bb3","C4","Eb3","F3"] | piano PCs: [0,3,5,8,10]
- json: root=5 applied=0 type=7 inv=0 sus=[4]
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/queen__somebody-to-love/screens/Intro_strip0.png)


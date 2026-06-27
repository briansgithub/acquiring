# Discrepancies (12)

## Intro beat 17
- truth: `vi(no3)` (F#5) | engine: `vi(no3)` (F#m)
- engine notes: ["F#3","A3","C#4"] | truth PCs: [1,6] | engine PCs: [1,6,9]
- piano scrape: ["C#3","F#2","F#3"] | piano PCs: [1,6]
- json: root=6 applied=0 type=5 inv=0
- failing: pcsExact, pianoExact, pianoPcsExact
- strip: ![strip](_Decode_oracle/out/adele__someone-like-you/screens/Intro_strip1.png)

## Verse beat 1
- truth: `I` (A) | engine: `IV` (D)
- engine notes: ["D3","F#3","A3"] | truth PCs: [1,4,9] | engine PCs: [2,6,9]
- piano scrape: ["A2","B2","C#3","E3"] | piano PCs: [1,4,9,11]
- json: root=4 applied=0 type=5 inv=0
- failing: romanExact, romanCore, rootPcMatch, bassPcMatch, bassInNotes, pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/adele__someone-like-you/screens/Verse_strip0.png)

## Verse beat 21
- truth: `vi(no3)` (F#5) | engine: `vi(no3)` (F#m)
- engine notes: ["F#3","A3","C#4"] | truth PCs: [1,6] | engine PCs: [1,6,9]
- piano scrape: ["A2","B2","C#3","E3","F#2"] | piano PCs: [1,4,6,9,11]
- json: root=6 applied=0 type=5 inv=0
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/adele__someone-like-you/screens/Verse_strip0.png)

## Verse beat 53
- truth: `vi(no3)` (F#5) | engine: `vi(no3)` (F#m)
- engine notes: ["F#3","A3","C#4"] | truth PCs: [1,6] | engine PCs: [1,6,9]
- piano scrape: ["A2","F#2"] | piano PCs: [6,9]
- json: root=6 applied=0 type=5 inv=0
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/adele__someone-like-you/screens/Verse_strip2.png)

## Pre-Chorus beat 1
- truth: `V(add9)` (E(add9)) | engine: `V(add9)` (E)
- engine notes: ["E3","G#3","B3"] | truth PCs: [4,6,8,11] | engine PCs: [4,8,11]
- piano scrape: ["A2","B2","C#3"] | piano PCs: [1,9,11]
- json: root=5 applied=0 type=5 inv=0
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/adele__someone-like-you/screens/Pre_Chorus_strip0.png)

## Pre-Chorus beat 17
- truth: `V(add9)` (E(add9)) | engine: `V(add9)` (E)
- engine notes: ["E3","G#3","B3"] | truth PCs: [4,6,8,11] | engine PCs: [4,8,11]
- piano scrape: ["B2","C#3"] | piano PCs: [1,11]
- json: root=5 applied=0 type=5 inv=0
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/adele__someone-like-you/screens/Pre_Chorus_strip0.png)

## Pre-Chorus beat 29
- truth: `IV△9(b5)` (Dmaj9(b5)) | engine: `IV△⁹(b5)` (Dmaj9)
- engine notes: ["D3","F#3","A3","C#4","E4"] | truth PCs: [1,2,4,6,8] | engine PCs: [1,2,4,6,9]
- piano scrape: ["B2","C#3"] | piano PCs: [1,11]
- json: root=4 applied=0 type=9 inv=0 alt=["b5"]
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/adele__someone-like-you/screens/Pre_Chorus_strip1.png)

## Pre-Chorus beat 37
- truth: `IV(add6)(b5)` (D(add6)(b5)) | engine: `IV(add6)(b5)` (D)
- engine notes: ["D3","F#3","A3"] | truth PCs: [2,6,8] | engine PCs: [2,6,9]
- json: root=4 applied=0 type=5 inv=0 alt=["b5"]
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/adele__someone-like-you/screens/Pre_Chorus_strip1.png)

## Chorus beat 13
- truth: `IV(no3)` (D5) | engine: `IV(no3)` (D)
- engine notes: ["D3","F#3","A3"] | truth PCs: [2,9] | engine PCs: [2,6,9]
- piano scrape: ["E3","F#3","G#3"] | piano PCs: [4,6,8]
- json: root=4 applied=0 type=5 inv=0
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/adele__someone-like-you/screens/Chorus_strip0.png)

## Chorus beat 29
- truth: `IV(no3)` (D5) | engine: `IV(no3)` (D)
- engine notes: ["D3","F#3","A3"] | truth PCs: [2,9] | engine PCs: [2,6,9]
- piano scrape: ["A3","C#4"] | piano PCs: [1,9]
- json: root=4 applied=0 type=5 inv=0
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/adele__someone-like-you/screens/Chorus_strip1.png)

## Chorus beat 41
- truth: `vi(add4)` (f#m(add4)) | engine: `vi(add4)` (F#m)
- engine notes: ["F#3","A3","C#4"] | truth PCs: [1,6,9,11] | engine PCs: [1,6,9]
- piano scrape: ["C#4"] | piano PCs: [1]
- json: root=6 applied=0 type=5 inv=0
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/adele__someone-like-you/screens/Chorus_strip1.png)

## Chorus beat 45
- truth: `IV(no3)` (D5) | engine: `IV(no3)` (D)
- engine notes: ["D3","F#3","A3"] | truth PCs: [2,9] | engine PCs: [2,6,9]
- piano scrape: ["A3","F#3"] | piano PCs: [6,9]
- json: root=4 applied=0 type=5 inv=0
- failing: pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano
- strip: ![strip](_Decode_oracle/out/adele__someone-like-you/screens/Chorus_strip2.png)


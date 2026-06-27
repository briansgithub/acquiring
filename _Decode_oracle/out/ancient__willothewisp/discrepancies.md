# Discrepancies (2)

## Intro beat 85
- truth: `#vii°43(hmin)` (f#°7/C) | engine: `♯viiø⁴³(hmin)` (F#°7/C)
- engine notes: ["C4","Eb4","F#4","A4"] | truth PCs: [0,3,6,9] | engine PCs: [0,3,6,9]
- json: root=7 applied=0 type=7 inv=2 borrowed="harmonicMinor"
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano

## Chorus beat 17
- truth: `vi(bor)` (ebm) | engine: `♭vi(bor)` (Eb)
- engine notes: ["Eb3","Gb3","Bb3"] | truth PCs: [3,6,10] | engine PCs: [3,6,10]
- piano scrape: ["G3","Gb3"] | piano PCs: [6,7]
- json: root=6 applied=0 type=5 inv=0 borrowed=[-1,1,3,5,6,8,10]
- failing: romanExact, romanCore, pianoExact, pianoPcsExact, pianoValidated, usePiano


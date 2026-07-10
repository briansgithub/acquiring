# Integrated Player Quizzes — Implementation Plan & Running Memory

This document tracks the tasks completed, remaining tasks, and technical details for integrating ear-training quizzes directly into the main Hooktheory Player page.

## Project Goal
Re-implement the ear-training quizzes directly in the main player page under toggleable modes, instead of a separate page/pane layout.

## Current Branch
`quiz/integrated-player`

---

## 1. Quiz 1: Fill in the Chord Progression (Cloze Quiz)
### Completed Tasks
- [x] Implement mask states in `timeline.js` (using `setMaskedChords(beats[])` API)
- [x] Render masked chords as a large dark gray rectangle with a "?" label on the timeline canvas
- [x] Add a "Fill Chord" activate button to the player interface (named "Cloze Quiz" next to transport controls)
- [x] Silence the audio of masked chords during playback in the audio engine (`player.js`) by scheduling a silent trigger event
- [x] Hook up Chord Ring interaction to accept guesses for the masked chord via `setChordSelectHandler`
- [x] Provide inline correct/incorrect feedback (unmask on correct guess and play chord sound, flash incorrect node on wrong guess, update inline banner message and stats)
- [x] Support biased chord selection (utilize `pickFrequencyBiased` based on frequency profile counts of the section)

---

## 2. Quiz 2: Chord Degree Identification
### Completed Tasks
- [ ] Add a "Hear & ID" activation button to the chord ring or player UI
- [ ] Mask current/targeted chord Roman numeral label on timeline and chord ring
- [ ] Play target chord in isolation on activation or demand
- [ ] Show a small inline 4-choice answer strip under the timeline
- [ ] Support frequency-biased chord selection

---

## 3. Quiz 3: Scale Degree / Melody Note Identification
### Completed Tasks
- [ ] Add a "Hear Note" activation button near the note indicator
- [ ] Mask melody note scale degrees as "?" in the note indicator pane during playback
- [ ] Render 7-button inline answer strip (1̂–7̂)
- [ ] Challenge user to identify notes in real-time, biased by melody frequency

---

## Architecture & Integration Notes
- **State management:** Integrated quizzes toggle local states (e.g. `quizClozeActive`) within `player.js`.
- **UI adjustments:**
  - Added a dedicated `#timeline-quiz-bar` directly inside the timeline pane below the canvas.
  - Increased `#timeline-pane` layout height to 130px in `#app` and `#app.quiz-mode` grid setups to accommodate the canvas and the inline quiz bar comfortably.
  - Intercepted chord clicks on the timeline and nodes on the chord ring when the quiz is active to prevent cheating.

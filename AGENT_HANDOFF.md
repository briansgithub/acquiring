# Sacred Ring: Agent Handoff Document

## Welcome, New Agent!
You are picking up work on the **Sacred Ring** project, specifically focusing on the integration of the quiz system with the main visual components (the Chord Ring and Timeline). 

### Critical Instructions Before You Begin:
1. **Read all architectural documentation and `.md` files in the root directory.** This includes `README.md` or any other design docs to understand the core concepts.
2. **IGNORE the `sacred_ring_data` folder.** This contains a massive database of song information in thousands of `.md` files which will bloat your context limit and provide no architectural value. Do not attempt to read or grep through it unless absolutely necessary.
3. The project uses Vanilla JS, HTML5 Canvas, and Tone.js. **Keep your code modular and avoid adding new heavy dependencies.**
4. Changes should generally stay under the 400-line limit per file. 
5. Run the static server via `npm run player:start` (which binds to `127.0.0.1:3000`) and test your changes in the browser.

---

## What Has Been Done (Quiz Feature Integration)

The primary goal of enmeshing the text-based quiz system with the interactive visual components (the Chord Ring and Timeline) has been largely completed on the branch `feat/quiz-visual-integration`. 

Here is the breakdown of the implemented architecture:

### 1. Foundation & Layout
- **CSS Grid (style.css)**: Consolidated duplicate quiz-mode CSS blocks and restructured the layout into a 3-column grid so the Timeline and Chord Ring remain fully visible when the Quiz pane is active.
- **Context Injection (player.js)**: Modified the main application state to expose references to `ctx.chordRing` and `ctx.timeline` directly to the active quiz modes.

### 2. Visual Component APIs
We enhanced the HTML5 canvas components to support temporary quiz overlays:
- **`chordRing.js`**: Added state and drawing logic for `highlightChoices`, `showTransitionArc` (with an arrowhead bezier curve), `flashCorrect` (green glow), `flashWrong` (red glow), and `setFrequencyOverlay`.
- **`timeline.js`**: Added state and drawing logic for `highlightBeatRange` (semi-transparent overlay) and `setQuizMarkers` (colored indicator dots for active/pending/correct/wrong).

### 3. Quiz Mode Wiring
All quiz modes (`degreeId.js`, `transitionDrill.js`, `cloze.js`, `dictation.js`, `qualityFlash.js`, and the 3 singing modes) have been updated to utilize these visual APIs:
- Modes now highlight their relevant chords on the ring and dim distractors.
- You can now click directly on nodes on the Chord Ring to submit an answer.
- Timeline ranges are highlighted during playback or singing, and sequence markers update as the user steps through progressions.
- Cleanup logic ensures all overlays are cleared (`clearQuizOverlays()`) when a quiz mode is destroyed.

### 4. Frequency Panel & Biased Picking
- **`quizPool.js`**: Added `buildFrequencyProfile` to bias the random selection of questions toward high-frequency chords and transitions found in the active section.
- **`quizFreqPanel.js`**: Enhanced the stats table with background frequency bars. Hovering or clicking rows now dispatches events to dynamically draw highlights or transition arcs on the Chord Ring.

### 5. Automated Testing
- Created a standalone, closed-loop test runner in `web-player/tests/quiz.test.html`. It mocks the application context (audio, canvas components) and programmatically simulates user flows (e.g. clicking the "Next" button, then selecting the correct answer choice) to ensure the quiz logic doesn't throw errors.

---

## What Needs to Be Done (Next Steps)

While the core integration is complete, here are the areas that require attention:

1. **Bug Fixing & Edge Cases**:
   - Ensure there are no lingering memory leaks or canvas visual artifacts left behind when quickly switching between standard playback and various quiz modes.
   - Verify the `quiz.test.html` suite continues to pass as new changes are introduced, and consider adding specific edge-case tests (e.g. testing `singRoot.js` mock microphone input).

2. **UI/UX Polish**:
   - Improve the visual aesthetics of the transition arcs on the canvas (currently a simple quadratic bezier). Ensure the arrowheads point precisely to the edge of the node radius.
   - Refine the responsiveness of the 3-column grid layout on smaller viewports to ensure the chord ring remains circular and the timeline text remains legible.

3. **Expand the Frequency Weighting System**:
   - The user explicitly wants quizzes biased toward high-frequency chords and transitions. Review the logic in `quizPool.js` (`pickFrequencyBiased`) to ensure it scales correctly across different difficulties, preventing obscure or rare chords from appearing too frequently in "Easy" modes.

4. **Merge Strategy**:
   - Once the branch `feat/quiz-visual-integration` is fully vetted and any final user feedback is addressed, prepare it for merging into `main`.

Good luck!

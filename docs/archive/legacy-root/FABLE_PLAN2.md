# FABLE_PLAN2 — Ear Training Quiz Implementation Log

Progress tracker for implementing [FABLE_PLAN1.md](FABLE_PLAN1.md). Updated after each deliverable chunk.

---

## Chunk 1 — Corpus statistics + API (done)

### Done
- **`_Research_testing/hooktheory_catalog/cli/buildCorpusStats.js`** — walks `playback/.hooktheory_cache/`, aggregates chord IDs + transition bigrams per `key.scale`, attaches Roman symbols via dynamic `import()` of `jsonToSymbol.js` (canonical tonic `C`). Floors: chords ≥10, transitions ≥5. `--limit N` for smoke runs.
- **`web-player/corpusStatsApi.js`** — `handleCorpusStats` with mtime-keyed raw + gzip memory cache.
- **`web-player/server.js`** — `GET /api/quiz/corpus-stats` route wired.
- **Smoke verification**: `--limit 200` → top major chords I, IV, V, vi; output at `sacred_ring_data/catalog/corpus_stats.json`.

### Remaining (this chunk)
- Run full corpus build (no `--limit`) before relying on distractor quality in production.
- Invalidate gzip cache if corpus file is rebuilt while server is running (restart server or add explicit invalidation hook).

---

## Chunk 2 — Quiz infrastructure + shell (done)

### Done
- **`web-player/lib/pitchDetection.js`** — `bestOctaveError`, `signedOctaveCents`, optional `onFrame(hz)` on `capturePitchFrames`.
- **`web-player/components/quiz/quizAudio.js`** — dedicated PolySynth; `playChord`, `playSequence`, `playCadence`, `playCadenceThen`.
- **`web-player/components/quiz/quizPool.js`** — `fetchCorpusStats`, `buildSongEntries`, `buildPool`, `poolTransitions`, `progressionRuns`, `distractorSymbols`, `poolStats`.
- **`web-player/lib/quizSession.js`** — `QuizSession` wrapping `QuizScheduler`; per-mode stats + `record` / `pickEntry`.
- **`web-player/components/quiz/modes/modeUtils.js`** — shared choices, feedback, shuffle, mic grading, pitch meter, difficulty select.
- **`web-player/components/quiz/quizMode.js`** — tab bar, session header, `renderQuizMode(container, ctx)`.
- **`web-player/index.html`** — `#mode-switch` + `#quiz-pane`.
- **`web-player/style.css`** — quiz-mode layout, mode tabs, pitch meter.
- **`web-player/player.js`** — prototype removed; `buildQuizSongContext`, lazy corpus fetch on first Quiz entry, mode switcher.

### Remaining (this chunk)
- Deduplicate redundant quiz CSS blocks in `style.css` (parallel edits left overlapping rules).
- Pause main transport on quiz-mode entry (nice-to-have v1).

---

## Chunk 3 — Eight quiz modes (done)

### Done
All modes in `web-player/components/quiz/modes/`:
- `qualityFlash.js` — no cadence; quality identification + optional 7ths.
- `degreeId.js` — cadence + chord; Roman numeral MC; SM-2 via `session.record`.
- `transitionDrill.js` — cadence + A→B; two-step MC; both must be correct.
- `dictation.js` — cadence + progression; per-slot `<select>` submit grading.
- `cloze.js` — muted slot in run; 4-choice fill; replay unmuted after answer.
- `singRoot.js` — cadence + chord; mic grade root; difficulty tiers.
- `singArpeggio.js` — sequential per-tone capture + summary table.
- `singCallResponse.js` — cadence toggle; sing Nth chord tone.

### Remaining (per mode — flesh out later)
- **qualityFlash** — weighted quality distribution; extension qualities beyond triads/7ths.
- **degreeId** — transition-plausible distractors (corpus bigrams, not just frequency).
- **transitionDrill** — show partial credit UI; weight pairs by song-local frequency.
- **dictation** — roman HTML in slot dropdowns; per-slot symbol palettes.
- **cloze** — multiple gaps; roman HTML in sequence display.
- **singRoot** — reference tone preview before capture (prototype had tonic→target).
- **singArpeggio** — arpeggiate playback option; skip tones on repeated miss.
- **singCallResponse** — random root vs 3rd/5th/7th weighting by weakness.

---

## Chunk 4 — Cleanup + docs (done)

### Done
- **`web-player/components/quizPanel.js`** — deleted (prototype retired).
- **`documentation/TODO.md`** — "Quiz mode — deferred" section added.

---

## Chunk 5 — Difficulty tiers (done)

### Done
- **`modeUtils.js`** — `renderListeningDifficultySelect`, `renderPitchToleranceSelect` (renamed from mic difficulty), `renderDifficultyRow`, `mountDifficultyAfter`, `mcChoices`.
- **`quizPool.js`** — `diatonicDistractors`, `transitionTargetDistractors`, `confusableDistractors` for corpus-weighted / transition-plausible MC.
- **Listening modes** — Easy / Normal / Hard selectors on qualityFlash, degreeId, transitionDrill, dictation, cloze.
- **Singing modes** — unified **Pitch tolerance** label + top-of-card placement (singRoot, singArpeggio, singCallResponse).

### Per-mode tiers
| Mode | Easy | Normal | Hard |
|------|------|--------|------|
| Quality | triads, 3 choices | triads, 4 choices | 7ths included, wider root range, 4 choices |
| Degree ID | 3 choices, diatonic distractors | 4 choices, corpus frequency | 4 choices, transition targets from prior chord in section |
| Transitions | longer A→B gap, 3 choices/step | current cadence + 4 choices | neutral prompts, transition-weighted distractors when context exists |
| Dictation | 3 chords, first symbol hint | 4–5 chords | 6–8 chords, no hints |
| Cloze | end gaps only, 3 choices | random gap, 4 choices | 5–6 chord run, transition-confusable distractors |
| Sing * | ±50¢ | ±30¢ | ±15¢ |

### Remaining polish
- sessionStorage persistence per-mode difficulty (nice-to-have).
- Full corpus build + server restart for production distractor quality.
- transitionDrill hard: reverse-bigram distractors for step 0 when no in-section prior chord.
- dictation roman HTML in slot dropdowns; cloze multiple gaps.
- singRoot reference-tone preview; singArpeggio arpeggiate playback option.
- Deduplicate redundant quiz CSS; pause main transport on quiz entry.

---

## Chunk 6 — Quiz layout: song tied to player (done)

### Done
- **Quiz mode** auto-collapses Song Selector (`makeCollapsible` + `setAppMode`) to a 36px strip; expand temporarily via strip toggle; restores prior collapse state on return to Player.
- **`#app.quiz-mode` grid** — two columns (`selector-width` + `1fr`); `#quiz-pane` spans the content column; timeline/indicator/ring hidden.
- **Single song source** — quiz modes keep using `ctx.getSongContext()` → `buildQuizSongContext()` from `currentRawChords` / `loadedCacheKey`; selector `onLoad` → `handleSongChange` / `loadSection` updates both player and quiz (`quizMode.refresh()` remounts active mode).
- **`quizMode.js`** — `Now quizzing: {title}` banner via `getSongLabel()`.

---

## Chunk 7 — Song frequency stats + practice tracking (done)

### Done
- **`web-player/lib/quizSymbolStats.js`** — per-symbol / per-transition stats: session (in-memory), per-song + global (`localStorage` `sr_quiz_symbol_stats_v1`).
- **`web-player/components/quiz/quizFreqPanel.js`** — collapsible panel with Chords / Transitions tabs; expected section distribution + session / song / global asked & correct columns; row highlight for active question.
- **`quizPool.js`** — `statsToChordRows`, `statsToTransitionRows`, `pickWeightedTransition`, `pickWeightedProgressionRun`, `uniqueSongQualities`, `pickWeightedQualityEntry`, `qualityLabelFromSymbol`.
- **`quizSession.js`** — `notifyQuestion`, `recordSymbolAnswer`, symbol stats delegation on `record`.
- **All 8 modes** — frequency-weighted picking where needed; `quizNotify` on Next; `quizRecord` on grade.
- **`qualityFlash.js`** — reworked to require loaded song; qualities from real section chords (symbol-derived labels).
- **`player.js`** — `getSongKey`, `getSectionStats`; banner shows chord count in section.

### Phase 2 (deferred)
- Whole-song histogram aggregation + freq panel scope toggle (see `documentation/TODO.md`).

---

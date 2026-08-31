# FABLE_PLAN1 — Ear Training Quiz Mode: Handoff for Implementing Agent

**Status: research/design complete, ZERO implementation code written.** The plan file is
`c:\Users\user1\.cursor\plans\ear_training_quiz_mode_dbc36893.plan.md` (all 13 todos pending).
This document contains everything discovered during research plus exact build instructions so the
next agent can implement without re-exploring.

Branch: `claude-quiz-plan` (tip `1a7c453`, ahead of `main`; already contains the quiz *prototype* files below).

---

## 0. Project orientation (read this before anything else)

**Sacred Ring** reverse-engineers Hooktheory TheoryTab chord JSON into correct piano voicings + Roman
numeral symbols, plays it back in a browser web-player (Tone.js), and validates correctness with an
offline "oracle" harness. Three subsystems:

| Subsystem | Path | Role |
|---|---|---|
| Web player | `web-player/` | Runtime UI + audio: chord ring, timeline, Now Playing indicator, Song Selector, transport controls. Entry `player.js`, served by `server.js` (plain `http`, port 3000). |
| Catalog module | `_Research_testing/hooktheory_catalog/` | SQLite index of ~39k TheoryTab songs (`lib/`, `cli/`, `web/`); powers Song Selector search + the harvest/metadata/processed/tested pipeline. |
| Decode oracle | `_Decode_oracle/` | Offline scrape→engine→compare loop that scores chord correctness against Hooktheory ground truth. **Not needed for the quiz work**; currently at 0 engine failures across all corpora. |

**Data root** (`sacred_ring_data/`, resolved by `lib/dataRoot.js` — env `SACRED_RING_DATA` or
`sacred_ring_data.config.json` or default `<repo>/sacred_ring_data/`; everything gitignored):
- `catalog/hooktheory_catalog.db` (+ `library_cache.json` ~16MB, `playback_library_cache.json`)
- `playback/.hooktheory_cache/<artist> - <Title>/` — one JSON per section + `_metadata.json` (the chord source for the quiz corpus)
- `harvest/<slug>/` — per-song scrape artifacts (`scrape.json`, oracle `report.json`); ~34k folders of `.md`/`.json` reports — **never bulk-read this tree**

**Documentation routing** (read on demand, not linearly): [HANDOFF.md](HANDOFF.md) → session state;
[documentation/INDEX.md](documentation/INDEX.md) → doc map; [documentation/ARCHITECTURE.md](documentation/ARCHITECTURE.md) →
engine/oracle big picture; [documentation/MEMORY.md](documentation/MEMORY.md) → startup-performance model + audio model;
[documentation/BUGS.md](documentation/BUGS.md), [documentation/TODO.md](documentation/TODO.md);
catalog specifics in `_Research_testing/hooktheory_catalog/{USAGE,CHEATSHEET,DATA_FIELDS}.md`.

**Hooktheory chord JSON semantics** (essential for any quiz logic):
- `root` = scale degree 1–7 in the active (or borrowed) key; when `applied > 0` it becomes the **denominator** (tonicization target).
- `applied` = numerator degree of a secondary chord, read from the MAJOR scale of the target (e.g. `{root:2, applied:7}` → `vii°/ii`).
- `borrowed` = mode name string (`minor`/`dorian`/…/`locrian`) or a custom semitone-interval array.
- `type` = 5 (triad), 7 (seventh), 9/11/13 (extensions); `inversion` 0–3 (figured-bass symbols derived in `jsonToSymbol.js`).
- Voicing build order in `chordInterpreter`: triad → 7th → extensions → suspensions → omits/alts/adds → inversion → `finalizeVoicing`. Modifiers run **before** inversion; you cannot un-invert a produced note array — re-run the interpreter with `inversion: 0` (that is exactly what `forceRootPosition` does).

**Timing model**: 192 ticks per beat (Tone.Transport ticks); events scheduled as `"<tick>i"` strings.
Tempo changes reschedule via `engine.rescheduleParts` / `updatePlaybackSettings`.

---

## 1. Critical research findings (do NOT re-derive; several are non-obvious)

1. **`song_sections.section_data_json` does NOT contain chords.** It only stores keys/tempos/meters/
   youtube/lyrics/bands (see `_Research_testing/hooktheory_catalog/lib/songDataAggregate.js` line ~257
   and `DATA_FIELDS.md` "chords[] (full array) | Large; use `.hooktheory_cache/`"). The plan's Phase 0
   originally said to read chords from the DB — **that is wrong**. Corpus stats MUST be built by walking
   the playback cache: `sacred_ring_data/playback/.hooktheory_cache/<artist> - <Title>/<Section> - <numericId> - <songId>.json`
   (~34k folders, ~65k section files). Each file has top-level keys:
   `songId, numericId, sectionName, songInfo, chords, notes, metadata, stringSongId, cachedAt`.
   - `chords[]` entries: `{ root, beat, duration, type, inversion, applied, adds, omits, alterations, suspensions, pedal, alternate, borrowed, isRest, recordingEndBeat }`
   - Key: `metadata.keys[0]` → `{ beat, scale, tonic }` (e.g. `{scale:"major",tonic:"Ab"}`)
2. **Node CAN dynamic-import the ES module symbol builder.** Verified working:
   `import('./web-player/lib/jsonToSymbol.js')` then `getChordSymbol({root:5,type:7,...},{tonic:'C',scale:'major'})`
   → `"V7"`; applied chord `{root:2,type:5,applied:7}` in Ab major → `"vii°/ii"`. Roman symbols are
   tonic-independent, so **use canonical tonic `'C'` with the section's scale** when building corpus symbols.
3. **A quiz prototype already exists on this branch** and must be promoted/retired:
   - `web-player/components/quizPanel.js` — single flashcard UI mounted in the Now Playing column. DELETE it.
   - `web-player/lib/quizScheduler.js` — KEEP. `QuizScheduler` class: SM-2 spaced repetition
     (`updateSm2`), weighted card pick (`nextCard(candidates, stats, lastSymbol)` weighting
     freq×overdue×weakness×novelty×transition-boost×anti-repeat), `grade(chord, correct, quality)`,
     localStorage key `sr_quiz_state_v1`, chord identity `chordKey()` = `r{root}|t{type}|i{inv}|b{borrowed}|a{applied}`.
   - `web-player/lib/pitchDetection.js` — KEEP/extend. `capturePitchFrames(durationMs)` (autocorrelation,
     getUserMedia, returns Hz frames), `centsError(observed, target)`, `median(values)`.
   - `quizPanel.js` also has `bestOctaveError(observedHz, targetHz)` (octave-tolerant cents, shifts ±2
     octaves) — move it into `pitchDetection.js` when deleting the panel.
   - Prototype wiring in `web-player/player.js` to remove/replace: import line 9 (`renderQuizPanel`),
     `let quizPanel` ~line 407, `buildQuizContext()` ~lines 409–446, `quizPanel?.refresh()` calls ~473 and ~684,
     mount block ~lines 502–512 (`quiz-panel-mount` appended to `.indicator-stack`).
4. **Player internals available for reuse** (all in `web-player/`):
   - `lib/music.js`: `chordInterpreter(chord, key, {forceRootPosition})` → `{notes, chordDegrees, ...}`;
     `parseKey(metadata)`; `sdToToneJSNoteName(...)`.
   - `lib/jsonToSymbol.js`: `getChordSymbol(chord, key)`, `getChordLetterName(chord, key)`.
   - `lib/chordVoicing.js`: `normalizeToneNotes(notes)` → Tone-ready note names.
   - `lib/romanNumeralCanvas.js`: `romanNumeralToHtml(symbol)` (line ~578) for pretty numeral buttons.
   - `audio/engine.js` (`AudioEngine`): `previewChord(notes, duration, arpeggiate, speedMs, onNoteTrigger)`,
     `previewNote(note, duration)`. Synths: melodySynth, chordSynth (Poly), arpeggioSynth (mono), previewSynth (Poly).
   - `player.js` state: `currentRawChords`, `currentKey`, `currentSectionKeys`, `interpretChord()` wrapper,
     `activeSectionKeyAtBeat(currentSectionKeys, beat, currentKey)`.
5. **Layout facts** (`web-player/index.html` + `style.css`):
   - `#app` grid: `grid-template-columns: var(--selector-width,310px) 290px 1fr; grid-template-rows: 110px 1fr;`
   - `#timeline-pane { grid-column: 1 / -1; }` (row 1); selector/indicator/ring fill row 2 columns 1–3.
     (Note: index.html panes are timeline, selector, indicator, ring; controls live inside a pane.)
   - `.quit-btn` is `position:fixed; bottom:14px; right:14px; z-index:100` — place the mode switcher
     fixed **top-right** (e.g. `top:14px; right:14px; z-index:100`) so it never collides.
   - Prototype CSS classes already in style.css (~line 2400): `.quiz-choices` (2-col grid), `.quiz-choice-btn`,
     `.quiz-correct`, `.quiz-wrong`, `.quiz-status`, `.quiz-row`, `.quiz-select` — reuse them.
6. **Catalog DB** (`sacred_ring_data/catalog/hooktheory_catalog.db`, better-sqlite3, WAL): tables
   `songs(39204)`, `song_metrics(34093)`, `song_stats(34093: unique_chords, unique_transitions, total_chords, ...)`,
   `song_sections(65486)`, `song_details(34093)`. Useful for tier/complexity features later, not needed for Phase 0.
7. **Server** `web-player/server.js` is a plain `http` server with an if-chain router — add new routes there.
   Gzip precedent: `handleLibraryList` in `_Research_testing/hooktheory_catalog/web/api.js` (memory-cached gzip keyed on file mtime).
8. **Project rules**: files ≤400 lines (ask before >300); debug scripts → `_Debug_testing/`; research
   scripts → `_Research_testing/`; do not commit unless asked; replies start with `YYYY-MM-DD-identifier`.

---

## 2. Remaining work — ALL 13 todos, in build order

### Todo `corpus-stats` — `_Research_testing/hooktheory_catalog/cli/buildCorpusStats.js` (CommonJS)

Walk the playback cache (root via `require('../../../lib/dataRoot').getPlaybackCacheDir()`), for every
section JSON: parse, take `key = metadata.keys[0]` (skip file if missing), filter `chords` to non-rests.
For each chord compute quiz identity `r{root}|t{type||5}|i{inversion||0}|a{applied||0}|b{borrowedTag}`
where `borrowedTag` = `'custom'` if Array, else the string or `'none'` (ignore adds/omits/alts/sus for identity).
Accumulate per `key.scale` bucket (major/minor/dorian/...):
- `chords: Map<id, {count, songs:Set<cacheDir>, chord: firstSeenChordObject}>`
- `transitions: Map<fromId=>toId, {count, songs:Set}>` (adjacent non-rest pairs within one section)
Attach display symbols at the end: `const {getChordSymbol} = await import(pathToFileURL(repo + '/web-player/lib/jsonToSymbol.js'))`,
symbol = `getChordSymbol(chord, {tonic:'C', scale})`. **Use `url.pathToFileURL` — plain paths fail dynamic import on Windows.**
Write `sacred_ring_data/catalog/corpus_stats.json`:
```json
{ "builtAt": "...", "songCount": N, "sectionCount": N, "totalChords": N,
  "scales": { "major": {
      "total": N,
      "chords": [{ "id": "...", "symbol": "V7", "chord": {"root":5,"type":7,"inversion":0,"applied":0,"borrowed":null}, "count": N, "songs": N }],
      "transitions": [{ "from": "id", "to": "id", "count": N, "songs": N }] } } }
```
Sort descending by count; apply floors (chords `count>=10`, transitions `count>=5`) to keep it compact.
Log progress every 2000 folders (full walk takes 1–3 min). Support `--limit N` flag for a fast smoke run.
**Verify**: top major chords should be I, V, vi, IV family; print top 10 per scale at the end.

### Todo `stats-api` — `GET /api/quiz/corpus-stats` in `web-player/server.js`

Read `path.join(getCatalogDir(), 'corpus_stats.json')` (`getCatalogDir` from `../lib/dataRoot`), cache
buffer + gzipped buffer in memory keyed on mtime; respond gzip if `accept-encoding` includes it; 404 JSON
`{error:"corpus stats not built"}` if the file is absent (quiz must degrade gracefully without it).

### Todo `quiz-shell` — mode switcher + quiz pane

- `index.html`: add `<div id="mode-switch"><button id="mode-player" class="active">Player</button><button id="mode-quiz">Quiz</button></div>`
  before the Quit button, and `<div id="quiz-pane" class="pane quiz"></div>` inside `#app`.
- `style.css`: `#mode-switch{position:fixed;top:14px;right:14px;z-index:100;display:flex;gap:4px}` styled like `.quit-btn`;
  `#quiz-pane{display:none}`; `#app.quiz-mode #timeline-pane, #app.quiz-mode #indicator-pane, #app.quiz-mode #ring-pane {display:none}`;
  `#app.quiz-mode #quiz-pane{display:flex;flex-direction:column;grid-column:2/4;grid-row:1/3;overflow:auto}`.
  Selector pane stays visible (loading songs works in both modes). Audio playback keeps running on switch — acceptable v1;
  nice-to-have: pause main transport when entering quiz mode.
- `web-player/components/quiz/quizMode.js`: `renderQuizMode(container, ctx)` — tab bar (8 modes), session
  header (`streak / bestStreak / accuracy` from `ctx.session.statsFor(modeId)`), body div; on tab click call
  previous mode's `destroy?.()` then `mode.render(body, ctx)`. Modes registered via an array of imported
  module objects `{id, label, render}`.
- `ctx` object (assembled in player.js): `{ getSongContext, getCorpus, audio, session, romanHtml: romanNumeralToHtml }`.

### Todo `quiz-infra` — audio/pool/session + retire prototype

- `web-player/components/quiz/quizAudio.js`: owns a dedicated `Tone.PolySynth` (sawtooth, vol −5) — do NOT
  share engine synths, so quiz playback can't fight the main player. API:
  - `playChord(notes, ms=1100)`
  - `playSequence(steps, msPerStep=850)` — `steps: Array<string[]|null>` (null = muted slot); setTimeout-based,
    returns `{cancel()}`; always cancel the previous sequence on a new call.
  - `playCadence(key, interpret)` — I–IV–V–I: `interpret({root:d,type:5,inversion:0,applied:0,adds:[],omits:[],alterations:[],suspensions:[],borrowed:null,isRest:false}, key)`
    for d of [1,4,5,1], then `playSequence`.
  - `playCadenceThen(key, interpret, targetSteps)` — cadence, ~500ms gap, then target step(s). Every listening
    drill except quality flashcards uses this (the plan's "Foundation rule").
  - Ensure `Tone.start()` on first user gesture (copy the guard from `engine.previewChord`).
- `web-player/components/quiz/quizPool.js`:
  - `fetchCorpusStats()` — fetch `/api/quiz/corpus-stats` once, memoize; return null on 404.
  - `buildPool(songCtx)` — entries `{chord, key, symbol, notes, rootNotes, degrees}` (see songCtx below).
  - `poolTransitions(pool)` — adjacent pairs `[a,b]`.
  - `progressionRuns(pool, minLen, maxLen)` — random contiguous slice.
  - `distractorSymbols(corpus, scale, excludeSymbol, n)` — top-frequency symbols from `corpus.scales[scale].chords`,
    excluding the answer, weighted-random among the top ~12; fallback to diatonic set
    `["I","ii","iii","IV","V","vi","vii°"]` (major) / `["i","ii°","III","iv","v","VI","VII"]` (minor) when corpus is null.
- `web-player/lib/quizSession.js`: `QuizSession` class wrapping `QuizScheduler`; localStorage `sr_quiz_session_v1`
  with per-mode `{asked, correct, streak, bestStreak}`; `record(modeId, correct, {chord, quality})` (grades
  scheduler only when a chord identity applies), `statsFor(modeId)`, `pickEntry(pool, lastSymbol)` (delegates
  to `scheduler.nextCard` with song-local counts as `stats`).
- `player.js` changes: delete prototype wiring (locations in §1.3); add
  `buildQuizSongContext()` returning `{ key: currentKey, scale: currentKey.scale, entries, interpret }` where
  entries are built like the old `buildQuizContext` but ALSO include
  `rootNotes: normalizeToneNotes(chordInterpreter(chord, activeKey, {forceRootPosition:true}).notes)`;
  mount quiz mode + mode-switch listeners (toggle `quiz-mode` class on `#app`); call a `quizMode.refresh()`
  after `loadSection` success. Keep the additions ≤ ~40 lines — player.js is already >400 lines (pre-existing).

### Todos `mode-quality` … `sing-callresponse` — 8 mode modules

Put them in `web-player/components/quiz/modes/`, one file each, plus `modeUtils.js` for shared pieces:
- `renderChoices(el, choices, onPick)` — reuses `.quiz-choices`/`.quiz-choice-btn`/`.quiz-correct`/`.quiz-wrong`
- `feedback(el, ok, text)`, `shuffle(arr)`, `NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]`,
  `semitoneToNote(semi, octave=4)`
- `micGrade({targetNote, thresholdCents, statusEl, meterEl})` — wraps `capturePitchFrames`, live meter (see below),
  returns `{pass, cents}` using `bestOctaveError`
- Difficulty select (±50/30/15 cents) shared by singing modes (copy from prototype).

Mode specs (each `{id, label, render(el, ctx)}`; every answer flows through `ctx.session.record`):

1. **`qualityFlash.js` (mode-quality)** — no key context. Random root semitone (transpose −5..+6 from C4),
   quality from `{maj:[0,4,7], min:[0,3,7], dim:[0,3,6], aug:[0,4,8]}`; add `dom7 [0,4,7,10], maj7 [0,4,7,11], min7 [0,3,7,10]`
   behind an "include 7ths" checkbox. Play via `audio.playChord`; 4-choice quality buttons; Replay button.
   No scheduler chord identity (use `record(modeId, correct)` only).
2. **`degreeId.js` (mode-degree)** — requires loaded song (`pool.length` else show "Load a song first").
   `session.pickEntry(pool)` chooses target; `audio.playCadenceThen(key, interpret, [target.notes])`;
   choices = target symbol + 3 `distractorSymbols(corpus, scale, symbol, 3)` rendered with `ctx.romanHtml`
   (set `btn.innerHTML`); grade with chord identity so SM-2 applies.
3. **`transitionDrill.js` (mode-transition)** — random pair from `poolTransitions`; cadence then A→B;
   two sequential choice grids ("First chord?", then "Second chord?"), each 4 options; correct only if both right;
   reveal `A → B` symbols after.
4. **`dictation.js` (mode-dictation)** — `progressionRuns(pool, 3, 8)`; cadence then sequence; answer UI:
   one `<select>` per slot populated with the song's unique symbols (plain text OK v1); Submit grades
   all slots, shows per-slot ✓/✗, Replay available before and after.
5. **`cloze.js` (mode-cloze)** — run of 4–6; mute one random index (`steps[i] = null` in `playSequence`);
   show the known symbols with a "?" gap; 4 choices for the missing chord (real answer + distractors);
   after answering replay unmuted.
6. **`singRoot.js` (sing-root)** — `pickEntry(pool)`; cadence + chord; user clicks "Sing", `micGrade` against
   `entry.rootNotes[0]`, threshold from difficulty select; grade SM-2 with quality 5/4/2/1 by cents bands
   (copy prototype's `singAndScore` bands). Show cents-off result.
7. **`singArpeggio.js` (sing-arpeggio)** — target = `entry.rootNotes` (3–4 tones). Sequential per-note capture
   (NO segmentation of one long take — simpler and better UX): for each tone, prompt "Sing the {root/3rd/5th/7th}",
   optionally replay that tone, capture ~1.6s, grade; summary table of cents per tone; pass = all within threshold.
8. **`singCallResponse.js` (sing-callresponse)** — play chord (with cadence toggle); ask "sing the Nth chord tone"
   (random index 1..len−1 of `rootNotes`, label from `degrees`); single `micGrade` against that note.

**Live pitch meter** (used by all singing modes): add to `pitchDetection.js` an optional `onFrame(hz)` callback
param on `capturePitchFrames(durationMs, onFrame)`; meter = horizontal bar ±50 cents with a needle,
`cents = bestOctaveError`-signed vs target, updated per frame. Keep it a small helper in `modeUtils.js`.

### Todo `todo-deferred` — append to `documentation/TODO.md`

Add a "Quiz mode — deferred" section listing: confusability multiple-choice (distractors = top transition
candidates from corpus), Markov predict-the-next-chord (sing prediction then reveal), "which is more common"
2AFC, anomaly detection (swap one chord for a rare one, ask if it belongs), cadence decks (V→I / IV→I / V→vi
drills from real transitions), roots-in-rhythm singing, retrograde singing, gamification (frequency-rank tiers,
progression bingo, name-that-song bonus, accuracy history charts), rarity-weighted resurfacing beyond SM-2,
corpus-wide progression sampling (quiz on songs that are not loaded, pulling chords straight from corpus_stats).

---

## 3. Debug / iterate workflow

- Start server: `npm run player:start` (detached; `player:stop`), or `node web-player/server.js` (port 3000).
  Terminal state files live in `_Debug_testing/.player-server.json`.
- Load a known-good song via Song Selector (e.g. slug `scott-joplin__maple-leaf-rag`, cache dir
  `scott-joplin - Maple_Leaf_Rag`) — auto-loads when the pipeline is complete.
- Smoke-test corpus builder with `--limit 200` first; the full run only after output looks sane.
- Mic testing needs a real browser + permission grant; `capturePitchFrames` rejects if permission denied —
  every singing mode must catch and surface `err.message` (prototype did this; keep it).
- Debug scratch scripts go in `_Debug_testing/` and must be cleaned up.
- Known trap: `Tone.Frequency` requires Tone loaded from CDN (index.html script tag) — quiz code must only
  touch `window.Tone` inside functions, never at module top level.
- Iteration priorities after v1 works end-to-end: (a) per-slot symbol palettes with roman HTML in dictation,
  (b) weight degreeId distractors by corpus *transition* plausibility instead of raw frequency,
  (c) session history graph, (d) pause main transport on quiz-mode entry, (e) corpus-only question source
  so no song load is required.

## 4. File inventory to create/modify

| Action | Path |
|---|---|
| create | `_Research_testing/hooktheory_catalog/cli/buildCorpusStats.js` |
| create | `web-player/components/quiz/quizMode.js`, `quizAudio.js`, `quizPool.js` |
| create | `web-player/components/quiz/modes/modeUtils.js` + 8 mode files (§2) |
| create | `web-player/lib/quizSession.js` |
| modify | `web-player/server.js` (route), `index.html` (switcher + pane), `style.css` (quiz-mode rules) |
| modify | `web-player/player.js` (remove prototype wiring, add songContext + mount) |
| modify | `web-player/lib/pitchDetection.js` (onFrame cb, absorb `bestOctaveError`) |
| modify | `documentation/TODO.md` (deferred list) |
| delete | `web-player/components/quizPanel.js` |

All new files ≤400 lines (target ≤250). Do not commit unless the user asks.

---

## 5. Appendix — architectural context learned this session

### 5.1 Server API surface (`web-player/server.js` if-chain router)

| Route | Source | Notes |
|---|---|---|
| `GET /api/library` | catalog `library_cache.json` via `catalogApi.js` → `web/api.js` | ~39k rows, gzip memory-cached on mtime; Song Selector search/pipeline flags. |
| `GET /api/songs` | full filesystem scan of playback cache | ~20s cold; disk-cached in `playback_library_cache.json` (`playbackLibraryCache.js`). **Not called at startup anymore** — do not reintroduce a startup call. |
| `GET /api/songs/entry?key=` | one cache folder | Fast per-song section list; used when a song is picked. |
| `GET /api/song?file=` | one section JSON | Actual playback data (chords/notes/metadata). |
| `POST /api/library/load?slug=` | catalog | Pipeline gate; returns `cacheKey` (= cache folder name). |
| pipeline/batch/daemon routes | `_Research_testing/hooktheory_catalog/web/*` | harvest (Puppeteer), metadata, processed, tested. |
| `POST /api/shutdown`, `GET /api/health` | server | Quit button + tab auto-close polling in `index.html`. |

Pipeline flags per song: `catalogued → harvested(Fetch) → metadata → processed → tested`; auto-load into
the player requires all five; `canLoad` needs only catalogued+metadata+processed. Only **Fetch** opens a browser.

### 5.2 Player runtime wiring (`player.js`)

- Components mounted at module load: `renderSongSelector`, `renderControls`, `renderChordRing`,
  `renderNoteIndicator`, `renderTimeline` (+ prototype quiz panel). Key state: `currentRawChords`,
  `currentRawNotes`, `currentKey`, `currentSectionKeys` (mid-section key changes!), `currentChordEvents`,
  `isArpeggiated`, `forceRootPosition`, `loadedCacheKey`, `library` (grows lazily per loaded song).
- **BUG-005/006 lesson**: `/api/library` fetch can finish *after* a song is loaded; never resolve the
  active song by array index — always by `loadedCacheKey` (`resolveSongIndex()`). Don't reset idle state
  when `currentSong` exists.
- Mid-section key changes exist: always resolve a chord's key with
  `activeSectionKeyAtBeat(currentSectionKeys, beat, currentKey)` before interpreting (the quiz song-context
  builder in §2 already does this — keep it when iterating).
- Chord ring split-metadata concept: `placementDegree` (geometry in current key) vs `colorDegree`
  (always original `root`) — relevant only if the quiz ever reuses ring visuals.

### 5.3 Audio engine model (`web-player/audio/engine.js`)

| Synth | Type | Use |
|---|---|---|
| `melodySynth` | mono `Tone.Synth` (square) | melody |
| `chordSynth` | `Tone.PolySynth` (sawtooth) | block chords |
| `arpeggioSynth` | mono `Tone.Synth` | arpeggio events only |
| `previewSynth` | `Tone.PolySynth` | UI previews, isolated from playback |

Traps: mono `Tone.Synth.triggerRelease(time)` takes NO note arg; PolySynth takes `(notes, time)`.
Tone.js 14.7.77 loads from CDN in `index.html`; `Tone.start()` must run inside a user gesture.
The quiz's dedicated synth (§2 quizAudio) follows the `previewSynth` isolation pattern.

### 5.4 Roman numeral display + speech (for quiz UI polish)

- `lib/romanNumeralCanvas.js` — `romanNumeralToHtml(symbol)` renders figured-bass stacks (`V⁴₃`), °/ø
  quality glyphs; regression: `npm run test:roman-symbols`. See `documentation/ROMAN_NUMERALS.md`.
- `lib/romanNumeralSpeak.js` (+ `lib/speakRules/`) — spoken readings (analytic/functional/letter);
  `npm run test:pronunciation`. See `documentation/PRONUNCIATION.md`. Could later voice quiz prompts
  ("what chord follows the five-seven?").
- `lib/scaleDegreeVerifier.js` — pill-label verification; dev assert via `?verifyDegrees=1` URL param.

### 5.5 Catalog DB quick reference (`sacred_ring_data/catalog/hooktheory_catalog.db`, better-sqlite3, WAL)

| Table | Rows | Quiz-relevant columns |
|---|---|---|
| `songs` | 39,204 | `slug`, `artist`, `title`, `cache_dir` (join key to playback cache), pipeline timestamps |
| `song_metrics` | 34,093 | Hooktheory complexity ratings (`chord_complexity_ht`, `complexity_rating`) — future tier/leveling source |
| `song_stats` | 34,093 | per-song `unique_chords`, `unique_transitions`, `total_chords`, borrowed/applied counts |
| `song_sections` | 65,486 | `key_tonic`, `key_scale`, `bpm`, `chord_count`, `section_data_json` (**no chords** — see §1.1) |
| `song_details` | 34,093 | primary key/tempo, youtube id/sync (future "name that song" bonus round) |

`_Research_testing/inspect_catalog_schema.js` (untracked) dumps the live schema. Canonical chord identity
precedent: `lib/chordSignature.js` (`chordSignature()` includes adds/omits/alts/sus; the quiz identity in §2
deliberately drops those to group variants).

### 5.6 Git / worktree state

- Primary worktree `H:/Desktop/3_sacred_ring`; an agent worktree exists at
  `C:/Users/user1/.cursor/worktrees/3_sacred_ring/g12x` (a branch checked out in one worktree cannot be
  checked out in the other).
- `main` tip at handoff: `de94d40` (Song Selector optimizations). `claude-quiz-plan` = `claude-code-plan`
  tip `1a7c453`, which already merged the `quiz-prototyping` work (`9f5e8ea`) plus transition-table and
  startup-performance commits. Uncommitted noise in status: `.idea/`, `_Research_testing/inspect_catalog_schema.js`.

### 5.7 Conventions & session rules (repeated because they gate acceptance)

- Source files ≤400 lines; ask the user before letting any file exceed 300.
- Debug scripts + their outputs → `_Debug_testing/`; research/info scripts → `_Research_testing/`.
- Never commit or push unless explicitly asked.
- Chat replies must begin with a `YYYY-MM-DD-identifier` line; style: terse, expert-level, actual code over prose.
- Server lifecycle for testing: `npm run player:start` / `player:stop` / `player:status`
  (`_Debug_testing/playerServerCtl.mjs`; graceful shutdown via `POST /api/shutdown`), or interactive
  `python launch_player.py`.
- Startup perf invariants to preserve: no `/api/songs` at page load; Song Selector usable ~1s after load;
  playable-dropdown sorts stay lazy (`createLazyPlayableCaches`). The quiz pane must not add blocking work
  to page load — fetch corpus stats lazily on first switch to Quiz mode.

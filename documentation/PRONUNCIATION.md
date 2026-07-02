# Chord Pronunciation System

Rule-based spoken readings for Hooktheory chord JSON. Converts each chord object + key into human-readable strings for accessibility, pedagogy, and UI tooltips.

**Not** a machine-learning model — there is no external pronunciation ground truth. Tests prove **consistency**, **coverage**, and **alignment with symbol/letter naming**, not that a reading matches a single authoritative dialect.

---

## Readings

`getChordPronunciation(chord, key)` returns three strings:

| Field | UI label | Meaning |
|-------|----------|---------|
| `analytic` | **Analytic Reading:** | Left-to-right decomposition of the roman symbol: degree, quality, figured bass, extensions, suspensions, adds/omits, alterations, applied `of` target, borrowed tag. |
| `functional` | **Functional Reading:** | Theory shorthand: inversion names (`first inversion seventh`), secondary dominants (`secondary dominant to …`), borrowed-scale phrasing (`borrowed from …`), and other context-aware compressions. |
| `letter` | **Analytic Reading** (letter-mode tooltips) | Spoken letter-name chord from `getChordLetterName()` via `speakLetterChord()`. |
| `functionalLetter` | **Functional Reading** (letter-mode tooltips) | Theory shorthand using note names — inversions, secondary dominants, borrowed-scale phrasing. |

Rest chords and chords without `root` return empty analytic/functional strings.

Unknown symbol branches return `UNKNOWN` for analytic/functional; letter may still resolve.

### Example

Chord: `V7` in G major (`root: 5, type: 7`).

| Reading | Output |
|---------|--------|
| Analytic | `five major seventh` |
| Functional | `five major seventh` |
| Letter | `D seven` |

Applied / borrowed / inversion cases diverge — see `_Research_testing/pronunciationFixtures.json`.

---

## Architecture

```
Hooktheory chord JSON + key
        │
        ▼
  buildSpeakParts()     ← chordContext.js (scale, quality, applied, borrowed)
        │
        ├── formatAnalytic()    ← literal symbol order
        └── formatFunctional()  ← inversion labels, applied/borrowed phrasing
        │
        ▼
  speakLetterChord()    ← jsonToSymbol.getChordLetterName → speakLetterSymbol()
```

### Modules (`web-player/lib/`)

| File | Role |
|------|------|
| `romanNumeralSpeak.js` | Public API: `getChordPronunciation`, `speakRomanNumeral`, `pronunciationDisplayHtml` |
| `speakRules/buildParts.js` | JSON → intermediate `parts` + `ctx` (mirrors `jsonToSymbol.js` branches) |
| `speakRules/chordContext.js` | Scale-degree quality, applied chord, borrowed scale, denominator quality |
| `speakRules/formatReadings.js` | `formatAnalytic`, `formatFunctional` |
| `speakRules/words.js` | Degree/accidental/extension/alteration word tables |
| `speakRules/speakLetter.js` | Letter-symbol tokenizer and speech |

Design rule: **JSON-first** — readings are built from chord fields, not by re-parsing rendered roman HTML. Keeps pronunciation aligned with `getChordSymbol()` without duplicating glyph logic in a second parser.

---

## UI integration

`pronunciationDisplayHtml(pronunciation)` renders stacked blocks:

- **Analytic Reading:** / **Functional Reading:** headings (left-aligned)
- Hover `title` tooltips on headings explain each mode
- Reading text on the line below each heading

Wired in:

| Component | When |
|-----------|------|
| `noteIndicator.js` | `#chord-pronunciation` under the roman numeral in Now Playing |
| `timeline.js` | Chord hover tooltip |
| `chordRing.js` | Degree-segment hover tooltip; center reading tooltip; follows Roman Numerals toggle |

Styles: `web-player/style.css` — `.chord-pronunciation`, `.pronunciation-label`, `.pronunciation-text`.

---

## API

```js
import { getChordPronunciation, speakRomanNumeral, pronunciationDisplayHtml } from './lib/romanNumeralSpeak.js';

const { analytic, functional, letter, functionalLetter } = getChordPronunciation(chord, key);
const analyticOnly = speakRomanNumeral(chord, key);
const html = pronunciationDisplayHtml({ analytic, functional, letter, functionalLetter });
const letterHtml = pronunciationDisplayHtml({ analytic, functional, letter, functionalLetter }, { useRoman: false });
```

`key` shape matches the rest of the player: `{ tonic: 'G', scale: 'major' }` (plus `tonic_sd` when present in section metadata).

---

## Testing

```bash
npm run test:pronunciation
```

Runs three suites in order:

| Script | What it checks |
|--------|----------------|
| `romanPronunciationTest.mjs` | 77 curated fixtures in `pronunciationFixtures.json`; sus-order invariance; rest handling |
| `romanPronunciationCorpusTest.mjs` | ~21k `chord_db` entries — flags any `UNKNOWN` analytic |
| `romanPronunciationLetterTest.mjs` | Letter reading coverage vs corpus `truthLetter` patterns |

### Fixtures

`_Research_testing/pronunciationFixtures.json` — hand-authored cases per `byModification` bucket, composites, and Honesty-oracle edge cases. Regenerate or extend when adding new `jsonToSymbol` branches.

### Audit report

```bash
node _Research_testing/generatePronunciationAudit.mjs
```

Writes `_Research_testing/pronunciationAudit.md` — human spot-check table (symbol, analytic, functional, letter). Flagged entries = analytic `UNKNOWN`.

### Quick verify harness

```bash
node _Research_testing/pronunciationFixVerify.mjs
```

Five-case smoke check after rule changes.

---

## Extending

1. Add or adjust branch in `jsonToSymbol.js` / `buildParts.js` together.
2. Add fixture(s) to `pronunciationFixtures.json` with expected `analytic`, `functional`, `letter`.
3. Run `npm run test:pronunciation`.
4. Optionally regenerate `pronunciationAudit.md` and scan for new flags.

Common pitfalls (already handled — preserve when editing):

- Redundant borrowed tag when it duplicates case quality (`iv(min)` → not "four minor minor")
- Half-diminished: `minor` case + `half-diminished` glyph, not double "diminished"
- Applied chords: denominator quality for `/ii°`-style targets
- Augmented + `#5`: drop redundant "sharp five"
- `(bor)` → spoken as "custom scale", not "borrowed from borrowed"

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — chord interpretation pipeline, `jsonToSymbol.js`
- [ROMAN_NUMERALS.md](./ROMAN_NUMERALS.md) — glyph layout (separate from pronunciation)
- [BUGS.md](./BUGS.md) — playback regressions (separate from pronunciation)

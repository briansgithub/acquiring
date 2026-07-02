# Roman Numeral Display

Renders Hooktheory-style roman chord symbols with correct figured-bass stacking in both **HTML** (Now Playing, tooltips, transition table) and **canvas** (chord ring, timeline blocks).

Symbol strings come from [`web-player/lib/jsonToSymbol.js`](../web-player/lib/jsonToSymbol.js) (`getChordSymbol`). Display logic lives in [`web-player/lib/romanNumeralCanvas.js`](../web-player/lib/romanNumeralCanvas.js) — separate from pronunciation ([PRONUNCIATION.md](./PRONUNCIATION.md)), which reads chord JSON directly.

**Commit:** `e57dc72` (2026-07-02) — figured-bass sizing, quality glyphs, verify harnesses.

---

## Pipeline

```
getChordSymbol(chord, key)  →  "viiø42", "I64", "V7", …
        │
        ▼
tokenizeRomanNumeral(symbol)  →  [{ kind, text }, …]
        │
        ├── romanNumeralToHtml()   → DOM (noteIndicator, tooltips, transition table)
        └── drawRomanNumeral()     → canvas (chordRing, timeline)
```

Both paths share the same tokenizer and scale constants so HTML and canvas stay aligned.

---

## Token kinds

| Kind | Example | Render |
|------|---------|--------|
| `base` | `vii`, `/V`, `bor` | Normal size |
| `super` | `6`, `°7`, `ø4`, `△7` | Superscript row |
| `sub` | `4`, `2`, `sus4` | Subscript row |
| `suffix` | `(bor)`, `(min)` | Smaller inline after super |

Consecutive `super` (+ optional `suffix`) + `sub` collapse into one **vertical stack** at a single x-position (figured bass).

---

## Figured-bass stacks

Plain inversion symbols (`I64`, `V65`, `ii43`) tokenize as super + sub digit pair:

```
I64  →  base "I"  +  super "6"  +  sub "4"
```

HTML:

```html
I<span class="roman-stack">
  <sup class="roman-figured-digit">6</sup>
  <sub class="roman-figured-digit">4</sub>
</span>
```

**Sizing rule (2026-07-02):** stack superscript and subscript **digits** both use `.roman-figured-digit` at `0.58em`. Canvas uses `FIGURED_DIGIT_SCALE` (0.58) for both rows. Extension-only superscripts outside stacks (e.g. bare `V7`) still use `SUPER_SCALE` (0.68).

---

## Quality glyphs (° / ø)

Hooktheory renders diminished / half-diminished quality marks as **superscript glyphs** ahead of figured-bass digits, not as part of the roman base.

Example from Scott Joplin — *Gladiolus Rag* (SVG truth):

| Symbol | Hooktheory layout | Our tokens |
|--------|-------------------|------------|
| `viiø42` | `vii` + super `ø4` + sub `2` | `base vii`, `super ø4`, `sub 2` |
| `vii°42` | `vii` + super `°4` + sub `2` | `base vii`, `super °4`, `sub 2` |
| `vii°7/V` | `vii` + super `°7` + `/V` | `base vii`, `super °7`, `base /`, `base V` |

`readBase()` no longer absorbs `°` or `ø` (only `+` for augmented). `pushQualityGlyphParts()` prepends the glyph to the super digit (`ø4`, `°6`, …).

### Quality stack layout

Quality figured-bass uses a **two-column grid** (`.roman-stack--quality`):

```
┌────┬────┐
│ ø  │ 4  │   ← glyph col 1, super digit col 2
│    │ 2  │   ← sub digit aligns under super digit, not under glyph
└────┴────┘
```

CSS: `web-player/style.css` — `.roman-stack--quality`, `.roman-quality`, `.roman-figured-digit`.

Canvas: `drawStack()` offsets the subscript x by glyph width so digits column-align.

### Diminished circle (°)

Unicode `°` (degree sign) is too small at superscript size. We render diminished with **`○`** (U+25CB WHITE CIRCLE):

- HTML: `<span class="roman-quality roman-quality--dim">○</span>` at `0.46em`
- Canvas: `DIM_GLYPH_CHAR` / `DIM_GLYPH_SCALE` (0.46)
- Half-dim **`ø`** stays as a text glyph at `0.68em` (user-validated)

Standalone quality superscripts (`vii°7`, `vii°/ii`) use `.roman-quality-inline` wrapping glyph + digit.

---

## Scale constants (`romanNumeralCanvas.js`)

| Constant | Value | Used for |
|----------|------:|----------|
| `FIGURED_DIGIT_SCALE` | 0.58 | Stack super/sub digits (HTML + canvas) |
| `DIM_GLYPH_SCALE` | 0.46 | Diminished `○` glyph |
| `SUPER_SCALE` | 0.68 | Non-stack superscripts (`V7`, `△7`, `ø` text glyph) |
| `SUB_SCALE` | 0.58 | Non-stack subscripts (`sus4`) |
| `SUFFIX_SCALE` | 0.72 | Parenthetical suffixes |

---

## UI integration

| Component | API | Context |
|-----------|-----|---------|
| `noteIndicator.js` | `romanNumeralToHtml` | Now Playing chord label |
| `chordRing.js` | `drawRomanNumeral`, `romanNumeralToHtml` | Ring labels, tooltips, transition table |
| `timeline.js` | `drawRomanNumeral`, `romanNumeralToHtml` | Block labels, hover tooltip |

Roman Numerals toggle in controls switches between roman and letter symbols; rendering path is unchanged — only the input string differs.

Styles: `web-player/style.css` — `.roman-stack`, `.roman-stack--quality`, `.roman-quality--dim`, `.roman-figured-digit`, `.roman-quality-inline`, `.chord-roman-line`.

---

## Testing

```bash
npm run test:roman-symbols
```

Runs in order:

| Script | What it checks |
|--------|----------------|
| `romanNumeralCanvasTest.mjs` | Tokenization fixtures (inversions, sus clusters, ø/° quality) |
| `stackDigitSizingVerify.mjs` | All stack `sup`/`sub` use `.roman-figured-digit`; `°` chords use `○` |
| `halfDimSuperscriptVerify.mjs` | 21 ø/° chords from Gladiolus Rag scrape vs SVG truth — glyph not in base, quality grid markup |
| `romanSymbolCorpusTest.mjs` | Corpus smoke over `chord_db` symbol strings |

### Gladiolus reference scrape

`sacred_ring_data/harvest/scott-joplin__gladiolus-rag/scrape.json` — full harvest with per-chord SVG `rendered` arrays. Used by `halfDimSuperscriptVerify.mjs` to confirm Hooktheory superscript layout for ø/°.

---

## Extending

1. Add symbol branch in `jsonToSymbol.js` first (source of truth for the string).
2. If the new syntax needs stacked layout, extend `tokenizeRomanNumeral()` — not the UI components.
3. Mirror sizing in both `romanNumeralToHtml()` and `drawRomanNumeral()` / `measureRomanNumeral()`.
4. Add a fixture to `romanNumeralCanvasTest.mjs`; for ø/° edge cases, add a Gladiolus chord to `halfDimSuperscriptVerify.mjs` corpus or extend the scrape check.
5. Run `npm run test:roman-symbols`.

**Pitfalls:**

- Do not put `°`/`ø` in the base token — breaks alignment with Hooktheory SVG.
- Stack digit sizes must match in HTML **and** canvas (`FIGURED_DIGIT_SCALE`).
- Pronunciation (`romanNumeralSpeak.js`) is JSON-first; do not parse rendered HTML for spoken readings.

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — `jsonToSymbol.js`, chord symbol pipeline
- [PRONUNCIATION.md](./PRONUNCIATION.md) — spoken readings (separate from glyph layout)
- [BUGS.md](./BUGS.md) — BUG-003 song-load regression (`setKey`)

# Notation UI semantic helpers work log

2026-10-15: T04 bounded Android-to-PWA slice on `codex/pwa-notation`, clean base `82639a579b6fab65b7feb4b6bb4073c7346739c9`. Owner notation worker; runtime model GPT-6 Luna/medium, runtime identifier unknown.

Authority: Android baseline `801cf7984171d772afc4406ddb5c79c0cb7fd20a`, `RomanNumeralLayout.kt` pure token/stack helpers, `RomanNumeralRenderer.kt` `RomanNumeralDisplay`, `ScaleDegreeRenderer.kt` `ScaleDegreeLabel`, and `RomanNumeralTokenizerTest.kt` / semantic cases in `ScaleDegreeRendererTest.kt`. No old web/iOS runtime used.

Intent: port only pure tokenization and display semantics (BASE/SUPER/SUB/SUFFIX, unicode digit normalization, figured-bass and suspension clusters, borrowed mode labels, stack span) plus scale-degree prefix/degree/suffix parsing and spoken accidental labels. Add tests derived from native cases. No canvas measurement, React rendering, styling, routing, dependencies, shared contracts, or app wiring in this first slice.

Validation:

- `node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/vitest/vitest.mjs run --root H:/Desktop/Acquiring/Acquiring-pwa-ui-shell/pwa --config H:/Desktop/Acquiring/Acquiring/pwa/vite.config.ts src/ui/notation`: passed, 1 file / 7 tests (run receipt `T04-notation-008-focused-tests`).
- `node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/lib/tsc.js --project H:/Desktop/Acquiring/Acquiring-pwa-ui-shell/.artifacts/pwa-port/t04-tsconfig.json`: passed strict owned-source/test check (receipt `T04-notation-011-types-final`).
- The first type attempt lacked type-root resolution; the second exposed Vite ambient types unnecessary for this pure module. Local ignored config now references the installed primary Node/Vitest dependencies. No packages installed.
- Only tokenizer/display and degree-label semantics are implemented. Canvas measurement, React rendering, styles, routing, and integration checks are outside this first slice.


2026-10-15: Began the measured-rendering T04 slice from the integrated semantic commit `1028688cd33624d1cd84af5929a37b2fcc29633b`. Intent: add locally owned React SVG components and pure measurable geometry/fit helpers for Roman numerals and scale degrees, using Android `RomanNumeralRenderer.kt` and `ScaleDegreeRenderer.kt` at `801cf798`. Keep SVG glyphs hidden from assistive technology and expose full semantic labels. Add geometry/fit/markup assertions and a JSON-object borrowed-field regression. Local props remain unconsumed until coordinator wiring; no app, routing, or shared changes.


Scope added: pure browser-measured Roman/scale-degree SVG renderers with 12-step bounded fitting, preserving native Roman row offsets/scales/quality glyph and scale-degree hat geometry. Local props: RomanNumeral(display, fontSizePx=32, minFontSizePx=8, paired maxWidthPx/maxHeightPx, verticalTopGapPx, color, className, style); ScaleDegree(label, fontSizePx=48, minFontSizePx=12, paired maxWidthPx/maxHeightPx, fitToBounds, color, className, style). Browser fixture geometry/accessibility checks remain coordinator-owned.

Also corrected borrowed JSON semantics: only arrays and primitive scalar values can form a borrowed label; object fields now remain unlabelled like native JsonObject. Literal cases were extended from the Android tokenizer suite.


Validation checkpoint on the measured-rendering source:

- `node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/vitest/vitest.mjs run --root H:/Desktop/Acquiring/Acquiring-pwa-ui-shell/pwa --config H:/Desktop/Acquiring/Acquiring-pwa-ui-shell/.artifacts/pwa-port/t04-vitest.config.mjs src/ui/notation`: passed, 2 files / 12 tests (run receipt `T04-notation-033-native-literal-tests`).
- `node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/lib/tsc.js --project H:/Desktop/Acquiring/Acquiring-pwa-ui-shell/.artifacts/pwa-port/t04-tsconfig.json`: passed strict TS and TSX check (receipt `T04-notation-034-native-literal-types`).
- Test config aliases JSX runtime to the existing primary React installation. No tracked package/config/lockfile changes were made; ignored local configs were used and no packages installed. No ReactDOM package is needed by the direct React-element accessibility assertions.
- Browser rendering and cross-source integration remain coordinator gates; this worker did not run app wiring or browser QA.


Final pre-commit checks after literal native coverage and shared canvas-context caching:

- Focused Vitest passed 2 files / 12 tests (receipt `T04-notation-037-final-tests`) using ignored `t04-vitest.config.mjs` so React JSX runtime resolves from the primary installed package tree.
- Strict TypeScript passed including `.tsx` (receipt `T04-notation-038-final-types`).
- Scoped `git diff --check -- pwa/src/ui/notation` passed. Browser geometry QA and app integration have not been run in this worker; coordinator owns those gates.


2026-10-15 review correction: baseline and text-centering math now follows native `baselineForMiddle`: browser ascent/descent metrics derive `baseline=centerY+(ascent-descent)/2` and bounds `centerY±(ascent+descent)/2`. Scale degree stores and draws at native `degreeCenterYPx`, preserving the full hat-to-digit gap. Constrained SVG viewports clamp width/height and retain the intrinsic viewBox so browser aspect-ratio fitting scales the complete drawing without clipping when the minimum text size cannot fit.


Review correction validation on 2026-10-15:

- Focused Vitest passed 2 files / 13 tests (guard receipt `T04-notation-047-coordinate-tests`), including exact asymmetric ascent/descent baseline bounds, native ScaleDegree center, and tiny SVG viewBox/viewport constraints.
- Strict TS/TSX passed (receipt `T04-notation-048-coordinate-types`).
- `centeredTextBounds` mirrors Android `baselineForMiddle`; SVG `<text>` now uses explicit alphabetic baselines from those same metrics and no `dominantBaseline` override. Layout top/bottom bounds use the native centered ascent+descent half-height. SVG preserves its intrinsic viewBox while clamping viewport width/height, so narrow bounds scale the full drawing without clipping.

2026-10-15 coordinator browser acceptance intent: preserve native .28/.16 row centers and .58 figured digit scale. Initial real Chrome checks exposed SVG glyph advance overhang/rounding; inset and geometricPrecision keep the full drawing inside its viewport at normal, 320px/200% text, and 6px bounds. First retest passed all clipping/hat/semantic checks but an overly broad row assertion compared SVG em boxes rather than visible digit ink. Native constants were rechecked at frozen801cf798; revise this assertion to browser actualBoundingBoxAscent/Descent at the explicit baseline, and independently assert native baseline separation. No source row offsets changed. Run the three focused browser cases and strict combined types/unit coverage before claiming acceptance.

Coordinator acceptance2026-10-15 on integrated5f3ee4f0 plus this ink-safe viewport tree:

- `node node_modules/@playwright/test/cli.js test notation.spec.ts` from pwa:3actual Chrome cases passed in9.2s (guard receipt window3-notation-browser-accepted-20261015). Each checks21renderings, accessible labels, finite contained SVG bounds, hat/digit clearance and bounded viewports. Modes:900px normal,320px/200% text with96px slots, and6px slots smaller than minimum font. Non-tiny modes additionally compare true digit ink and exact native row baseline separation.
- Normal and narrow/large screenshots visually inspected at pwa/.artifacts/pwa-port/notation/{normal,narrow-large}.png: extensions, alterations, stacks, borrowed labels, suspensions, rests and hats remain readable without clipping/overlap. These are ignored diagnostic evidence, not shipped assets.
- `node node_modules/vitest/vitest.mjs run src/ui/notation`:2files/13tests passed in305ms (window3-notation-final-unit-20261015). `node node_modules/typescript/lib/tsc.js --noEmit`:passed on combined product and browser tests (window3-notation-final-types-20261015).
- T04 component acceptance is established for desktop Chrome. Native source geometry/semantics are preserved; platform font rasterization differs. Physical device/Safari-wide acceptance remains T27. Product consumers remain later T11/T12/T17 packages.

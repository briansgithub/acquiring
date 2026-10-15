# Notation UI semantic helpers work log

2026-10-15: T04 bounded Android-to-PWA slice on `codex/pwa-notation`, clean base `82639a579b6fab65b7feb4b6bb4073c7346739c9`. Owner notation worker; runtime model GPT-6 Luna/medium, runtime identifier unknown.

Authority: Android baseline `801cf7984171d772afc4406ddb5c79c0cb7fd20a`, `RomanNumeralLayout.kt` pure token/stack helpers, `RomanNumeralRenderer.kt` `RomanNumeralDisplay`, `ScaleDegreeRenderer.kt` `ScaleDegreeLabel`, and `RomanNumeralTokenizerTest.kt` / semantic cases in `ScaleDegreeRendererTest.kt`. No old web/iOS runtime used.

Intent: port only pure tokenization and display semantics (BASE/SUPER/SUB/SUFFIX, unicode digit normalization, figured-bass and suspension clusters, borrowed mode labels, stack span) plus scale-degree prefix/degree/suffix parsing and spoken accidental labels. Add tests derived from native cases. No canvas measurement, React rendering, styling, routing, dependencies, shared contracts, or app wiring in this first slice.

Validation:

- `node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/vitest/vitest.mjs run --root H:/Desktop/Acquiring/Acquiring-pwa-ui-shell/pwa --config H:/Desktop/Acquiring/Acquiring/pwa/vite.config.ts src/ui/notation`: passed, 1 file / 7 tests (run receipt `T04-notation-008-focused-tests`).
- `node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/lib/tsc.js --project H:/Desktop/Acquiring/Acquiring-pwa-ui-shell/.artifacts/pwa-port/t04-tsconfig.json`: passed strict owned-source/test check (receipt `T04-notation-011-types-final`).
- The first type attempt lacked type-root resolution; the second exposed Vite ambient types unnecessary for this pure module. Local ignored config now references the installed primary Node/Vitest dependencies. No packages installed.
- Only tokenizer/display and degree-label semantics are implemented. Canvas measurement, React rendering, styles, routing, and integration checks are outside this first slice.

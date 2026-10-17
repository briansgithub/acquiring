# Previous playback cards worklog
Date: 2026-10-17
Branch: codex/pwa-previous-cards
Base: 1267a84bf5b16ef38635306ef3f386e0f22f80b1
Owner: song_ui_review
Task: T12 previous-card UI

## Intent
Add accessible previous-root and previous-melody single-pitch cards using the accepted event-state helpers. Keep root preview visible for any non-null prior root, including unison; render prior melody only for INTERVAL written-pitch mode. Preserve raw source pitches, existing manual transpose once, 450 ms/current waveform, current card names/selectors, lifecycle owner, and accepted native Major label/context behavior. Do not add interval-sequence playback, ownership/timers/controllers/props/APIs, or changes outside the three assigned paths.

## Progress
- Initial state verified clean at the frozen base; no run-control recovery-required records.
- Frozen presentation rules and existing cards/event-state implementation reviewed.
- Scoped strict TypeScript check passed for PlaybackCards and its imported dependencies. Full-project check is limited by pre-existing Vitest matcher declaration mismatch in the shared root dependency tree.

- Exact three-path diff reviewed; button names preserve existing current selectors. Starting full PWA strict TypeScript check using the configured root dependency tree.

- Review refinements: previous-root playback uses native simple-mode interval pitch (including its octave), paired cards now identify Previous/Current visibly, and melody interval lookup stays off in root-only mode. Increased melody band height so native top/bottom positions remain perceptible.
- Full PWA typecheck exposed unrelated Vitest matcher type gaps in the shared root dependency installation; switching to a strict scoped compile of PlaybackCards and its imports.

- Scoped strict command: `node H:/Desktop/Acquiring/Acquiring/pwa/node_modules/typescript/bin/tsc --project .artifacts/pwa-port/tsconfig.previous-cards.json` (temporary ignored config compiles PlaybackCards.tsx plus its import graph): passed.
- `git diff --check`: passed. Browser acceptance is pending root-owned integration.

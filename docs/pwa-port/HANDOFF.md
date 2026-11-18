# PWA port: current state

Keep this page short: current pin, branch, next slices, open gates and owner questions. Append per-slice receipts (commands, results, evidence paths) to [LOG.md](LOG.md), newest first. Before older state, read [LOG.md](LOG.md) from the top.

## Pins and branch

- **Native authority:** Android `3c887223` (`tasks.json` `currentNativeAuthority`). The frozen history audit stays at `801cf798` ([HISTORY.md](HISTORY.md), [FEATURE_LEDGER.md](FEATURE_LEDGER.md)). Everything after it is in [ANDROID_DELTA.md](ANDROID_DELTA.md): rows N06–N16.
- **Branch:** `codex/pwa-continuation`, cut from `main` at `3c887223`. Commit validated slices locally. Do not push or rewrite history unless the owner asks.
- **Start of every slice:** run `python docs/pwa-port/native_drift.py`. Exit 1 means new Android work: ledger it in `android-delta-*.json` before porting the affected rows.
- **Record checks:** `python docs/pwa-port/validate_audit.py`, `python docs/pwa-port/validate_feature_ledger.py`, `python docs/pwa-port/validate_android_delta.py`. All pass as of 2026-11-18.
- **Native toolchain on this Windows machine:** `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"`, `android/local.properties` (ignored) has `sdk.dir=C:/Users/user1/AppData/Local/Android/Sdk`. Android unit tests: `cd android; ./gradlew --no-daemon -q :app:testDebugUnitTest --tests '<class>'`. Native fixture generators use the same JBR plus Gradle-cache Kotlin jars.

## Plan in progress (2026-11-18)

Ordered phases. Each slice is one validated commit:

0. **Records — done.** Re-pinned to Android `3c887223`; delta ledger, drift script, validator fixes; this page.
1. **Done.** N12 `0c466a0b`: retired the Display fps preference; the timeline draws on requestAnimationFrame from `playback-playhead.ts`. N10 `fe00b790`, partial: `song-playback-settings.ts` with the T06 `songPlaybackSettings` store, wired into Playback. Cue, voice volume and loop are stored but have no UI until N07/N09/N11.
2. **NEXT — start here.** Audio (T07/T08): Sonic port (`audio/synth/sonic.ts`, bit-exact); speech clip assets (exact bytes, SHA-256, fetched on first spoken-cue use, service-worker cached, Apache-2.0 notices); N06 pulses and Harmonic Distance; N07 spoken phrases, key-change window, voice gain, soft limiter; N11 Song-mode splice. Verify against native fixtures from `audio/synth/fixtures/generate-stream-native.py`, updating its pin.
3. N08 melody function (pure, native fixtures) and Playback UI: N09 voice dialog, N13 dial values plus N04, N16 root-only melody and scrub, N03 contextual help, melody Help article.
4. N14 Library home relayout (rewrite `library.spec.ts:49` against inner-list scroll per the owner decision), then N15 example shuffle.
5. Resume the earlier queue: T13/T08 gates, T22, then Aural last, then T23–T28.

## Owner decisions in force

- Policy A: a card double-click may start mic listening after 800 ms, including the first permission prompt.
- Priority: Playback UI, then the singing tool, then cards (accepted). Aural quiz, T15 song-rank and family trees last.
- 2026-11-18: pin `3c887223`; ship exact speech clips downloaded on first use; follow the new Library layout for Settings Back (replaces options A–E).

## Open gates (not accepted)

- Trusted-tab, BFCache, Safari, Pixel and physical mic.
- Instrumented audio-stress transport error (T08).
- Native motion, density and inertia, plus the 32 ms marker tween.
- Artists paging, order, fold index and Found N.
- T22: UI, service and native lenient parsing.
- Auth, sync, install, a11y and release (T23–T28).
- Existing bundle-size warning.

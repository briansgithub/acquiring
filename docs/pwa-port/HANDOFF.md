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
2. **Done.** Audio, all bit-exact against native fixtures.
   - Sonic port `0129c77f`.
   - Renderer N06/N07/N11 `f7fdd086`: `spoken-cues.ts`, pulses, speech, limiter, splices. `generate-stream-native.py` was re-pinned, and `cue-driver.kt.txt` uses the real clips.
   - Timeline plus N08 theory `48f89cad`: melody fold, cue fields, `melody-function.ts`. `generate-timeline-native.py` was re-pinned.
   - Speech pack and worker plumbing `dbc52498`: `public/voice` with its manifest, `voice-pack.ts`, the worker `voices` op, and the transport.
   - Fixture generators run with `PATH` = JBR bin plus `PYTHONUTF8=1`.
3. **Done.** UI `dbd6d703`: N09 voice dialog, N08 caption plus Help article, N16 root-only melody.
4. **Done.** N14 Library relayout `34ca9ffa`.
   - Search first; the Favorites box (or search results) scrolls internally; All Songs follows.
   - Settings Back restores the inner list. `library.spec` 8/8, including the old `:49` test.
   - Found: after Settings Back, the reopened catalog reader reports `error` while still showing the remembered rows. This is probably the old CI "Received 110" cause; open.
5. **Done.** N11 Song mode `0f3074e2`: Loop/Song toggle, saved per song; Song mode continues into the next section.
6. **Done.** N03 contextual help `9e976557`, marked in the feature ledger `89004057`. N15 example shuffle `a8b04d5f`: ported with native unit cases.
7. **Verified, `2ef98ae7`.**
   - The full browser suite ran on Windows/system Chrome: 110 passed and 2 skipped. All 8 failures now pass: the catalog fixtures use short temp roots on Windows (MAX_PATH), and the control and store counts were updated.
   - The N15 shuffle row test passes.
   - `playback.spec` "singing owner switch" is a known flake.
8. **NEXT — start here.**
   1. N15 browser proof against an installed Aural catalog. Extend `scripts/catalog/make-aural-statistics-browser-fixture.py` so `catalog_song` has title and artist, then shuffle through to Playback opening on the chorus.
   2. N13 + N04 rotary dials with in-dial values.
   3. Wire the N11 in-block splice: transport continuation op, splitting PCM at `PlaybackSplice` frames, section-follow.
   4. Saxophone icon; the Library Aural Quiz row (Aural is last).
   5. Investigate the Library reader `error` phase after Settings Back.
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

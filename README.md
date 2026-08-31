# Acquiring

Acquiring is a three-platform music-theory and ear-training product. The monorepo contains separate native/runtime implementations that share catalog and behavioral contracts.

## Applications

| Platform | Location | Technology |
| --- | --- | --- |
| Web | `web/` | JavaScript, HTML, CSS, Tone.js |
| Android | `android/` | Kotlin and Jetpack Compose |
| iOS | `ios/` | Swift and SwiftUI |

The applications remain platform-native. Cross-platform agreement is enforced through `contracts/`, not shared runtime code.

## Quick start

Launch the web application:

```bash
python tooling/commands/launch_player.py
```

Run Android unit tests:

```powershell
android\gradlew.bat -p android testDebugUnitTest
```

Open `ios/Acquiring.xcodeproj` in Xcode to build the iOS application.

Development utilities, catalog research, validation harnesses, and operational
commands are grouped under `tooling/` so the three application directories stay
prominent at the repository root.

## Runtime data

Bulky catalog, playback, and harvest data lives outside Git in `acquiring_data/` by default. Set `ACQUIRING_DATA` or copy `acquiring_data.config.json.example` to `acquiring_data.config.json` to use another location. Legacy Sacred Ring configuration names remain readable for one compatibility release; see `docs/data-root.md` for precedence and migration safety.

## Documentation

- `docs/architecture.md` — product and platform boundaries
- `docs/data-root.md` — runtime-data location and compatibility rules
- `docs/web-architecture.md` — web engine and oracle internals
- `docs/feature-parity.md` — feature status across platforms
- `docs/porting-plan.md` — Android-to-iOS implementation roadmap
- `contracts/catalog/` — downloadable SQLite catalog contract
- `contracts/fixtures/` — shared behavioral fixtures
- `tooling/` — development, validation, catalog, and operational utilities

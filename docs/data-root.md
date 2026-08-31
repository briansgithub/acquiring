# Runtime data root

Acquiring keeps downloaded catalogs, playback caches, and harvest artifacts outside Git. The default location is `acquiring_data/` at the repository root.

Resolution order:

1. `ACQUIRING_DATA`
2. `acquiring_data.config.json` with a non-empty `dataRoot`
3. Legacy `SACRED_RING_DATA`
4. Legacy `sacred_ring_data.config.json`
5. The default `acquiring_data/` directory

Copy `acquiring_data.config.json.example` to `acquiring_data.config.json` when a checkout should use another absolute location. Acquiring names always take precedence over legacy names.

The Sacred Ring environment and configuration names are compatibility aliases for one release and emit deprecation warnings. At the default location, an existing `sacred_ring_data/` directory is renamed only when `acquiring_data/` is absent. If both directories exist, Acquiring uses `acquiring_data/`, warns clearly, and never merges or deletes either directory.

`ACQUIRING_ANDROID_DIR` may override the Android checkout used by catalog tooling. `SACRED_RING_ANDROID_DIR` is its one-release compatibility alias; without an override, tooling uses the monorepo's `android/` sibling.

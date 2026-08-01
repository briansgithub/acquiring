# Sacred Ring

Sacred Ring is a music theory engine that reverse-engineers Hooktheory TheoryTab chord JSON into correct piano voicings and Roman numeral symbols. It includes an interactive web-player, a closed-loop validation oracle, and an integrated ear-training quiz system.

---

## 🏗️ Core Data Architecture

The project is designed with a **Modular Data Root**. All bulky runtime data and databases live outside the git-tracked codebase in a single portable directory (default: `sacred_ring_data/`).

### 🗄️ The Catalog Database: `hooktheory_catalog.db`
This is the master index for the project.
- **Path**: `sacred_ring_data/catalog/hooktheory_catalog.db`
- **Purpose**: Stores the full catalog of ~39k scraped Hooktheory songs, including metadata (Artist, Title, Slug), complexity metrics, and frequency statistics used by the quiz engine.
- **Interaction**: Accessed via the `Song Selector` in the web player and managed by the `hooktheory_catalog` module.

### 🎵 Playback Cache
- **Path**: `sacred_ring_data/playback/.hooktheory_cache/`
- **Purpose**: Contains the actual chord and melody JSON data for every song, organized by artist and title. The web player serves playback directly from this cache.

---

## 🚀 Quick Start

1. **Launch the Player**:
   ```bash
   python launch_player.py
   ```
   *This starts the server on `http://127.0.0.1:3000` and opens your browser.*

2. **Explore the Catalog**:
   Use the **Song Selector** (left panel) to search the ~39k songs indexed in the catalog database.

3. **Run Quizzes**:
   Toggle the **Quiz** mode in the top-right corner to practice ear training using real-world song data.

---

## 📚 Documentation Index

For detailed guides, see [Documentation/INDEX.md](./Documentation/INDEX.md).

- [Architecture Overview](./Documentation/ARCHITECTURE.md) — How the engine and oracle work.
- [Data Handoff](./HANDOFF.md) — Current repository state and session context.
- [Oracle Guide](./ORACLE_GUIDE/README.md) — How to run the closed-loop validation harness.

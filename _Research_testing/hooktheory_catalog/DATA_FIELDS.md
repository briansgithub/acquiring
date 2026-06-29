# Hooktheory Catalog — Data Fields Reference

Maps every field available from Hooktheory enrichment (page HTML + public API `?fields=ID,xmlData,song,jsonData`) to where it lives in `data/hooktheory_catalog.db`, and what is intentionally **not** stored.

**Schema version:** extended enrichment (2026-06-29)

---

## Enrichment inputs (not stored as rows)

| Source | Fields consumed | Stored? |
|--------|-----------------|---------|
| TheoryTab page HTML | 5× SongMetrics, `difficulty_label` | Yes → `song_metrics`, `songs.difficulty_label` |
| Public API top-level | `ID`, `song` | Yes → `song_sections.hooktheory_id`, `song_details.hooktheory_song_name` |
| Public API `jsonData` | See sections below | Partial — see tables |

---

## `songs` — discovery + lifecycle

| Column | Source | Used by app today? |
|--------|--------|-------------------|
| `slug`, `artist_slug`, `title_slug`, `artist`, `title`, `url` | Meili / crawl discovery | Yes — catalog list, export |
| `difficulty_label` | Page HTML | Yes — display |
| `first_seen_at`, `last_checked_at` | Catalog | Yes — ordering, freshness |
| `status`, `error_message` | Enricher | Yes — queue / daemon |
| `discovery_source` | Discover phase | Yes — provenance |

---

## `song_metrics` — Hooktheory SongMetrics

| Column | Source | Used today? |
|--------|--------|-------------|
| `chord_complexity_ht` … `chord_bass_melody_ht` | Page HTML | Yes — `complexity_rating` |
| `complexity_rating` | Weighted metrics or fallback | Yes — sort, export |
| `metrics_source` | `hooktheory_page` \| `computed_fallback` | Yes — quality flag |
| `metrics_fetched_at` | Enricher timestamp | Internal |

---

## `song_stats` — chord aggregates (all sections)

| Column | Source | Used today? |
|--------|--------|-------------|
| `unique_chords` | Chord signature set | Yes — complexity fallback, export |
| `unique_transitions` | Adjacent signature pairs | Yes |
| `total_chords` | Non-rest chord count | Yes |
| `section_count` | Section tab count | Yes |
| `borrowed_chord_count` | `chord.borrowed` | **Stored, not yet consumed** |
| `applied_chord_count` | `chord.applied` | **Stored, not yet consumed** |
| `modified_chord_count` | adds/omits/alterations/suspensions | **Stored, not yet consumed** |
| `rest_chord_count` | `chord.isRest` | **Stored, not yet consumed** |
| `avg_chord_duration` | Mean `chord.duration` | **Stored, not yet consumed** |
| `stats_computed_at` | Enricher timestamp | Internal |

---

## `song_details` — song-level API metadata (new)

| Column | Source | Used today? |
|--------|--------|-------------|
| `hooktheory_song_name` | API `song` (first section) | **Stored, not yet consumed** |
| `primary_section_id` | First section `songId` | **Stored, not yet consumed** |
| `data_version` | `jsonData.version` | **Stored, not yet consumed** |
| `primary_key_tonic`, `primary_key_scale` | First `keys[]` entry | **Stored, not yet consumed** |
| `bpm`, `swing_factor` | First `tempos[]` entry | **Stored, not yet consumed** |
| `time_sig` | First `meters[]` → e.g. `4/4` | **Stored, not yet consumed** |
| `has_melody` | Any section with notes | **Stored, not yet consumed** |
| `melody_line_count` | Max voices across sections | **Stored, not yet consumed** |
| `total_notes` | Sum non-rest notes | **Stored, not yet consumed** |
| `unique_scale_degrees` | Max distinct `note.sd` | **Stored, not yet consumed** |
| `has_lyrics` | Non-empty `lyrics.values` | **Stored, not yet consumed** |
| `youtube_id`, `youtube_sync_start`, `youtube_sync_end` | `jsonData.youtube` | **Stored, not yet consumed** |
| `content_fp` | `jsonData.fp` | **Stored, not yet consumed** |
| `pickup` | `jsonData.pickup` | **Stored, not yet consumed** |
| `key_change_count` | Distinct tonic+scale across sections | **Stored, not yet consumed** |
| `total_beats` | Sum of section `endBeat` | **Stored, not yet consumed** |
| `extra_json` | See JSON bundle below | **Stored, not yet consumed** |
| `details_fetched_at` | Enricher timestamp | Internal |

### `extra_json` bundle (song-level)

| Key inside JSON | Source | Used today? |
|-----------------|--------|-------------|
| `lyrics` | Per-section `lyrics` | **Not yet consumed** |
| `bands` | Per-section `bands` | **Not yet consumed** |
| `breaks` | Per-section `breaks` | **Not yet consumed** |
| `keyFrames` | Per-section `keyFrames` | **Not yet consumed** |
| `keys` | Full key-change maps per section | **Not yet consumed** |
| `tempos` | Full tempo maps per section | **Not yet consumed** |
| `meters` | Full meter maps per section | **Not yet consumed** |
| `internal_sections` | `jsonData.sections` (Hookpad markers) | **Not yet consumed** |
| `visible_melodies` | `visibleMelodies` | **Not yet consumed** |
| `active_melody_index` | `activeMelodyIndex` | **Not yet consumed** |
| `external_mp3` | `settings.externalMP3*` | **Not yet consumed** |

---

## `song_sections` — per-section API metadata

| Column | Source | Used today? |
|--------|--------|-------------|
| `section_name`, `song_id` | DOM tabs + API | Yes — section inventory |
| `hooktheory_id` | API `ID` | **Stored, not yet consumed** |
| `end_beat` | `jsonData.endBeat` | **Stored, not yet consumed** |
| `chord_count`, `note_count` | Array lengths | **Stored, not yet consumed** |
| `key_tonic`, `key_scale` | First `keys[]` | **Stored, not yet consumed** |
| `bpm`, `swing_factor`, `time_sig` | First tempo/meter | **Stored, not yet consumed** |
| `melody_line_count`, `has_melody` | `notes` structure | **Stored, not yet consumed** |
| `pickup`, `content_fp` | Section jsonData | **Stored, not yet consumed** |
| `borrowed_chord_count`, `applied_chord_count`, `modified_chord_count` | Section chords | **Stored, not yet consumed** |
| `section_data_json` | See below | **Stored, not yet consumed** |

### `section_data_json` bundle (per section)

| Key | Source | Used today? |
|-----|--------|-------------|
| `keys`, `tempos`, `meters` | Full change maps | **Not yet consumed** |
| `internal_sections` | `jsonData.sections` | **Not yet consumed** |
| `youtube` | Section youtube block | **Not yet consumed** |
| `lyrics`, `bands`, `breaks`, `keyFrames` | Section jsonData | **Not yet consumed** |
| `visibleMelodies`, `activeMelodyIndex` | Melody UI state | **Not yet consumed** |
| `externalMp3Url`, `fp`, `version` | Settings / meta | **Not yet consumed** |

---

## API `jsonData` fields — intentionally NOT stored

These are available in the API response during enrichment but omitted from the DB (size, editor noise, or redundant with `.hooktheory_cache/`).

| Field | Reason not stored |
|-------|-------------------|
| `chords[]` (full array) | Large; use `.hooktheory_cache/` or re-fetch by `song_id` |
| `notes[]` / multi-voice note objects | Large; only counts/flags stored |
| `inactiveNotes` | Huge duplicate of melody data |
| `cursor` | Hookpad editor cursor — not catalog metadata |
| `loopGui` | Editor loop UI state |
| `soloAndMutedMelodies` | Playback mix state |
| `settings` (bulk) | Editor UI prefs; only `externalMP3*` extracted to `extra_json` |
| `xmlData` | Fallback format; jsonData used when present |

### Per-chord / per-note fields (inside unstored arrays)

Available when re-parsing cached JSON; not duplicated in catalog:

| Chord fields | Note fields |
|--------------|-------------|
| `root`, `beat`, `duration`, `type`, `inversion` | `sd`, `octave`, `beat`, `duration` |
| `applied`, `borrowed`, `adds`, `omits`, `alterations`, `suspensions` | `isRest`, `recordingEndBeat` |
| `pedal`, `alternate`, `isRest`, `recordingEndBeat` | |

Chord **signatures** for uniqueness are computed at enrich time; individual chord rows are not persisted.

---

## Test batch (2026-06-29)

Re-enrichment script: `_Debug_testing/re_enrich_test_batch.cjs`

```bash
node _Debug_testing/re_enrich_test_batch.cjs --limit 20
```

Report: `_Debug_testing/hooktheory_catalog/re_enrich_report.json`

Batch = first 20 songs by `first_seen_at` (discovery order).

**2026-06-29 run:** `20/20 ok` in ~2m 13s. Report: `_Debug_testing/hooktheory_catalog/re_enrich_report.json`

Prior to this run only 5 rows were `enriched`; the batch re-processes all 20 regardless of prior status.

---

## Future use ideas

- Filter catalog by `primary_key_tonic`, `bpm`, `has_melody`, `key_change_count`
- Detect content changes via `content_fp`
- Link to YouTube via `youtube_id`
- Section-aware playback using `song_sections` + cached JSON
- Corpus analysis on `borrowed_chord_count` / `applied_chord_count`
- Full progression export: join `song_sections.song_id` → API/cache, not catalog BLOBs

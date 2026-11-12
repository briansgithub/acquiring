# Aural catalog database

Guide to the snapshot published as
[aural-catalog.db.gz](https://github.com/briansgithub/acquiring/releases/download/aural-catalog-v3-64cfa299cc74/aural-catalog.db.gz).

This file is the offline harmonic index behind Aural Quiz. It lists songs, sections, normalized chord runs, and every observed progression of two or more chords. The app browses it directly. Nothing in this database is mined at read time.

## Identity

| | |
|---|---|
| Schema | `aural-catalog-3` |
| Snapshot | `64cfa299cc740dd9a1daf2cefc837bf1db80be9b2caa00626f674ea04b0c2243` |
| Normalization | `aural-normalizer-1` |
| Loop reduction | `unique-transitions-1` |
| Sequences | 17,272,900 retained (18,557,875 before loop reduction) |
| Unpacked size | 1,928,265,728 bytes |
| SHA-256 | `561ee85ecdc26448d0b5bac754a762cce3c4f040100c211c948b649e7a224982` |
| Release | [aural-catalog-v3-64cfa299cc74](https://github.com/briansgithub/acquiring/releases/tag/aural-catalog-v3-64cfa299cc74) |
| Source revision | `c01d433b3b6b15681c4b5bafb1ffc954cdfbf976` |

Confirm those values from `metadata` after opening the file. The snapshot id is a hash of the catalog schema, the normalizer version, the source database bytes, the song list, and the exporter source. A byte-identical musical catalog can still get a new snapshot id when the exporter changes.

The database is an immutable snapshot. Open it read-only. The bytes are kept out of git; this repository records the producer, the snapshot id, and the checksum.

## Where it came from

The name `aural-catalog.db` first appears on 2026-09-17 in commit `79df88b` (“Index exhaustive aural sequences and acquire CC0 popularity weights”), with the Android reader in `c7ad144` the same day. That first database was schema `aural-catalog-1`. It replaced a multi-gigabyte progression database with one suffix index of every confidently normalized chord sequence, so the quiz can search the whole corpus and open a passage without mining during practice.

Schema v3, with mode and starting-chord grouping, was exported on 2026-09-25. The same day’s loop-reduction rebuild (`020f8ef`) dropped repeated chord cycles and left 17,272,900 sequences. Snapshot `dbbac5ef03ceec5e8d5e0f5b04e68e8a9ac968a44cf0b848fbea9cd44d5c8c2f` is that catalog.

This file is the 2026-09-28 rebuild of that same loop-reduced catalog, first recorded in `ee37a312` (“Complete Aural Quiz catalog browsing controls”). The musical sequence count is unchanged. Two indexes were added so the default browse order — distinct songs, then occurrences, then length — can be read from `catalog_range`. The snapshot id and checksum changed because the exporter source is part of the snapshot hash, and the file grew from 1,628,401,664 bytes to 1,928,265,728 bytes.

The gzip at the URL above was published on 2026-10-02 in `c01d433b` (“Deliver full v3 example catalog automatically and from Settings”), tag `aural-catalog-v3-64cfa299cc74`. That release is what the app downloads.

## The other release files

Keep the three databases from one release together. Evidence is valid only when its `metadata.catalog_snapshot` equals this file’s `snapshot_id`.

| Asset | Unpacked size | Role |
|---|---:|---|
| `aural-catalog.db.gz` | 1,928,265,728 | This file. Songs, sections, runs, and the progression index. |
| `aural-evidence.db.gz` | 45,502,464 | Coverage stats for the information panel. |
| `aural-popularity.db.gz` | 6,619,136 | ListenBrainz score and confidence per song. |

Release page: https://github.com/briansgithub/acquiring/releases/tag/aural-catalog-v3-64cfa299cc74

`aural-popularity.db` has `popularity(song_id, score, confidence, provider_url, measured_at)` and metadata keys `snapshotId` and `attribution`. `score` is 0–1. The app displays it as 0–100 with one decimal. The Songs tab sorts by that score, then title, artist, and id. Songs with no popularity row sort last.

`aural-evidence.db` has `evidence(pattern_id, stats)` and `denominator(view, length, total)`. `stats` is gzip JSON. Pattern ids are computed fingerprints of the token sequence. They are lookup keys for evidence. They are not a column in the catalog.

Audio and the Library song record live in the separate song catalog. Join them on `catalog_song.id`, which is the library slug. This file can reconstruct the chord passage from `catalog_section.source`.

This catalog also creates an empty `popularity` table and sets `metadata.popularity_version` to `unavailable`. Read scores from `aural-popularity.db`.

## Open the file

```powershell
python -c "import gzip,shutil; shutil.copyfileobj(gzip.open(r'aural-catalog.db.gz','rb'), open(r'aural-catalog.db','wb'))"
sqlite3 "file:aural-catalog.db?mode=ro&immutable=1"
```

```sql
SELECT key, value FROM metadata;
PRAGMA integrity_check;   -- one slow pass over the 1.9 GB file
```

Expect:

- `schema_version` = `aural-catalog-3`
- `snapshot_id` = the snapshot above
- `normalization_version` = `aural-normalizer-1`
- `sequence_reduction_version` = `unique-transitions-1`
- `sequence_count` = `17272900`
- `raw_sequence_count` = the count before loop reduction
- `popularity_version` = `unavailable`

`immutable=1` is appropriate for a snapshot that will not change. It also skips journal sidecars.

## What a progression is

A progression is a contiguous run of chord changes inside one song section. Adjacent identical chords are already collapsed, and the original beat span is kept on the position record. Uncertain chords, overlapping timing, a missing key, and similar failures are omitted from the runs. `catalog_section.diagnostics` is plain JSON listing those skipped events.

The same musical object is stored once per analysis view:

| `view` | Identity |
|---|---|
| `harmony` | Function in the song’s key. Inversions share an identity. Display `positions[].degree`. |
| `harmony_bass` | Function plus inversion and bass interval. Display `positions[].roman`. |
| `relative_harmony` | The same function rewritten in the relative major. Display `degree`. |
| `relative_harmony_bass` | Relative major, with inversion and bass. Display `roman`. |

In the app, Analysis uses `harmony` or `harmony_bass`. Relative major uses the `relative_*` views. Distinguish inversions selects the bass view. Filter by mode adds `catalog_range.mode`.

`catalog_range.mode` is the original key’s scale, including on relative views: `major`, `minor`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `locrian`, `harmonicMinor`, `phrygianDominant`.

Roman text is the display label. The identity is the canonical JSON token stored in `catalog_run.tokens` and `catalog_token.token`. On a relative view, `catalog_run.key_json` is the relative major and `source_key_json` is the original key. Both are plain JSON `{"tonic","scale"}`. Tonics use ASCII `b` and `#`.

## How a sequence is addressed

Progressions are stored as suffix ranges, one row per length window that shares an occurrence set. There are 17.2 million sequences and far fewer `catalog_range` rows. Query the ranges. Expand a single window when a specific length is needed.

`catalog_range` columns:

| Column | Meaning |
|---|---|
| `start`, `end` | Inclusive ranks in `catalog_suffix`. Every rank in that span is one occurrence of the same token string. |
| `min_length`, `max_length` | Chord counts that share that exact occurrence set. One quiz row is one length inside the window. |
| `songs` | Distinct songs in the interval. |
| `end - start + 1` | Occurrences, including repeats inside a song. |
| `upper_score` | Ranking bound for the longest length: `log2(length) * log2(1 + songs) * log2(1 + effective occurrences)`. Effective occurrences are non-overlapping matches, capped at four per song. The bound is for the longest length in the window. |
| `start_group`, `start_group_label` | Bucket of the first chord. |

The starting-chord id looks like `natural:5:upper:major:minor` and is `accidental:degree:case:quality:seventhQuality`. The label is the broad Roman bucket (`I`, `V7`, `♭VI`, `iiø7`). Degree, major/minor case, triad quality, and seventh quality each get their own bucket. Inversions, suspensions, added tones, and applied denominators stay in the numerator’s bucket, so `V65` and `V7` can share a label.

`catalog_suffix.rank` is 0-based and matches `catalog_range.start` / `end`. Each suffix row is `(run_id, offset)` plus the source chord indexes of that single chord. For a progression of length `L`, the passage runs from `start_index` at `offset` to `end_index` at `offset + L - 1` on the same run. Those indexes are inclusive positions in the section’s `chords` array.

`catalog_array` holds one blob, `suffix_locations`: little-endian int32 pairs `(run_id, offset)` in rank order, 8 bytes per rank. `catalog_suffix` is the same map and is the table to query.

Loop reduction (`unique-transitions-1`) already removed lengths that are only a shorter progression repeated, such as a second full `I–V` cycle. Source runs, passage timing, and pattern ids are unchanged. On this snapshot the ranges are already reduced.

## Tables

```sql
CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE catalog_song(id TEXT PRIMARY KEY, title TEXT, artist TEXT, url TEXT);
CREATE TABLE catalog_section(id TEXT PRIMARY KEY, song_id TEXT, revision TEXT, name TEXT, source BLOB, diagnostics TEXT);
CREATE TABLE catalog_run(
  id INTEGER PRIMARY KEY,
  stable_id TEXT UNIQUE,
  view TEXT,
  song_id TEXT,
  section_id TEXT,
  revision TEXT,
  tokens TEXT,            -- gzip JSON array of identity strings
  positions TEXT,         -- gzip JSON array, parallel to tokens
  key_json TEXT,
  source_key_json TEXT);
CREATE TABLE catalog_suffix(
  rank INTEGER PRIMARY KEY,
  run_id INTEGER,
  offset INTEGER,
  start_index INTEGER,
  end_index INTEGER);
CREATE UNIQUE INDEX suffix_location ON catalog_suffix(run_id, offset);
CREATE TABLE catalog_range(
  id INTEGER PRIMARY KEY,
  view TEXT,
  mode TEXT,
  start_group TEXT,
  start_group_label TEXT,
  start INTEGER,
  end INTEGER,
  min_length INTEGER,
  max_length INTEGER,
  songs INTEGER,
  upper_score REAL);
CREATE TABLE catalog_token(token TEXT PRIMARY KEY, label TEXT, inversion_label TEXT);
CREATE TABLE popularity(song_id TEXT PRIMARY KEY, score REAL, confidence REAL, provider_url TEXT, measured_at TEXT);
CREATE TABLE catalog_array(name TEXT PRIMARY KEY, data BLOB);
```

Indexes used by browse queries:

- `range_view_mode (view, mode, start_group, upper_score DESC)` — Recommended order
- `range_view_start (view, start_group, upper_score DESC)`
- `range_frequency (view, songs DESC, (end-start+1) DESC, max_length DESC)` — Most songs
- `range_mode_frequency (view, mode, start_group, songs DESC, (end-start+1) DESC, max_length DESC)` — Most songs with a mode or starting-chord filter

`catalog_run.tokens` and `positions` are gzip-compressed UTF-8 JSON stored as blobs. `catalog_section.source` is gzip JSON of the original extracted section (`sectionName`, `chords`, `metadata.keys`). `diagnostics`, `key_json`, and `source_key_json` are plain text.

A position object is `{startIndex, endIndex, startBeat, endBeat, degree, roman, notes, rootMidi, bassMidi, key, inversion, varyingBass}`. `startIndex` and `endIndex` cover the collapsed source chords for that one harmonic state.

`catalog_token.label` is the root-position Roman numeral. `inversion_label` is the figured-bass Roman numeral. `token` is the canonical JSON identity.

## Queries the app uses

Filter `catalog_range` first. Decoding every run is the expensive path.

Most songs, the default order:

```sql
SELECT id, mode, start_group_label AS starts,
       min_length, max_length, songs,
       (end - start + 1) AS occurrences,
       upper_score, start, "end"
FROM catalog_range
WHERE view = 'harmony'
ORDER BY songs DESC, (end - start + 1) DESC, max_length DESC
LIMIT 30;
```

Major-key progressions that start on V:

```sql
SELECT start_group_label, min_length, max_length, songs,
       "end" - start + 1 AS occurrences, start, "end"
FROM catalog_range
WHERE view = 'harmony'
  AND mode = 'major'
  AND start_group_label = 'V'
ORDER BY songs DESC, ("end" - start + 1) DESC, max_length DESC
LIMIT 30;
```

The other browse orders use the same filters:

- Recommended: `ORDER BY upper_score DESC`
- Longest: `ORDER BY max_length DESC, songs DESC, (end - start + 1) DESC`
- Shortest: `ORDER BY min_length ASC, songs DESC, (end - start + 1) DESC`

Pick one length `L` with `min_length <= L <= max_length`. Songs for that result, before popularity sorting:

```sql
SELECT DISTINCT song.id, song.title, song.artist
FROM catalog_suffix s
JOIN catalog_run r ON r.id = s.run_id
JOIN catalog_song song ON song.id = r.song_id
WHERE s.rank BETWEEN :start AND :end
ORDER BY song.title COLLATE NOCASE, song.artist COLLATE NOCASE, song.id;
```

One row per occurrence. `start_index` and `end_index` index the section’s `chords` array.

```sql
SELECT song.id, song.title, song.artist, section.name,
       s.start_index, e.end_index, s.run_id, s.offset
FROM catalog_suffix s
JOIN catalog_suffix e
  ON e.run_id = s.run_id AND e.offset = s.offset + :length - 1
JOIN catalog_run r ON r.id = s.run_id
JOIN catalog_song song ON song.id = r.song_id
JOIN catalog_section section ON section.id = r.section_id
WHERE s.rank BETWEEN :start AND :end
ORDER BY song.id, section.id;
```

Find a song, then its sections:

```sql
SELECT id, title, artist, url
FROM catalog_song
WHERE title LIKE '%Kids%' COLLATE NOCASE;

SELECT id, name, revision
FROM catalog_section
WHERE song_id = :slug
ORDER BY name COLLATE NOCASE, id;
```

Chord vocabulary for a search chip:

```sql
SELECT label, inversion_label
FROM catalog_token
WHERE label LIKE 'V%'
LIMIT 40;
```

Use `label` when inversions share an identity, and `inversion_label` when the view ends in `harmony_bass`.

## Read the chord labels

SQL returns the gzip blobs as bytes. This prints the Roman numerals for one chosen length inside a range:

```python
import gzip, json, sqlite3

db = sqlite3.connect("file:aural-catalog.db?mode=ro&immutable=1", uri=True)

start, end, length = 0, 0, 2  # start, end, and one length from catalog_range
run_id, offset = db.execute(
    "SELECT run_id, offset FROM catalog_suffix WHERE rank = ?",
    (start,),
).fetchone()
view, tokens, positions, key_json, source_key_json = db.execute(
    "SELECT view, tokens, positions, key_json, source_key_json FROM catalog_run WHERE id = ?",
    (run_id,),
).fetchone()

chords = json.loads(gzip.decompress(positions))[offset:offset + length]
field = "roman" if view.endswith("harmony_bass") else "degree"
print(view, " ".join(chord[field] for chord in chords))
print("analysis key", key_json)
print("source key", source_key_json)

# Original section, including chords[start_index:end_index]
section_id = db.execute(
    "SELECT section_id FROM catalog_run WHERE id = ?", (run_id,)
).fetchone()[0]
source, diagnostics = db.execute(
    "SELECT source, diagnostics FROM catalog_section WHERE id = ?",
    (section_id,),
).fetchone()
section = json.loads(gzip.decompress(source))
print(section["sectionName"], diagnostics)
```

`json.loads(gzip.decompress(tokens))` is the identity array. Compare those strings, or the `catalog_token.token` values, when deciding that two chords are the same. Comparing Roman labels will merge distinct tokens and split identical ones.

## How the app walks a page

The reader streams `catalog_range` in the selected sort, using the indexes above. A range whose `min_length` and `max_length` differ is split in half and both halves go back on the frontier. When the window is a single length, the reader checks loop reduction, the chord-search query, and the popularity cutoff, then counts songs and occurrences for that exact token string. A page is emitted only when no unseen range can outrank it. Search and chord-count filters apply to the whole catalog.

The Songs list joins `catalog_suffix` to `catalog_run` and `catalog_song` for ranks `start` through `end`, then orders by the popularity overlay. Example queues make the same join and also require the suffix row `offset + length - 1` so each hit is one section passage. Playback reads `catalog_section.source` for the chord events. Opening the full song player loads the library record with the same slug.

## Practical limits

- Stay on `catalog_range` until a row is selected. The frequency indexes match the browse queries above.
- A range row is a length window. Choose one length before treating `start`/`end` as a single progression.
- `upper_score` and `songs` describe the stored interval. The exact quiz score also applies popularity, variety, and favorites at read time, from the separate popularity file and from local user data.
- `PRAGMA integrity_check` reads the whole file. Run it once after decompressing.
- The snapshot, evidence, and popularity overlay from this release belong together. A newer catalog snapshot needs evidence rebuilt for that snapshot id. Popularity is versioned independently and can stay put across catalog rebuilds when its own checksum is unchanged.

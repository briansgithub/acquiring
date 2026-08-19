# MIDI-to-Theory Analyzer

This subsystem renders Hooktheory section JSON to Standard MIDI Files and
analyzes SMF type 0/1 files back into ranked, Hooktheory-compatible musical
theory. The inverse is intentionally probabilistic: MIDI pitches do not uniquely
determine spelling, function, chord modifiers, or section boundaries.

The parent Node repository owns the canonical implementation. Android remains a
fixture-tested consumer/port; there is no third on-device analyzer in v1.

## Quick start

On Windows, double-click [`shortcuts/0 - MIDI Tools Menu.cmd`](../shortcuts/0%20-%20MIDI%20Tools%20Menu.cmd),
or drag a `.mid`/`.midi` file onto [`shortcuts/1 - Analyze MIDI.cmd`](../shortcuts/1%20-%20Analyze%20MIDI.cmd).
Drag a Hooktheory section `.json` file onto
[`shortcuts/2 - Theory JSON to MIDI.cmd`](../shortcuts/2%20-%20Theory%20JSON%20to%20MIDI.cmd).
The setup checker is [`shortcuts/4 - Check Setup.cmd`](../shortcuts/4%20-%20Check%20Setup.cmd).

The same friendly entry point works on Windows, macOS, and Linux from a terminal:

```powershell
npm run midi
npm run midi -- analyze "C:/Music/My Song.mid"
npm run midi -- render "C:/Music/section.json"
npm run midi:doctor
```

Analysis and rendering default to a new file beside the input. Existing files
are not silently replaced; an unused numbered name is selected automatically.
Use `npm run midi -- help` for all guided and advanced commands.

## Architecture

The forward and inverse paths meet at the typed harmonic contract in
`web-player/lib/harmonicContract.js`:

```text
Hooktheory JSON -> canonical sound/label intent -> notes/symbols -> MIDI
       ^                                                    |
       |                                                    v
 ranked legal objects <- forward-fit + Viterbi <- normalized SMF events
```

`soundIntent` and `labelIntent` are separate because some Hooktheory policies,
notably applied-plus-borrowed chords, intentionally label a different context
from the sounding target. Invalid roots, inversions, modes, and modifier values
are quarantined rather than silently reinterpreted. Rests are suppressed at the
public decoder boundary.

The deterministic inverse pipeline:

1. Parses SMF type 0/1 while retaining PPQ, ticks, tempo, meter, key-signature,
   program, track-name, velocity, sustain, and marker evidence.
2. Rejects type 2 and enforces hard limits of 100 MiB and 5,000,000 raw events.
3. Assigns soft melody/bass/harmony/accompaniment/drum roles and excludes channel
   10 percussion from pitched evidence.
4. Builds duration/onset/bass chroma on a beat grid, estimates ranked key
   candidates, and enumerates only legal Hooktheory chord objects.
5. Scores candidates by forward-rendered pitch coverage, purity, bass,
   inversion, root strength, meter, and transition continuity, then solves the
   sequence with a deterministic Viterbi beam.
6. Emits the best section plus key, chord, frame, track, and melody alternatives.

One `Full Song` section is returned by default. Ordinary MIDI marker boundaries
can select a section; reserved `hooktheory:*` renderer markers restore exact
section/key/provenance metadata and are not exposed as user sections.

## Commands

Run from the parent repository:

```powershell
npm run decoder-audit -- --catalog C:/path/to/android/catalog.db --output audit.json
npm run decoder-audit -- --catalog C:/path/to/android/catalog.db --select-oracle --max-songs 250 --output oracle-queue.json
npm run decoder-audit -- --scrape scrape.json --lane raw

npm run theory-to-midi -- section.json section.mid
npm run theory-to-midi-batch -- --manifest C:/midi-data/manifests/catalog-v3 --catalog C:/path/to/catalog.db --output C:/midi-data/pairs/train-001 --limit 100
npm run midi-analyze -- input.mid --top-k 5 --output analysis.json
npm run benchmark:midi-analyze -- input.mid --iterations 5 --max-ms 30000
npm run midi-evaluate -- truth-section.json analysis.json

npm run corpus-manifest -- build --catalog C:/path/to/android/catalog.db --output C:/midi-data/manifests/catalog-v3
npm run corpus-manifest -- verify --manifest C:/midi-data/manifests/catalog-v3

npm run midi-corpus -- sources
npm run midi-corpus -- init --db C:/midi-data/acquisition.db
npm run midi-corpus -- discover --source lakh --root C:/metadata/lakh
npm run midi-corpus -- import --db C:/midi-data/acquisition.db --source lakh --metadata metadata.json
npm run midi-corpus -- match --db C:/midi-data/acquisition.db --source lakh --manifest C:/midi-data/manifests/catalog-v3
npm run midi-corpus -- calibrate --db C:/midi-data/acquisition.db --labels calibration.ndjson
npm run midi-corpus -- verify --db C:/midi-data/acquisition.db --manifest-id <id> --record-id <id> --source lakh --source-item-id <id> --reference section.json --candidate analysis.json
```

Use each command's `--help` for options. Acquisition fetch is a dry run unless
`--execute` is explicitly supplied. Rights policy, host policy, declared size,
peak disk use, checksum, and SMF validity are checked before an artifact enters
the content-addressed store.

The batch renderer streams the immutable manifest and one verified catalog BLOB
at a time. It refuses unbounded or existing targets, preflights peak storage,
allows canonical pairs from any frozen split, permits texture augmentation only
for `train`, and writes a checksummed immutable JSON/MIDI artifact manifest.

## Library interfaces

Forward rendering:

```js
import { renderSectionToMidi } from "../lib/midi/render/index.mjs";

const { bytes, sidecar } = renderSectionToMidi(section, {
  augmentation: { seed: "train-v1", transposeSemitones: 2 },
});
```

Inverse analysis:

```js
import { analyzeMidi } from "../lib/midi/analyze/index.js";

const result = await analyzeMidi(midiBytes, {
  filename: "song.mid",
  topK: 5,
});
```

The JSON response is versioned as `hooktheory.midi-analysis.v1`; its schema is
`lib/midi/schema/analysis-v1.schema.json`. Each result records the source
SHA-256, format, PPQ, duration, event count, alternatives, inference defaults,
warnings, and an `ExtractedSection`-compatible object under
`sections[].hooktheory`. No private oracle-enrichment field is public.

The same analyzer is available at `POST /api/v1/midi/analyze?topK=5`. The server
binds to `127.0.0.1` by default. Send either a multipart `file` part or a raw
MIDI content type. Uploads are streamed into an ephemeral bounded file, analyzed
from that path, and removed in a `finally` block; the endpoint does not retain
the uploaded MIDI after the request.

## Web player Local Files

Start the local player with `npm run midi -- serve`, then use the always-visible
**Local Files** shelf in the Song Selector:

- **Open MIDI** analyzes an SMF type 0/1 file, saves byte-identical source and
  complete analysis artifacts, downloads `<name>.analysis.json`, and opens the
  best-path theory in the ordinary player without autoplaying.
- **Open Theory JSON** accepts project-compatible Hooktheory sections, analyzer
  results, arrays/maps of sections, Android section maps, and `jsonData`
  wrappers. Every section remains available in the existing section selector.
- Saved entries survive refresh and retain source/theory download actions. They
  use `local:<uuid>` identities and never enter catalog search or pipeline jobs.

The local-only API is rooted at `/api/v1/local-library`. Persistent files live
under `<SACRED_RING_DATA>/local-library/`, separately from catalog and harvest
data. Its SQLite index references immutable, content-addressed source, analysis,
and normalized playable snapshots. Imports are atomic, deduplicate exact source
content, enforce the 100 MiB/five-million-event analyzer limits, and use the
same storage preflight that preserves at least 20 GiB of free space.

## Corpus integrity and leakage controls

`corpus-manifest` creates an immutable, checksummed manifest without copying the
catalog BLOBs. Its separate `anomaly-challenge.ndjson` is a compact provenance
overlay, not a payload copy. Split assignment is deterministic 80/10/10 at a
composition group—not chord or section—level. Group evidence includes normalized
identity and available Hooktheory/fingerprint evidence. All derived renderings
inherit the source split and group; augmentation cannot override either and is
rejected unless the source belongs to the training split.

Manifest v3 also writes `anomaly-challenge.ndjson`, a permanent compact overlay
containing only record identity, composition group, the ordinary train/dev/test
split, source-row hash, and classified anomaly provenance. It contains no BLOB
or decoded payload. `manifest.json` records its schema, counts, byte size, and
SHA-256, while `checksums.sha256` protects it alongside `records.ndjson`. The
verifier checks every challenge row against the corresponding ordinary record,
so challenge membership never creates a second split or leaks a composition
across split boundaries. Existing immutable v1/v2 manifests remain verifiable.

Three provenance lanes remain distinct:

- raw Hooktheory JSON;
- independently scraped Hooktheory rendering evidence;
- decoder/model-generated output.

The raw oracle lane cannot invoke truth enrichment. Synthetic MIDI is generated
only after split assignment, and complete texture families must be held out for
evaluation. External MIDI retains its raw SHA-256 and also receives a versioned
`smf-structural-v1` event fingerprint that normalizes encoding-only differences;
both identities participate in cross-split leakage guards. Synthetic round trips
never establish arbitrary real-MIDI accuracy.

## Storage and rights hard gate

Keep manifests, full audit indexes, MIDI files, and model artifacts outside Git
in an explicit data root. The compact train-only catalog prior at
`lib/midi/analyze/catalog-priors.json` is the intentional checked-in runtime
data asset that lets the deterministic analyzer operate offline. Before every
download or extraction, the corpus code computes:

```text
estimated peak = 1.25 * (download + extracted data + indexes + temporary data)
```

The default maximum batch is 5 GiB and at least 20 GiB must remain free. A
failing preflight stops before transfer and reports required, available, and
additional bytes. Increase storage or reduce the requested corpus before
resuming; never bypass the gate.

Availability is not permission. Imported items retain their source, import/link
timestamps, checksums, versioned source-policy decision, and raw license/terms/
attribution evidence when the source supplies it. Each receives exactly one of
`product_usable`, `research_only`, `metadata_only`, or `excluded`. Metadata
matching cannot accept a file by itself. Musical verification and a frozen threshold are required;
without a calibration that demonstrates at least 98% Wilson lower-bound
precision and 50% known-pair coverage, candidates remain quarantined.

## Evaluation and learned-model gate

`midi-evaluate` supports one-pair, corpus, aggregate, and promotion modes. It
reports key, boundary, exact/per-field chord, top-3/top-5, forward-equivalent,
melody, Brier/ECE, duration-weighted, rare-signature, song-macro, and
accuracy-versus-coverage metrics. Synthetic, renderer-family holdout, and real
independently annotated lanes remain separate. Promotion fails closed unless an
aggregate report identifies the frozen development manifest and pair set.

Learned refinement is deliberately not trained or promoted by repository setup.
Python may experiment with a factorized sequence model after approved real data
exists, but Node remains the canonical object mapper and round-trip validator.
A model may be promoted only if the frozen development song-macro score improves
by at least 2 absolute points and no protected key, boundary, rare-signature, or
calibration metric regresses by more than 0.5 points. Production export is ONNX;
Android/browser-local inference remains deferred until offline use is required.

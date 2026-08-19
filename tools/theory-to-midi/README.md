# Theory JSON to MIDI

`theory-to-midi` renders one ExtractedSection-compatible Hooktheory JSON object
through the project's canonical decoder. The default result is a deterministic,
type-1 Standard MIDI File with 192 PPQ, separate `Melody` and `Harmony` tracks,
tempo/meter/key events, exact modal-key markers, and a provenance sidecar.

```powershell
npm run theory-to-midi -- section.json section.mid
```

For bounded paired-data generation from a frozen corpus manifest and its exact
source catalog:

```powershell
npm run theory-to-midi-batch -- --manifest C:/midi-data/manifests/catalog-v3 --catalog C:/path/to/catalog.db --output C:/midi-data/pairs/train-001 --limit 100
```

The batch tool streams the manifest, verifies each selected catalog BLOB, runs
the storage preflight before creating output, and writes an immutable checksum
manifest. Canonical batches may target any split; augmentation is rejected
unless every selected composition group belongs to `train`.

The input may also be a wrapper with a `sections` array/object. Select one with
`--section <id|name|index>`. Run `npm run theory-to-midi -- --help` for all
options, including deterministic transpose, velocity/timing jitter, track
permutation, and within-section track merging. A complete texture recipe is
selected with `--augmentation-family <id>` and made reproducible with `--seed`.

Seeded renderer families are stable holdout IDs written to the sidecar and the
embedded augmentation provenance:

| Family ID | Texture |
| --- | --- |
| `octave-texture-v1` | Safe octave shifts and octave doublings |
| `voicing-texture-v1` | Inversion and close/spread voicing variants |
| `arpeggio-strum-v1` | Seeded up/down chord strums |
| `bass-split-v1` | Lowest chord voice moved to a bass track |
| `sustain-pedal-v1` | CC64 sustain regions |
| `syncopation-v1` | Bounded onset displacement shared across coincident parts |
| `humanize-v1` | Grouped timing, duration, and velocity variation |
| `track-layout-v1` | Seeded track dropout, merge, or permutation |
| `instrumentation-v1` | Role-aware General MIDI program changes |
| `composite-texture-v1` | Deterministic combination of the core textures |

The unaugmented renderer remains `canonical-v1`; manual augmentation options
use `custom-texture-v1`. This lets dataset construction hold out complete
renderer families instead of leaking a texture between train and evaluation.

Library usage:

```js
import { renderSectionToMidi } from "../../lib/midi/render/index.mjs";

const { bytes, sidecar } = renderSectionToMidi(section, {
  augmentation: {
    recipe: "composite-texture-v1",
    seed: "train-v1",
    transposeSemitones: 2,
    velocityJitter: 0.04,
    timingJitterTicks: 3,
  },
});
```

Augmentation is deliberately within-example only. Existing `split`, `fold`, and
group metadata is copied unchanged into the MIDI metadata and sidecar; callers
cannot override it through augmentation options, including nested objects.

Passing-tone and neighbor-tone insertion is deliberately excluded: it changes
the set of labeled pitch events and cannot be guaranteed label-safe without a
separate non-chord-tone annotation contract. Tempo, key, chord labels, split,
fold, and composition-group identity are never modified by texture recipes.

# Hooktheory Chord JSON Protocol

## Verified behavior

Fresh downloads on 2026-07-31 were compared against the rendered chord labels for:

- [Piano Man](https://www.hooktheory.com/theorytab/view/billy-joel/piano-man)
- [Don't Hang Up](https://www.hooktheory.com/theorytab/view/10cc/dont-hang-up)
- [Brand New Day](https://www.hooktheory.com/theorytab/view/10cc/brand-new-day)
- [Une Nuit a Paris](https://www.hooktheory.com/theorytab/view/10cc/une-nuit-a-paris)

Hooktheory sends extension and modifier information in separate fields:

| Meaning | JSON representation | Example rendered label |
|---|---|---|
| Ninth | `type: 9` | `V9` / `G9` |
| Eleventh | `type: 11` | `I11` / `G11` |
| Thirteenth | `type: 13` | `V13` / `A13` |
| Suspension | `suspensions: [4]` | `V9sus4` / `G9sus4` |
| Multiple suspensions | `suspensions: [4, 2]` | `Isus4sus2` |
| Added tones | `adds: [6, 9]` | `I(add6add9)` / `B6/9` |
| Altered tones | `alterations: ["#11", "#5"]` | `bIII+7(#11#5)` |
| Omitted tones | `omits: [3, 5]` | omission tags in the rendered symbol |

Piano Man's chorus cadence is currently sent as:

```json
{
  "root": 5,
  "type": 9,
  "inversion": 0,
  "applied": 0,
  "adds": [],
  "omits": [],
  "alterations": [],
  "suspensions": [4]
}
```

The rendered label is `V9sus4` / `G9sus4`, whose complete extension set is G-C-D-F-A. A genuine 11th remains distinct: Don't Hang Up contains `type: 11` with no suspension and renders `I11` / `G11`.

The keyboard voicing shown by Hooktheory is intentionally denser than the
literal extension set: the Piano Man `G9sus4` display contains G-C-F-A and
leaves out the unaltered fifth D. Because the downloaded chord JSON has no
separate voicing field and does not send `omits: [5]`, both apps apply this
general rule during note generation: an extended suspended chord (`type >= 9`)
drops only an unaltered perfect fifth. Explicit omissions and altered fifths
remain authoritative.

## Stale-cache compatibility

The old local Piano Man cache contained section `1714973`, fingerprint
`94c3b7dc6a7f8804312aae2fa40079291ec84eb95`, and encoded the same cadence as
`type: 11`. The current section has a new fingerprint and sends the canonical
`type: 9` + `suspensions: [4]` form.

The apps therefore migrate only that exact legacy section/chord signature. They
must not globally convert `type: 11`, because that would corrupt real 11th
chords. The web cache should still be refreshed when possible; the migration is
for already-installed stale bundles.

## Corpus follow-up

An extension-focused fresh scrape was run on eight additional songs using the
reverse-engineering oracle, covering 377 chords. The sample contained 169
extended chords, including 66 suspended extensions, 13 elevenths, and 32
thirteenths. Sixteen chords explicitly sent `omits: [5]`; forty suspended
ninths did not send that omission, so omission behavior cannot be inferred from
the JSON field alone.

The scraper now associates note glyphs by chord bounding boxes and neighboring
chord boundaries instead of a fixed 22-pixel radius. This prevents outer tones
from being discarded. However, Hooktheory's staff `g.note-view` elements are
not always a complete copy of the interactive keyboard shown for a selected
chord, so those captures are treated as diagnostic evidence rather than a
universal voicing oracle.

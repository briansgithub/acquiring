# Android corpus examples

The Aural Quiz opens an optional, read-only `files/aural-corpus.db` sidecar. It is
independent of Room's downloaded song catalog and user playlists. Provision the
offline pipeline's immutable `runtime.db` at this path before running
`AuralCorpusDeviceTest`. No public download endpoint or popularity subscription
is assumed by this integration.

`metadata` must contain `schema_version=1`, `snapshot_id`, and the exporter should
provide `family_mapping_version` and `popularity_version`. `quiz_occurrence` has
an indexed `(family_id, variant_id, view)` lookup and contains `occurrence_id`,
`pattern_id`, `song_id`, `section_id`, `source_id`, and a JSON payload matching
`AuralSourcePassage`. `source_id` is `songId|sectionId|startIndex|endIndex`, shared
across inversion views. `quiz_song` and `quiz_section` supply nullable popularity
and confidence. Section scores must already be vetted as trustworthy; absent or
uncertain scores are neutral. The JSON event field is `functionLabel`.

The curriculum chooses a family, variant and skill before selection. A bounded
four-target descriptor cache avoids repeated target scans; only the chosen
payload is read. File changes or snapshot changes invalidate reuse. The selector
uses the shared xorshift32 contract and three draws (including singleton pools).
New selections use `aural-selector-2`; saved version-one payloads still restore.
Song multiplicity never affects weights. The unsigned low 32 bits of the existing
generator seed are recorded as the selector seed. Shared JS/Swift-ready fixtures
live in `contracts/aural-corpus/selection-fixtures.json`; set
`AURAL_CORPUS_FIXTURES` to that directory when checking a separate worktree.

The adapter validates actual triad pitch classes and roots against the exact
current major-key curriculum variant, validates same-key tonic context and audio
limits, then preserves source beat ratios, notes, inversions, and bass motion.
Playback uses the curriculum's adaptive tempo, recorded as an explicit
`playbackTempo` transform; the source's original/reference tempo remains in the
passage. Legacy saved exercises lacking this transform retain their source tempo.
The existing octave preference raises every note by 12 semitones. Root, bass,
scale-degree and root-sequence microphone answers are rebuilt from this material.
Unsupported/missing/invalid examples use a synthetic realization for the same
target and record a fallback reason. Future chord extensions and family mappings
must expand validation explicitly.

Source exposure is recorded after the output playback head reaches the passage,
including later interruption, not when a question is created or audio is prepared.
The synthetic key reference alone does not expose the passage. Notifications run
on the caller's dispatcher and cancelled/replaced playback cannot mark a new
question heard. Source identity survives changing seeds,
instruments and inversion views. Physical intervals `[startIndex,endIndex)` are
grouped by song and section, merged, and queried by binary search. Any positive
transition overlap counts conservatively as familiar, including shorter fragments
inside previously heard passages. A shared endpoint chord alone does not. Legacy
opaque source IDs retain exact matching. Relevant heard intervals are retained in
provenance so replay cannot mistake an overlapping passage for fresh material.
Independent selection filters globally to fresh
passages where possible; otherwise it remains familiar supported practice. Guided
phase transitions can intentionally retain the same eligible passage.

Four switches apply next exercise: popularity, variety, favorites, and inversion
distinctions. Favorites use the existing built-in Favorites playlist. Popularity
is unavailable without data. The inversion-sensitive view has separate saved
progress; changing preferences cannot transfer existing evidence. Shared instrument
settings remain available. Song/section metadata appears only after grading.

Saved current exercises and recent attempts retain source payloads and revisions,
snapshot/mapping/popularity versions, seed, octave/tempo transforms, effective settings,
and relevant exposure/favorites context. Restoring validates source notes and
regenerates answers even if the original sidecar is no longer installed. Replaying
the *selection* requires retaining the referenced immutable snapshot; reproducing
the selected *exercise* only requires its saved validated payload.

Optional settings and exposure metadata decode independently of valid learning
progress. Good exposure records survive malformed neighbors. If history is
unreadable, a persisted reliability flag keeps corpus examples as supported
practice until that history is repaired/restored; losing history cannot manufacture
fresh-mastery credit. Existing synthetic-example evidence remains usable. A warning
explains this condition only when damaged history is encountered.

Human checks: listen to root versus inverted bass tasks, confirm source rhythms
and silence lengths, check unfamiliar examples and supported reuse, and try all
four switches. Decide whether source tempos/context and octave are comfortable.
Native iOS UI/session integration remains separate work, but storage and selector
fixtures are portable.

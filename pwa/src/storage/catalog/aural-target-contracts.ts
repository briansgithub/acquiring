/** Frozen Android801cf798 AuralCatalog15/23..26/52/120..132 and MusicTheory339..340.
 * Native reference e6a9d166:12groups/40NEW actual serializer/target probes.
 * Pure bounded codec/target stage only; no SQL/RPC/store/corpus eligibility or UI.
 */
export interface AuralRunBlobInput {
  readonly id: number;
  readonly stableId: string;
  readonly view: string;
  readonly song: string;
  readonly section: string;
  readonly revision: string;
  readonly supportsModeAnalysis: boolean;
  readonly tokens: Uint8Array;
  readonly positions: Uint8Array;
  readonly keyJson: string;
  /** Modern schema must decode this too. Legacy must not read it; use keyJson twice. */
  readonly sourceKeyJson?: string;
}
export interface AuralCatalogPosition {
  readonly startIndex: number; readonly endIndex: number;
  readonly startBeat: number; readonly endBeat: number;
  readonly degree: string; readonly roman: string;
  readonly notes: readonly number[];
  readonly rootMidi: number; readonly bassMidi: number;
  readonly varyingBass: boolean;
}
export interface AuralCatalogKey { readonly tonic: string; readonly scale: string }
export interface AuralDecodedCatalogRun {
  readonly id: number; readonly stableId: string; readonly view: string;
  readonly song: string; readonly section: string; readonly revision: string;
  readonly tokens: readonly string[];
  readonly positions: readonly AuralCatalogPosition[];
  readonly key: AuralCatalogKey; readonly sourceKey: AuralCatalogKey;
}
export interface AuralCatalogPatternTarget {
  readonly id: string; readonly view: string;
  readonly tokens: readonly string[]; readonly labels: readonly string[];
  readonly start: number; readonly end: number; readonly snapshotId: string;
}
export interface AuralTargetSpan {
  readonly offset: number; readonly length: number;
  readonly start: number; readonly end: number; readonly snapshotId: string;
}
export interface AuralTargetCodecApi {
  /** Capture all used input fields/bytes synchronously before first await, reading each
   * once; legacy sourceKeyJson getter is not touched. Native gzip only, no raw fallback.
   * Decode COMPLETE tokens/positions/both keys before return, ignore unknown JSON fields,
   * validate every known-field occurrence in order (duplicate last valid wins; an earlier
   * invalid known value cannot be hidden by a later valid duplicate). No musical enums,
   * MIDI/beat positivity, or equal whole-array lengths invented. Position9required fields,
   * only varyingBass=false default. Each key requires quoted tonic+scale strings.
   * Strict streaming-native String (numeric/boolean primitives rejected), Int signed32 with
   * original numeric lexemes (1.0 rejects;1e2/quoted1e2 accept), native finite Double lexical
   * grammar incl quoted Java hex/suffix/ASCII trim; quoted case-insensitive Boolean.
   * Preserve exact values/order/Unicode; return independent deeply frozen plain data.
   * A local bounded lexical decoder may be added inside owned module; do not export/refactor
   * private learning decoders or replace streaming semantics with JSON.parse coercion.
   * Browser limits: compressed8MiB EACH, decoded16MiB EACH, key JSON64KiB EACH UTF8,
   * depth32,250000 JSON tokens EACH, collections10000, strings65536 UTF16 units,
   * metadata/view4096units, aggregate decoded token UTF8 <=8MiB. Refuse ill-formed UTF8
   * explicitly (native replacement semantics not claimed). No partial/advanced decoder state.
   * CatalogError INTEGRITY for malformed native data, LIMIT for browser budgets; no raw rows
   * or unbounded source/error excerpts. Unsupported malformed UTF16 target identity uses the
   * existing identity refusal. No injected fake digest/decompression expected results.
   */
  decodeAuralCatalogRun(input: AuralRunBlobInput): Promise<AuralDecodedCatalogRun>;
  /** Native target slice builder; run is a decoded run, snapshot all USED arrays/view/span
   * before digest awaits; independently validate token AND position slice bounds. Zero-length
   * at end accepted; offset/length nonnegative ints, length<=10000. start/end signedInt copied
   * exactly (end is not reinterpreted as length or required positive). snapshotId<=4096units.
   * Labels roman iff view.endsWith('harmony_bass'), degree otherwise. Reuse actual accepted
   * auralPatternId(tokens,view); exact frozen output, no normalization or musical checks.
   * Preserve native slice failures as CatalogError INVALID_REQUEST; no partial output.
   */
  createAuralCatalogTarget(run: AuralDecodedCatalogRun, span: AuralTargetSpan): Promise<AuralCatalogPatternTarget>;
}

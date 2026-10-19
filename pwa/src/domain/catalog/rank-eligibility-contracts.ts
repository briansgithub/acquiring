export interface AuralRankEligibility {
  readonly isEmpty: boolean;
  hasAny(start: number, end: number): boolean;
}
export interface AuralRankEligibilityApi {
  createAuralRankEligibility(words: Uint32Array): AuralRankEligibility;
}
/** Pure frozen801cf798 AuralRankEligibility.kt WHOLE class only. Input is packed
 * low-bit-first unsigned32 words (native Long split low/high), not an eligibility
 * predicate. Copy input before return, trim zero tail and retain private population
 * prefix counts for O(1) INCLUSIVE hasAny, including distant empty spans/tails.
 * Native valid signed32 start/end: reversed spans and negative starts/ends return
 * false; endpoints beyond stored words are clipped. Empty bitmap isEmpty=true.
 * Input mutation after creation cannot affect results. No public bitmap/count view.
 * Browser domain: actual Uint32Array (cross-realm allowed), unshared/non-detached
 * ArrayBuffer, <=8388608 words (native suffix blob<2GiB bounds bitmap to32MiB).
 * Capture intrinsic length/buffer/offset before copy, no caller iterator, constructor,
 * species or shadowed properties. Reject wrong input/type with TypeError; limits or
 * non-signed32 endpoints with RangeError (no numeric coercion). Freeze output/API.
 * Oracle first: <=12NEW named groups with actual unchanged Kotlin class + java BitSet,
 * pinned cached Kotlin2.2.10. Capture signed32 range boundaries, 31/32 and63/64 shifts,
 * internal empty words/prefix counts, trailing zeros/clipped ends, empty/reversed/
 * negative spans and original BitSet mutation. Expected values come from actual JVM,
 * not TS/hand-generated truth. Retain source/class/input/stdout/jar hashes. Browser
 * refusal/aliasing/hostile surface cases separate from native proof. No SQL scans,
 * song validity/popularity predicates/cache/query membership/ranking/UI/device claim.
 */

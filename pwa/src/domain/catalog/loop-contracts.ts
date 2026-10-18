export interface AuralLoopReduction {readonly redundant:boolean;readonly start:number;readonly length:number}
export interface AuralLoopReductionApi {
 auralReduceLoop(tokens:readonly string[]):AuralLoopReduction;
 auralRetainedChildren(tokens:readonly string[]):readonly (readonly string[])[];
}
/** Frozen801cf798 WHOLE AuralLoopReduction.kt, version unique-transitions-1.
 * Export AURAL_LOOP_REDUCTION_VERSION literal and frozen auralLoopReductionApi.
 * Compare exact strings, no canonicalization/normalization/encoding/reordering.
 * KMP prefix period n-prefix[n-1]; n<3, n<2*period OR n<=period+1 returns(false,0,n).
 * Otherwise true with earliest longest contiguous unique DIRECTED TOKEN-PAIR transition
 * window: sliding left=max(left,lastPairEdge+1), update best ONLY strict greater length.
 * Pair keys must be structurally unambiguous (NUL/delimiter tokens allowed); no lossy
 * joined-string keys. Return start/length indices, not replacement tokens or cyclic rotation.
 * Retained children: n<=2 empty. BFS initial spans[0,n-1),[1,n); visited by(start,end),
 * skip length<2/seen spans; retain nonredundant child, else enqueue dropLAST then dropFIRST.
 * Dedupe retained child LIST CONTENTS structurally, preserving first insertion/BFS order;
 * do not prune just to the core, return duplicates by span or sort the children.
 *
 * BROWSER-domain guards: real indexed arrays, <=10000tokens, each string<=65536 UTF16
 * units, total input<=8388608 UTF16units; wrong shape/type TypeError, bounds RangeError.
 * All inputs snapshot/validate once BEFORE even empty/short returns; length/index once,
 * cap before copying, no caller iterators/unknown getters. Reentry independent locals.
 * RetainedChildren additionally caps UNIQUE visited spans65536, sum of examined child
 * token lengths2000000 (charge BEFORE sublist/reduction work), sum of retained output
 * token counts2000000 (before copying). Throw RangeError on budget exhaustion; never return
 * a silently truncated frontier/partial list. These are explicit browser extensions.
 * Input unchanged, fresh independent deep-frozen result/outer+child arrays on every call.
 * No global mutable cache, I/O, async worker construction or new runtime dependencies.
 *
 * Oracle FIRST: reuse original15 tooling/aural-corpus/fixtures/loop-reduction.json cases
 * from frozen authority UNCHANGED without recapture. <=16NEW native whole-module groups
 * with BOTH actual reduction/ordered retained children; pinned cached Kotlin/JVM, exact
 * source/input/output/class hashes. No hand/TS expected generation. Include pair-collision
 * strings, partial/repeated periods, earliest ties, BFS endpoint branches/structural dedupe,
 * raw Unicode/empty strings and bounded longer periodic input. Root reviews/checkpoints
 * producer/fixture/log BEFORE source. Browser-only caps/getters/reentry/alias tests separate.
 * No query/identity/native fixture changes, SQL/rank/frontier/corpus/session/UI/deps.
 * This kernel does not claim complete catalog paging, loop UI or device performance.
 */

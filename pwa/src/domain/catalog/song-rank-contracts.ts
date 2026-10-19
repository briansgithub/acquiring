export interface AuralSongRankInput {
 readonly songByRank:readonly string[];
 readonly validSongIds:readonly string[];
 readonly popularity:readonly {readonly songId:string;readonly score:number|null}[];
 readonly percent:number;
}
export interface AuralSongRankFragment {
 readonly rankCount:number;
 readonly words:readonly number[];
}
export interface AuralSongRankApi {
 buildAuralSongRankFragment(input:AuralSongRankInput):AuralSongRankFragment;
}
/** Bounded pure projection of frozen801cf798 AuralCatalog186..195/33..37 and
 * Corpus83. songByRank ALREADY projects suffix rank -> run -> song, preserving
 * EVERY rank and duplicate. Local bit0 corresponds to input rank0; select iff song
 * belongs to validSongIds AND its nonnull finite score lies in[0,1] and >=percent/100.
 * Missing/null/out-of-range finite scores do not qualify, including threshold0.
 * Percent is required integer0..100 (native eager require). Native confidence is
 * irrelevant to eligibility and is NOT in input. No popularity weighting/stats.
 * Output unsigned32 low-bit-first words, length ceil(rankCount/32) INCLUDING zero
 * tail words; bits beyond rankCount zero. Adapter may pad reflected native packed
 * Long words only for this explicit wire extent; predicate is actual native method.
 * Frozen fresh outer object/normal words array (no mutable typed-buffer view).
 * Compose accepted createAuralRankEligibility(Uint32Array.from(fragment.words)) for
 * private constant-time hasAny; do not alter/reimplement accepted rank index.
 *
 * Browser boundary: each of3real indexed input arrays<=10000entries, strings<=4096
 * UTF16 units, combined text<=8MiUTF16 percall (including duplicate occurrences).
 * Snapshot each known field/length/index once BEFORE predicate work, without caller
 * iterators/constructors/unknown getters; own records/maps, independent reentrant
 * budgets. Validate ALL inputs even with emptyrank/invalidsong. Popularity song IDs
 * unique; rank/valid IDs may repeat. No coercion, locale/canonical/UTF8 normalization;
 * NUL/BOM/astral/lone UTF16 units preserve exact string identity. Finite score or
 * null only; out-of-range finite values remain meaningful false. Nonfinite scores
 * and duplicate popularity IDs are explicit browser refusals (native global map
 * preloading/coercion behavior unclaimed). TypeError shape/type; RangeError numeric,
 * duplicate/resource bounds; getter exceptions propagate. Frozen exported API.
 *
 * ORACLE FIRST <=12NEW actualnative groups, untouched whole method/helper/native
 * rank class and declarations, pinned cached Kotlin2.2.10. Host binds only supplied
 * suffix/run-song/valid/popularity data with freshcache perprobe; fixture-only
 * reflection reads actual returned rank class's private packed Long words and
 * splits/pads unsigned32 for JSON. No replacement predicate/TS expected generator,
 * SQL simulation or old successful fixture recapture. Capture whole/slice/input/
 * stdout/class/jar/producer hashes. Cases: empty, allinvalid, null/missing score,
 * thresholds0/50/100/inclusive/neighbors/out-of-range, repeatedsongs/ranks/validIDs,
 * 31/32/63/64 boundaries+tailpadding, prototype/NUL/BOM/UTF16 identity. Browser-only
 * caps/duplicates/nonfinite/getter/iterator/reentry/alias/freeze tested separately.
 * Root reviews oracle checkpoint BEFORE source implementation. Source/API paths
 * song-rank-eligibility.ts/.test.ts and SONG_RANK_WORKLOG.md; oracle paths separate.
 *
 * No SQL/files/gzip, suffix/run decoder, global scan/cache/checkpoint ownership,
 * request/worker/client integration, query buckets/frontier/groups/pages/UI claim.
 * <=10000local ranks is NOT fullcatalog acceptance. Future caller must assemble
 * aligned batches bound to immutable snapshot/popularity version/percent, retaining
 * exact nextRank and no partially published predicate on interruption. That runtime
 * contract and fullcatalog budgets require separate evidence.
 */

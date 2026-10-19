export interface AuralCatalogStatistics {
 readonly songs:number; readonly occurrences:number; readonly sections:number;
 readonly effective:number; readonly score:number;
 readonly globalSongs:number; readonly globalOccurrences:number;
}
export interface AuralStatisticsInput {
 readonly targetLength:number;
 readonly occurrences:readonly {readonly runId:number;readonly offset:number}[];
 readonly runs:readonly {readonly id:number;readonly songId:string;readonly sectionId:string}[];
 readonly validSongIds:readonly string[];
 readonly popularity:readonly {readonly songId:string;readonly score:number|null;readonly confidence:number}[];
 readonly settings:{readonly popularity:boolean;readonly variety:boolean;readonly favorites:boolean};
 readonly recentSongIds:readonly string[]; readonly favoriteSongIds:readonly string[];
 readonly minimumPopularityPercent?:number|null;
}
export interface AuralCatalogStatisticsRow extends AuralCatalogStatistics {
 readonly id:string; readonly length:number;
}
export interface AuralCatalogStatisticsApi {
 computeAuralCatalogStatistics(input:AuralStatisticsInput):AuralCatalogStatistics|null;
 compareAuralCatalogRows(a:AuralCatalogStatisticsRow,b:AuralCatalogStatisticsRow,sortOrder?:string):number;
}
/** Pure frozen801cf798 Catalog19..22/33..36/48/147..184/547..555,
 * Corpus9..11/83. Occurrences ALREADY selected/ordered by caller; no prefix/SQL scan,
 * query/include callback, run decode, target identity, global eligibility or runtime claim.
 * Count every valid-song occurrence globally BEFORE popularity filtering. Null/omitted
 * threshold bypasses score eligibility; nonnull percent0..100 requires finite score
 * in[0,1] >=percent/100. Return null if no eligible song. Group first-encounter order.
 * Per-song sort runId/offset, strict start>end nonoverlap; reset overlap on run change,
 * retain cap4 across runs, and count ALL matched sectionIds even beyond cap. Effective
 * sum of per-song counts. Section identity is sectionId alone. Preserve signedInt end
 * arithmetic by refusing offset+targetLength-1 beyond Int.MAX_VALUE before computing.
 * Base=log2(length)*log2(1+songs)*log2(1+effective). Factor popularity when enabled and
 * score nonnull:1+clamp(confidence,0,1)*(clamp(score,0,1)-.5); variety uses FIRST recent
 * index0..2=>.25,3..9=>.6,else1; enabled favorite=>1.5. Sum factors in song encounter
 * order, score=base*sum/songs. JVM/JS transcendental scores compared within relative
 * 2e-14/absolute1e-12; counts and tested comparator signs exact, not bit-identical log2.
 * Comparator default/unknown=>recommended:score DESC,songs DESC,length DESC,id UTF16 ASC;
 * mostSongs=>globalSongs DESC,globalOccurrences DESC,length DESC,id ASC;
 * longest/shortest=>length DESC/ASC,globalSongs DESC,globalOccurrences DESC,id ASC.
 * Preserve Double signed-zero order, return -1/0/1; no locale/normalization/mutation.
 *
 * Browser domain explicitly narrower than native lazy invalid/zero-length handling:
 * targetLength2..10000; <=10000 rows EACH collection, string<=4096 UTF16 units,
 * aggregate input text<=8Mi UTF16/call. Finite score/confidence (null score allowed,
 * out-of-range finite values meaningful); eager percent0..100; nonnegative signedInt
 * IDs/offsets and unique run/popularity IDs; every occurrence references existing run.
 * Other duplicates allowed. Comparator counts nonnegative signedInt,length2..10000,
 * finite score; validate every field even unused in selected order. No invented count
 * relationship. Wrong shape/type=>TypeError; numeric/duplicate/missing/budget=>RangeError.
 * Snapshot every known field/array index/length once before computation, cap lengths
 * first; no caller iterator/unknown getter, no object-key maps/prototype pollution.
 * Getter exceptions propagate; reentry/local budgets independent. Frozen fresh output
 * and exported auralCatalogStatisticsApi; no mutation/global cache/dependencies.
 * Oracle FIRST <=20NEW actual native groups using unchanged complete stats/factor/base/
 * comparator and declarations. Adapter supplies selected suffix/run/song facts only;
 * no SQL behavior stub or replacement algorithm/TS expectations. Native groups include
 * null/invalid songs, duplicates/overlap/touch/cap4-per-song/all sections, threshold
 * boundaries/null/invalid scores/clamps/factor toggles/first-index recent/favorite,
 * first-seen sum and exact sort hierarchies/unknown/default/UTF16/signedzero/ties.
 * Root reviews oracle checkpoint BEFORE source implementation. Browser-only refusal,
 * alias/getter/iterator/reentry/freeze checks separate. No old fixture/capture rewrites.
 */

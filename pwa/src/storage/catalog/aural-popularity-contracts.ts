import type {AuralReadDatabase} from './aural-read-contracts';
import type {AuralStatisticsInput} from '../../domain/catalog/statistics-contracts';
export type AuralPopularityEntries=AuralStatisticsInput['popularity'];
export interface AuralPopularityReadApi {
 captureAuralPopularitySongIds(songIds:readonly string[]):readonly string[];
 readAuralPopularity(db:AuralReadDatabase,songIds:readonly string[]):AuralPopularityEntries;
}
/** Selected-song readonly projection of frozen801cf798 Catalog107..116/Corpus83,
 * using an already-confirmed immutable attempt's aural-popularity.db. No open/files,
 * metadata/version loading, global constructor/map scan, mutation/cache or scoring.
 * Native skips NULL score rows. Missing IDs omitted. Selected nonnull score rows
 * must have UNIQUE song IDs; malformed duplicates explicitly INTEGRITY (native global
 * preload would last-write-wins). Output input-ID first-encounter order, no sorting.
 * Capture real indexed array/length/each string once before any DB callback, no
 * caller iterator/constructor/unknown getters; <=10000entries, each<=4096UTF16,
 * aggregate<=8MiUTF16. Duplicate input IDs allowed; dedupe only owned snapshot.
 * Empty list => fresh frozen[] without SQL. Inputs wrong shape/type=>INVALID_REQUEST,
 * input budgets=>LIMIT. Reject ill-formed UTF16 input IDs as INVALID_REQUEST
 * BEFORE SQL binding (binders replace lone surrogates); no silent reinterpretation.
 * No coercion/normalization of valid strings, NUL/BOM/pairs meaningful.
 * Query <=128 IDs/batch, bound parameters/LIMIT129; filter score IS NOT NULL before
 * duplicate checks. Read song_id as SQL-bounded16KiB UTF8 BLOB, fatal exact decode/
 * <=4096UTF16; numeric typeof aliases plus CAST(score/confidence AS REAL) preserve
 * native finite Double projection including SQLite INTEGER outside JS safe-integer
 * range. Native finite OUT-OF-RANGE scores/confidence retained for pure clamping.
 * Browser domain explicitly refuses nonnumeric/nonfinite/NULL confidence when score
 * nonnull as INTEGRITY; native Cursor coercion/NULL confidence behavior not claimed.
 * NULL-score rows ignored even with malformed confidence. Do not return NULL-score
 * entries. Missing schema/unknown returnedID/duplicate/invalidUTF8/type=>INTEGRITY,
 * source byte/UTF16/aggregate budgets=>LIMIT. Capture each returned known field once.
 * Frozen fresh array/records, no SQL buffers exposed; frozen auralPopularityReadApi.
 * Meaningful actual SQLite tests: NULL/missing/duplicates, finite clamp-domain values,
 * integer-toDouble, NUL/BOM, batch128, beforematerialization bytes/UTF16/aggregate,
 * malformed numeric/schema/refusals, caller snapshot/getter/iterator/freeze boundaries.
 * No new native capture/dependencies/production worker/client/UI/global eligibility.
 */

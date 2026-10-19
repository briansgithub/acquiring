import type {AuralReadDatabase} from './aural-read-contracts';
import type {AuralCatalogTargetQuery} from './aural-target-query-contracts';
import type {AuralStatisticsInput} from '../../domain/catalog/statistics-contracts';
export interface AuralStatisticsFacts {
 readonly sourceSnapshot:string;
 readonly occurrences:AuralStatisticsInput['occurrences'];
 readonly runs:AuralStatisticsInput['runs'];
 readonly validSongIds:AuralStatisticsInput['validSongIds'];
}
export interface AuralStatisticsFactsApi {
 captureAuralStatisticsRange(query:AuralCatalogTargetQuery):AuralCatalogTargetQuery;
 readAuralStatisticsFacts(db:AuralReadDatabase,expectedSnapshot:string,query:AuralCatalogTargetQuery):AuralStatisticsFacts;
}
/** Bounded ordered input adapter for native Catalog155..184, not statistics/ranking.
 * Snapshot4scalars before SQL. Require exact snapshot SHA256, start>=0/end signed32,
 * length2..10000; at most10000 INCLUSIVE suffix ranks or LIMIT, never partial totals.
 * Empty/reversed range yields empty facts after header validation, no run lookup.
 * Read exactly selected8-byte LE pairs via SQL substr, not entire suffix BLOB. Preserve
 * source order/duplicates; every referenced run must exist uniquely. Query distinct
 * run IDs in batches<=128 with LIMIT129. Select ONLY song/section scalar metadata,
 * exact byte-bounded TEXT as BLOB16KiB each, fatalUTF8/<=4096UTF16,8Mi units aggregate
 * including returned valid IDs. EXISTS catalog_song supplies native Set membership;
 * no popularity filtering, gzip/JSON, new IDs, global constructor/contiguity scan.
 * Reject negative pairs as INTEGRITY; unsafe offset+length-1 as LIMIT (native wraps
 * outside supported domain). Missing/duplicate/malformed metadata/schema=>INTEGRITY.
 * Readonly same worker-command DB, no cache/lease/async/writes. Frozen fresh plain
 * facts, no DB buffers exposed. Caller supplies popularity/settings/recent/favorites
 * to separately accepted pure statistics; wholecatalog spans/budgets still unproven.
 */

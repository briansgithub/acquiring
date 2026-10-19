import type {AuralCatalogTargetQuery} from './aural-target-query-contracts';
import type {AuralCatalogStatistics,AuralStatisticsInput} from '../../domain/catalog/statistics-contracts';
export interface AuralStatisticsRequest {
 readonly range:AuralCatalogTargetQuery;
 readonly settings:AuralStatisticsInput['settings'];
 readonly recentSongIds:readonly string[];
 readonly favoriteSongIds:readonly string[];
 readonly minimumPopularityPercent?:number|null;
}
export interface AuralStatisticsResponse {
 readonly sourceSnapshot:string;
 readonly range:AuralCatalogTargetQuery;
 readonly statistics:AuralCatalogStatistics|null;
}
/** Request snapshot BEFORE journal/ownership awaits; own known fields/array indices
 * once with no caller iterators/unknown getters. Existing range guard2..10000length/
 * <=10000inclusive pairs; settings3strict booleans required, histories real arrays
 * <=10000each/string<=4096UTF16/aggregate8MiUTF16. Eager percent null/undefined orInt
 * 0..100. Frozen independent request/settings/histories/range. Caller shape/numeric
 * domain=>CatalogError INVALID_REQUEST, resource caps=>LIMIT; getter failures propagate.
 * Runtime reads ordered stats facts and selected valid-song popularity from SAME
 * confirmed immutable installation in serialized worker command, readonly DB handles
 * closed finally. Pure stats full-input budget failures=>LIMIT, no partial results.
 * Response ties exact copied range and source snapshot to nullable statsMatching
 * result; kernel counts/comparator acceptance separate. Every supplied interval is
 * counted wholly; no query/include predicate, global eligibility/buckets/frontier,
 * fullcatalog large-span budgets, pagination/group/UI or production/device claim.
 * Client timeout30s terminates owner/allpending (existing ownership model); no
 * fabricated per-request cancellation or mid-computation interruption guarantee.
 */

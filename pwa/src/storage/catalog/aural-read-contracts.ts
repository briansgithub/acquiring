/** Android801cf798 AuralCatalog73..90. This is a bounded lookup foundation,
 * not full-catalog validation, matching, ranking, or a persistent public lease.
 * Caller holds the existing worker command/owner until its readonly DB closes.
 */
export interface AuralReadDatabase {
  selectObjects(sql: string, bind?: (string | number)[]): Record<string, unknown>[];
}
export type AuralCatalogSchema = 'aural-catalog-1' | 'aural-catalog-2' | 'aural-catalog-3';
export interface AuralCatalogHeader {
  readonly sourceSnapshot: string;
  readonly schemaVersion: AuralCatalogSchema;
  readonly supportsModeAnalysis: boolean;
  readonly supportsStartGrouping: boolean;
  readonly reducedRanges: boolean;
  readonly suffixCount: number;
}
export interface AuralSuffixLocation { readonly runId: number; readonly offset: number }
export interface AuralHeaderReadApi {
  /** Require exact expected lowercase SHA256 snapshot. Read only three known metadata
   * keys (at most four rows) and typeof/length of suffix_locations; never its full BLOB.
   * Native schemas1..3/flags, browser refusal for malformed/duplicate/oversize metadata,
   * non-BLOB array, non-integral 8-byte pairs, or array bytes>=2GiB. Empty array is valid.
   * Throw CatalogError INVALID_REQUEST / STALE_SNAPSHOT / INTEGRITY; do not recover here.
   */
  readAuralHeader(db: AuralReadDatabase, expectedSnapshot: string): AuralCatalogHeader;
  /** Trusted header from this same immutable readonly handle. Snapshot fields before
   * DB callbacks; rank is an integer in [0,suffixCount). Read exactly8 bytes at rank*8+1.
   * Decode native signed32 little-endian runId/offset; negative/truncated data is INTEGRITY.
   * No SQL interpolation of caller values, caches, scans, writes or persistent handles.
   */
  readAuralSuffixLocation(db: AuralReadDatabase, header: AuralCatalogHeader, rank: number): AuralSuffixLocation;
}

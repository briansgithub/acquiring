import type {AuralRunBlobInput,AuralTargetSpan} from './aural-target-contracts';
import type {AuralReadDatabase} from './aural-read-contracts';
export interface AuralCatalogTargetQuery {
  readonly sourceSnapshot: string;
  readonly start: number;
  readonly end: number;
  readonly length: number;
}
export interface AuralTargetRow {
  readonly runInput: AuralRunBlobInput;
  readonly span: AuralTargetSpan;
}
export interface AuralTargetQueryApi {
  /** Capture/validate once before worker ownership/journal awaits; no data lookup. */
  captureAuralTargetQuery(query:AuralCatalogTargetQuery):AuralCatalogTargetQuery;
  /** Snapshot all4request fields before SQL callbacks; request snapshot must equal trusted
   * installed SHA256 snapshot before any read. Header+one8byte suffix+one bounded run row.
   * start is a valid suffix rank; end ANY signedInt copied per native; length0..10000.
   * Native legacy key_json selected twice without referencing absent source_key_json column.
   * SQL guards BLOB8MiB EACH /key TEXT64KiB UTF8 EACH /metadata TEXT16KiB UTF8
   * before materialization, then metadata<=4096UTF16. Fetch TEXT as BLOB and decode
   * fatal UTF8 preserving NUL/BOM; no binding CString truncation. Decoder further enforces JSON/decompression budgets.
   * Returned plain input/span objects frozen; compressed bytes are owned query results,
   * not caller data. Caller immediately passes input into copying async decoder while
   * holding same immutable readonly DB handle/serialized command; no persistent lease.
   * No parsing, musical checks, cache/scans, writes, fallback, ranking, or target ID here.
   * CatalogError INVALID_REQUEST/STALE_SNAPSHOT/INTEGRITY/LIMIT only for covered refusals.
   */
  readAuralTargetRow(db:AuralReadDatabase,expectedSnapshot:string,query:AuralCatalogTargetQuery):AuralTargetRow;
}

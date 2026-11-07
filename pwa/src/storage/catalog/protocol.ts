import type {AuralStatisticsRequest} from './aural-statistics-runtime-contracts';
import type {AuralCatalogTargetQuery} from './aural-target-query-contracts';
import type { SongPageRequest } from './library-queries';
export type { AuralCatalogHeader } from './aural-read-contracts';
import type { CatalogManifest } from './manifest';
import type { CatalogInstall, CatalogPointer } from './journal';
export const CATALOG_OWNER_LOCK = 'acquiring-catalog-owner-v1';
export interface CatalogInfo { sqliteVersion: string; capacity: number; files: string[]; preservationEnabled: true }
export interface CatalogInspection { attemptId: string; files: { name: string; bytes: number; metadata: Record<string, string> }[] }
export type CatalogCommand =
  | { kind: 'init' } | { kind: 'close' } | { kind: 'info' }
  | { kind: 'stage'; attemptId: string; manifest: CatalogManifest; baseUrl: string }
  | { kind: 'inspect'; attemptId: string; manifest: CatalogManifest }
  | { kind: 'prepare'; attemptId: string; manifest: CatalogManifest; baseUrl: string }
  | { kind: 'activate'; attemptId: string }
  | { kind: 'active'; catalogKind: CatalogManifest['kind'] }
  | { kind: 'status'; attemptId: string }
  | { kind: 'songPage'; query: SongPageRequest }
  | { kind: 'songBrowseBySlugs'; slugs: string[] }
  | { kind: 'songPayload'; slug: string }
  | { kind: 'auralHeader' }
  | { kind: 'auralTarget'; query: AuralCatalogTargetQuery }
  | { kind: 'auralStatistics'; request: AuralStatisticsRequest };
export interface ActiveCatalog { pointer: CatalogPointer; inspection: CatalogInspection; recovered: boolean }
export type InstallStatus = CatalogInstall | null;
export interface CatalogRequest { id: string; command: CatalogCommand }
export interface CatalogProgress { type: 'progress'; id: string; file: string; chunkIndex: number; verifiedBytes: number }
export type CatalogResponse = { type: 'result'; id: string; ok: true; value: unknown } | { type: 'result'; id: string; ok: false; error: { code: string; message: string } };
export class CatalogError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'CatalogError'; }
}
export function stagedPath(attemptId: string, name: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(attemptId)) throw new CatalogError('INVALID_REQUEST', 'Expected a stable attempt UUID');
  if (!['catalog.db', 'aural-catalog.db', 'aural-evidence.db', 'aural-popularity.db'].includes(name)) throw new CatalogError('INVALID_REQUEST', 'Unknown catalog file');
  return `/staging/${attemptId}/${name}`;
}

import { createHash } from 'node:crypto';

export const SQLITE_PACKAGE_VERSION = '3.53.4-build2';
export const SQLITE_SOURCE_SHA256 = 'a6d3fe46aa3f924e7686329f97b0564549ef1f787e0c19924179aef7f72bcc01';
export const UPSTREAM_PRESERVATION_SOURCE = 'https://github.com/sqlite/sqlite/blob/40f8f74946173a0c8bcb967a1748396d7d328f55/ext/wasm/api/sqlite3-vfs-opfs-sahpool.c-pp.js#L1497';
export const FAILURE_CLEANUP_TARGET = '\t\t\t\t\t\tawait thePool.removeVfs().catch(() => {});';

// Exact cleanup operations from the official upstream preservation branch.
// Absent/false options retain the pinned release's existing removal behavior.
export const PRESERVING_FAILURE_CLEANUP = [
  '\t\t\t\t\t\tif (options.preserveOnInitFailure) {',
  '\t\t\t\t\t\t\tconst cVfs = thePool.getVfs();',
  '\t\t\t\t\t\t\tif (cVfs?.pointer) {',
  '\t\t\t\t\t\t\t\tcapi.sqlite3_vfs_unregister(cVfs.pointer);',
  '\t\t\t\t\t\t\t\tcVfs.dispose();',
  '\t\t\t\t\t\t\t\tthePool.releaseAccessHandles();',
  '\t\t\t\t\t\t\t}',
  '\t\t\t\t\t\t} else {',
  FAILURE_CLEANUP_TARGET + '\n\t\t\t\t\t\t}',
].join('\n');

/** Build-time-only, pure transform. Unknown input is a hard failure, never an unpatched fallback. */
export function patchSqliteSahPool(source) {
  if (typeof source !== 'string') throw new TypeError('SQLite source must be UTF-8 text');
  const count = source.split(FAILURE_CLEANUP_TARGET).length - 1;
  if (count !== 1) throw new Error('SQLite preservation target count must be 1; got ' + count);
  const actual = createHash('sha256').update(source, 'utf8').digest('hex');
  if (actual !== SQLITE_SOURCE_SHA256) {
    throw new Error('Unsupported SQLite source SHA256 ' + actual + '; expected ' + SQLITE_SOURCE_SHA256);
  }
  return source.replace(FAILURE_CLEANUP_TARGET, PRESERVING_FAILURE_CLEANUP);
}

/** Install in both main and worker Vite pipelines; exclude sqlite-wasm from dependency prebundling. */
export function sqlitePreservationPlugin() {
  return {
    name: 'acquiring-sqlite-preserve-init-failure',
    enforce: 'pre',
    transform(source, id) {
      const path = id.replaceAll('\\', '/').split('?')[0];
      if (!path.endsWith('/@sqlite.org/sqlite-wasm/dist/index.mjs')) return null;
      return { code: patchSqliteSahPool(source), map: null };
    },
  };
}

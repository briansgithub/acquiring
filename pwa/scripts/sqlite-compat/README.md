# SQLite SAH pool preservation backport

Build-time compatibility patch for @sqlite.org/sqlite-wasm3.53.4-build2 only. No full bundle is vendored or edited in node_modules. The transform verifies the browser bundle's exact SHA256 and exactly one cleanup target before changing it; unknown, already-patched or changed source throws. The Node-targeted bundle, worker1 wrapper and other SQLite entry points are outside this patch.

The small cleanup branch follows [official immutable SQLite source](https://github.com/sqlite/sqlite/blob/40f8f74946173a0c8bcb967a1748396d7d328f55/ext/wasm/api/sqlite3-vfs-opfs-sahpool.c-pp.js#L1497). When preserveOnInitFailure is truthy, it unregisters/disposes the VFS and releases handles without deleting the pool. Absent/false retains the pinned release's removal branch. The caller must explicitly request preservation and keep clearOnInit false. Preservation does not roll back writes already made during initialization, repair corrupt files, coordinate active tabs or implement catalog installation.

Exports from patch.mjs:
- patchSqliteSahPool(sourceText) -> patchedText; no filesystem side effects.
- sqlitePreservationPlugin() -> Vite Plugin. Add to main plugins and worker.plugins factory. Exclude @sqlite.org/sqlite-wasm from optimizeDeps so prebundling cannot bypass the source transform.
- Pin constants expose package version, source hash and immutable upstream provenance. patch.d.mts supports strict TypeScript Vite configuration.

Coordinator integration example (shared configuration is coordinator-owned):

```ts
import { sqlitePreservationPlugin } from './scripts/sqlite-compat/patch.mjs';
// Within the existing Vite configuration:
plugins: [sqlitePreservationPlugin(), /* existing plugins */],
optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
worker: { plugins: () => [sqlitePreservationPlugin()] },
```

Run from repository root with dependencies installed under pwa:

```text
node --test pwa/scripts/sqlite-compat/patch.test.mjs
node pwa/scripts/sqlite-compat/browser-regression.mjs
```

For an isolated worker without installed dependencies, set PWA_SQLITE_RUNTIME_ROOT to the absolute primary pwa directory. Browser checks use installed Chrome locally and Playwright's bundled Chromium when CI is set. They generate a harness and JSON receipt under ignored .artifacts/pwa-port/sqlite-safety/<runUUID>. A local server binds a new random loopback port; a new isolated browser context gives an empty OPFS origin. Only test-owned databases are opened. Browser/server cleanup runs in finally; artifacts are retained.

The Node suite checks pin/target drift, entry matching, cleanup order and default behavior. The browser case prepares a row in a real four-slot pool, closes/pauses and terminates that worker, then injects one acquire failure after three other real handles settle. It verifies three closes, no live handles or registered VFS, exclusive reacquisition of all four slots, unchanged file names/sizes/SHA256, and row plus quick_check recovery in a third worker while the failed worker is still alive. No unpatched destructive browser run is needed. This is one controlled acquisition schedule on Chrome, not proof of arbitrary concurrent tab schedules, mobile/Safari support, crash durability, quota handling, or full installer safety.

To update the dependency, review the new upstream behavior and source before changing the pin/hash/target. Run both regressions and integration checks. A hash mismatch must stop the build; never catch it and serve an unpatched bundle.

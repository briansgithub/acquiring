import sqlite3InitModule from '/sqlite.mjs';

const options = {
  name: 'acquiring-safety-test', directory: '/acquiring-safety-test',
  initialCapacity: 4, preserveOnInitFailure: true, verbosity: 0,
};
const filename = '/fixture.sqlite3';

async function filesAndHashes() {
  const root = await navigator.storage.getDirectory();
  const directory = await (await root.getDirectoryHandle('acquiring-safety-test')).getDirectoryHandle('.opaque');
  const files = [];
  for await (const [name, entry] of directory) {
    const file = await entry.getFile();
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    files.push({ name, size: file.size, hash: Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('') });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

self.onmessage = async ({ data: phase }) => {
  try {
    const sqlite3 = await sqlite3InitModule({
      locateFile: name => new URL(name, self.location.href).href,
      print: () => {}, printErr: () => {},
    });
    if (phase === 'prepare') {
      const pool = await sqlite3.installOpfsSAHPoolVfs(options);
      const db = new pool.OpfsSAHPoolDb(filename, 'c');
      db.exec("CREATE TABLE evidence(value TEXT NOT NULL); INSERT INTO evidence VALUES ('preserved-fixture-row')");
      db.close();
      const capacity = pool.getCapacity();
      pool.pauseVfs();
      self.postMessage({ ok: true, capacity, files: await filesAndHashes() });
    } else if (phase === 'fail') {
      const nativeAcquire = FileSystemFileHandle.prototype.createSyncAccessHandle;
      const nativeClose = FileSystemSyncAccessHandle.prototype.close;
      const active = new Set();
      let attempts = 0, acquired = 0, closed = 0, apiChecks = 0;
      let unblockFailure;
      const otherSlotsAcquired = new Promise(resolve => { unblockFailure = resolve; });
      FileSystemFileHandle.prototype.createSyncAccessHandle = async function(...args) {
        if (this.name.startsWith('.opfs-sahpool-sync-check-')) {
          apiChecks++;
          return nativeAcquire.apply(this, args);
        }
        attempts++;
        if (attempts === 2) {
          // Permit the other three real pool handles to settle before injecting
          // one failure; this proves partial cleanup without relying on worker death.
          await otherSlotsAcquired;
          await new Promise(resolve => setTimeout(resolve, 0));
          throw new DOMException('injected-mid-acquire', 'NoModificationAllowedError');
        }
        const handle = await nativeAcquire.apply(this, args);
        active.add(handle);
        if (++acquired === 3) unblockFailure();
        return handle;
      };
      FileSystemSyncAccessHandle.prototype.close = function(...args) {
        if (active.delete(this)) closed++;
        return nativeClose.apply(this, args);
      };
      let failure;
      try { await sqlite3.installOpfsSAHPoolVfs(options); }
      catch (error) { failure = { name: error.name, message: error.message }; }
      FileSystemFileHandle.prototype.createSyncAccessHandle = nativeAcquire;
      FileSystemSyncAccessHandle.prototype.close = nativeClose;
      const report = {
        ok: true, failure, attempts, acquired, closed, active: active.size, apiChecks,
        registered: !!sqlite3.capi.sqlite3_vfs_find(options.name), files: await filesAndHashes(),
      };
      // Also prove all files can acquire exclusive handles while this failed
      // worker remains alive. File content/hash equality is checked by the host.
      const root = await navigator.storage.getDirectory();
      const opaque = await (await root.getDirectoryHandle('acquiring-safety-test')).getDirectoryHandle('.opaque');
      let probes = 0;
      for await (const [, entry] of opaque) { const handle = await entry.createSyncAccessHandle(); handle.close(); probes++; }
      report.probes = probes;
      self.postMessage(report);
    } else if (phase === 'reopen') {
      const pool = await sqlite3.installOpfsSAHPoolVfs(options);
      const db = new pool.OpfsSAHPoolDb(filename, 'r');
      const row = db.selectValue('SELECT value FROM evidence');
      const integrity = db.selectValue('PRAGMA quick_check');
      db.close();
      pool.pauseVfs();
      self.postMessage({ ok: true, row, integrity, files: await filesAndHashes() });
    } else throw new Error('Unknown fixture phase');
  } catch (error) {
    self.postMessage({ ok: false, error: error.stack || String(error) });
  }
};

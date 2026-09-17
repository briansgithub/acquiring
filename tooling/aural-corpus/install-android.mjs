/** Provision a debug device from verified offline artifacts; never reset app data. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { hashFile, openDatabase } from './common.mjs';

export function inspectBundle(manifestFile, popularityFile, evidenceFile) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const catalogFile = path.resolve(path.dirname(manifestFile), manifest.file);
  if (!/^[a-f0-9]{64}$/.test(manifest.checksum) || hashFile(catalogFile) !== manifest.checksum) throw Error('Catalog checksum mismatch');
  function metadata(file) {
    const db = openDatabase(file, true);
    try {
      if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw Error('Invalid SQLite artifact');
      return Object.fromEntries(db.prepare('SELECT key,value FROM metadata').all().map(r => [r.key,r.value]));
    } finally { db.close(); }
  }
  const catalog = metadata(catalogFile), evidence = metadata(evidenceFile), popularity = metadata(popularityFile);
  if (catalog.schema_version !== 'aural-catalog-1' || catalog.snapshot_id !== manifest.snapshotId || evidence.catalog_snapshot !== manifest.snapshotId) throw Error('Snapshot mismatch');
  if (!popularity.snapshotId || !popularity.provider) throw Error('Invalid popularity overlay');
  return [ ['aural-catalog.db',catalogFile], ['aural-evidence.db',evidenceFile], ['aural-popularity.db',popularityFile] ]
    .map(([name,file]) => ({name,file,checksum:hashFile(file)}));
}

export function installAndroid({ adb, serial, manifest, popularity, evidence }) {
  const files = inspectBundle(manifest,popularity,evidence);
  const app = 'com.acquiring.android';
  function run(...args) {
    const result = spawnSync(adb,['-s',serial,...args],{encoding:'utf8',maxBuffer:1024*1024,windowsHide:true});
    if (result.error || result.status !== 0) throw Error(result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
  }
  // Finish all transfers and verify both sides before changing active files.
  for (const f of files) {
    f.remote = `/data/local/tmp/${f.checksum}.db`;
    run('push',f.file,f.remote);
    if (run('shell','sha256sum',f.remote).split(/\s+/)[0] !== f.checksum) throw Error('Device checksum mismatch');
  }
  run('shell','am','force-stop',app);
  for (const f of files) {
    run('shell','run-as',app,'cp',f.remote,`files/${f.name}.new`);
    if (run('shell','run-as',app,'sha256sum',`files/${f.name}.new`).split(/\s+/)[0] !== f.checksum) throw Error('Private copy checksum mismatch');
  }
  // Each SQLite replacement is atomic. Evidence is snapshot-checked by the app;
  // popularity is independently versioned. This is not a multi-file transaction.
  for (const f of files) run('shell','run-as',app,'mv',`files/${f.name}.new`,`files/${f.name}`);
  return files.map(({name,checksum}) => ({name,checksum}));
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [adb,serial,manifest,popularity,evidence] = process.argv.slice(2);
  if (!evidence) throw Error('Usage: install-android.mjs <adb> <serial> <catalog.db.json> <popularity.db> <evidence.db>');
  console.log(JSON.stringify(installAndroid({adb,serial,manifest,popularity,evidence})));
}

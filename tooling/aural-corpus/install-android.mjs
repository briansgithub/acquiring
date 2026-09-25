/** Provision a debug device from verified offline artifacts; never reset app data. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { hashFile, openDatabase } from './common.mjs';
import { CATALOG_VERSION } from './catalog.mjs';

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
  if (catalog.schema_version !== CATALOG_VERSION || catalog.snapshot_id !== manifest.snapshotId || evidence.catalog_snapshot !== manifest.snapshotId) throw Error('Snapshot mismatch');
  if (!popularity.snapshotId || !popularity.provider) throw Error('Invalid popularity overlay');
  return [ ['aural-catalog.db',catalogFile], ['aural-evidence.db',evidenceFile], ['aural-popularity.db',popularityFile] ]
    .map(([name,file]) => ({name,file,checksum:hashFile(file)}));
}

export async function installAndroid({ adb, serial, manifest, popularity, evidence }) {
  const files = inspectBundle(manifest,popularity,evidence);
  const app = 'com.acquiring.android';
  function run(...args) {
    const result = spawnSync(adb,['-s',serial,...args],{encoding:'utf8',maxBuffer:1024*1024,windowsHide:true});
    if (result.error || result.status !== 0) throw Error(result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
  }
  async function prefixChecksum(file, length) {
    const hash=createHash('sha256');
    if (length) for await (const chunk of fs.createReadStream(file,{end:length-1})) hash.update(chunk);
    return hash.digest('hex');
  }
  // Stream into private staging files: only one new bundle's free space is needed.
  // Bound each adb exec-in stream: long single streams may exit successfully
  // after silently accepting only a prefix on some Windows/Android pairings.
  run('shell','am','force-stop',app);
  for (const f of files) {
    const stage=`files/${f.name}.provision-new`;
    const size=fs.statSync(f.file).size;
    if (size % 4096 !== 0) throw Error('SQLite artifact is not page aligned');
    let resume=0;
    try {
      const staged=Number(run('shell','run-as',app,'stat','-c','%s',stage));
      if (staged > 0 && staged <= size && staged % 4096 === 0 &&
          run('shell','run-as',app,'sha256sum',stage).split(/\s+/)[0] === await prefixChecksum(f.file,staged)) resume=staged;
    } catch { /* No valid prior staging file. */ }
    if (!resume) run('shell','run-as',app,'dd','if=/dev/null',`of=${stage}`);
    const chunkBytes=16*1024*1024;
    for (let offset=resume;offset<size;offset+=chunkBytes) {
      const child=spawn(adb,['-s',serial,'exec-in','run-as',app,'dd',`of=${stage}`,'bs=4096',`seek=${offset/4096}`,'conv=notrunc'],
        {stdio:['pipe','pipe','pipe'],windowsHide:true});
      let output='',error='';
      child.stdout.setEncoding('utf8').on('data',chunk=>{output=(output+chunk).slice(-4096);});
      child.stderr.setEncoding('utf8').on('data',chunk=>{error=(error+chunk).slice(-4096);});
      const finished=new Promise((resolve,reject)=>{
        child.on('error',reject);
        child.on('close',code=>code===0?resolve():reject(Error(error||output||`adb exited ${code}`)));
      });
      await Promise.all([pipeline(fs.createReadStream(f.file,{start:offset,end:Math.min(size,offset+chunkBytes)-1}),child.stdin),finished]);
      const expected=Math.min(size,offset+chunkBytes);
      let actual=Number(run('shell','run-as',app,'stat','-c','%s',stage));
      if (actual!==expected) {
        await new Promise(resolve=>setTimeout(resolve,200));
        actual=Number(run('shell','run-as',app,'stat','-c','%s',stage));
      }
      if (actual!==expected) throw Error(`Short private transfer at byte ${offset}: expected ${expected}, received ${actual}`);
    }
    if (run('shell','run-as',app,'sha256sum',`files/${f.name}.provision-new`).split(/\s+/)[0] !== f.checksum) throw Error('Private copy checksum mismatch');
  }
  // Each SQLite replacement is atomic. Evidence is snapshot-checked by the app;
  // popularity is independently versioned. This is not a multi-file transaction.
  for (const f of files) run('shell','run-as',app,'mv',`files/${f.name}.provision-new`,`files/${f.name}`);
  return files.map(({name,checksum}) => ({name,checksum}));
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [adb,serial,manifest,popularity,evidence] = process.argv.slice(2);
  if (!evidence) throw Error('Usage: install-android.mjs <adb> <serial> <catalog.db.json> <popularity.db> <evidence.db>');
  console.log(JSON.stringify(await installAndroid({adb,serial,manifest,popularity,evidence})));
}

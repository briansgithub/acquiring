import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { openDatabase, transaction, stableJson, hashFile } from './common.mjs';

/** Attach the independently selected curriculum evidence without copying tokens or occurrences. */
export function exportCatalogEvidence(analysisFile,catalogFile,output) {
  const analysis=openDatabase(analysisFile,true),catalog=openDatabase(catalogFile,true),db=openDatabase(output);
  try {
    const sources=analysis.prepare('SELECT id,revision FROM section ORDER BY id').all();
    const current=catalog.prepare('SELECT id,revision FROM catalog_section ORDER BY id').all();
    if(stableJson(sources)!==stableJson(current)) throw Error('Evidence and catalog must describe identical section revisions');
    db.exec('CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE evidence(pattern_id TEXT PRIMARY KEY,stats BLOB); CREATE TABLE denominator(view TEXT,length INTEGER,total INTEGER,PRIMARY KEY(view,length))');
    let count=0;
    transaction(db,()=>{
      const snapshot=catalog.prepare("SELECT value FROM metadata WHERE key='snapshot_id'").get().value;
      db.prepare('INSERT INTO metadata VALUES (?,?)').run('catalog_snapshot',snapshot);
      const insert=db.prepare('INSERT INTO evidence VALUES (?,?)');
      for(const row of analysis.prepare('SELECT pattern_id,stats FROM progression_stats').iterate()) {
        const stats=JSON.parse(row.stats);
        for(const key of ['tokens','intervalStart','intervalEnd','sourcePosition']) delete stats[key];
        insert.run(row.pattern_id,gzipSync(Buffer.from(stableJson(stats)))); count++;
      }
      const denominators=new Map();
      for(const row of analysis.prepare('SELECT view,tokens FROM run').iterate()) {
        const length=JSON.parse(row.tokens).length;
        for(let k=2;k<=length;k++) { const key=row.view+':'+k; denominators.set(key,(denominators.get(key)??0)+length-k+1); }
      }
      const put=db.prepare('INSERT INTO denominator VALUES (?,?,?)');
      for(const [key,total] of denominators) { const [view,length]=key.split(':');put.run(view,Number(length),total); }
    });
    return {patterns:count,byteSize:fs.statSync(output).size,checksum:hashFile(output)};
  } finally { analysis.close();catalog.close();db.close(); }
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const [analysis,catalog,output]=process.argv.slice(2); if(!output || fs.existsSync(output)) throw Error('Use analysis.db catalog.db NEW-output.db');
  console.log(JSON.stringify(exportCatalogEvidence(analysis,catalog,output)));
}

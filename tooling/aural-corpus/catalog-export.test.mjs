import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { normalizeSection } from './normalize.mjs';
import { discoverPatterns, getPattern } from './miner.mjs';
import { exportCatalog } from './catalog-export.mjs';
import { hashFile, openDatabase } from './common.mjs';
import { inspectBundle } from './install-android.mjs';

test('compact device export preserves source sections and indexed occurrence endpoint spans',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'aural-catalog-'));
  try {
    const source={sectionName:'Verse',songId:'source',metadata:{keys:[{beat:1,tonic:'D',scale:'minor'}]},chords:[1,5,1,5].map((root,i)=>({root,beat:i*2+1,duration:2,type:7}))};
    const normalized=normalizeSection({songId:'song',section:source});
    const cacheFile=path.join(directory,'normalized.db'); const cache=openDatabase(cacheFile);
    cache.exec('CREATE TABLE sections(id TEXT,song_id TEXT,revision TEXT,source TEXT,normalized TEXT)');
    cache.prepare('INSERT INTO sections VALUES (?,?,?,?,?)').run(normalized.sectionId,'song',normalized.revision,JSON.stringify(source),JSON.stringify(normalized));cache.close();
    const index=discoverPatterns(normalized.runs),file=path.join(directory,'catalog.db');
    const result=exportCatalog({file,index,songs:[{slug:'song',title:'Title',artist:'Artist'}],normalizedFile:cacheFile,snapshotId:'test'});
    assert.ok(result.sequenceCount>0);
    const db=openDatabase(file,true);
    assert.deepEqual(JSON.parse(gunzipSync(db.prepare('SELECT source FROM catalog_section').get().source)),source);
    const r=index.runs.find(r=>r.view==='harmony'),p=getPattern(index,{view:'harmony',tokens:r.tokens.slice(0,2),minSongs:1});
    const spans=db.prepare('SELECT s.start_index,e.end_index FROM catalog_suffix s JOIN catalog_suffix e ON e.run_id=s.run_id AND e.offset=s.offset+1 WHERE s.rank BETWEEN ? AND ?').all(p.intervalStart,p.intervalEnd);
    assert.deepEqual(spans.map(s=>[s.start_index,s.end_index]).sort(),[[0,1],[2,3]]);
    assert.equal(db.prepare('SELECT count(*) n FROM catalog_section').get().n,1);
    db.close();
    const evidenceFile=path.join(directory,'evidence.db'),popularityFile=path.join(directory,'popularity.db');
    for (const [name,entries] of [[evidenceFile,[['catalog_snapshot','test']]],[popularityFile,[['snapshotId','pop-test'],['provider','ListenBrainz']]]]) {
      const overlay=openDatabase(name);overlay.exec('CREATE TABLE metadata(key TEXT,value TEXT)');
      for(const entry of entries) overlay.prepare('INSERT INTO metadata VALUES (?,?)').run(...entry);
      overlay.close();
    }
    const manifestFile=path.join(directory,'catalog.json');
    const manifest={snapshotId:'test',file:'catalog.db',checksum:hashFile(file)};
    fs.writeFileSync(manifestFile,JSON.stringify(manifest));
    assert.equal(inspectBundle(manifestFile,popularityFile,evidenceFile).length,3);
    fs.writeFileSync(manifestFile,JSON.stringify({...manifest,snapshotId:'wrong'}));
    assert.throws(()=>inspectBundle(manifestFile,popularityFile,evidenceFile),/Snapshot mismatch/);
    fs.writeFileSync(manifestFile,JSON.stringify({...manifest,checksum:'0'.repeat(64)}));
    assert.throws(()=>inspectBundle(manifestFile,popularityFile,evidenceFile),/checksum mismatch/);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

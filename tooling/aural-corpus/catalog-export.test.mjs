import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { normalizeSection } from './normalize.mjs';
import { discoverPatterns, getPattern, descriptor } from './miner.mjs';
import { LOOP_REDUCTION_VERSION, reduceLoop } from './loop-reduction.mjs';
import { exportCatalog } from './catalog-export.mjs';
import { hashFile, openDatabase } from './common.mjs';
import { inspectBundle } from './install-android.mjs';
import { startingRomanGroup } from './catalog.mjs';

test('starting chord groups retain accidental degree case quality and seventh',()=>{
  assert.deepEqual(startingRomanGroup('bVII13sus4/V'),startingRomanGroup('♭VII7'));
  assert.deepEqual(startingRomanGroup('#ivø7(lyd)'),startingRomanGroup('♯ivø9'));
  for (const inversion of ['V65','V43','V42']) assert.deepEqual(startingRomanGroup(inversion),startingRomanGroup('V7'));
  assert.deepEqual(startingRomanGroup('Iadd9sus4'),startingRomanGroup('I'));
  const labels=['I','i','I7','I△7','ii°','iiø7','III+'];
  assert.equal(new Set(labels.map(label=>startingRomanGroup(label).id)).size,labels.length);
  assert.notEqual(startingRomanGroup('IV').id,startingRomanGroup('iv').id);
  assert.notEqual(startingRomanGroup('V').id,startingRomanGroup('V7').id);
});

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
    const metadata=Object.fromEntries(db.prepare('SELECT key,value FROM metadata').all().map(r=>[r.key,r.value]));
    assert.equal(metadata.sequence_reduction_version,LOOP_REDUCTION_VERSION);
    assert.ok(Number(metadata.raw_sequence_count)>Number(metadata.sequence_count));
    let retained=0;
    for(const range of db.prepare('SELECT start,end,min_length,max_length FROM catalog_range').all()) {
      for(let length=range.min_length;length<=range.max_length;length++) {
        assert.equal(reduceLoop(descriptor(index,range,length).tokens).redundant,false);retained++;
      }
    }
    assert.equal(retained,Number(metadata.sequence_count));
    assert.deepEqual(JSON.parse(gunzipSync(db.prepare('SELECT source FROM catalog_section').get().source)),source);
    assert.deepEqual(db.prepare('SELECT DISTINCT view FROM catalog_range ORDER BY view').all().map(row=>row.view),
      ['harmony','harmony_bass','relative_harmony','relative_harmony_bass']);
    assert.deepEqual(db.prepare("SELECT DISTINCT mode FROM catalog_range WHERE view='harmony'").all().map(row=>row.mode),['minor']);
    assert.ok(db.prepare("SELECT count(*) n FROM catalog_range WHERE start_group IS NOT NULL AND start_group_label IS NOT NULL").get().n>0);
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('range_frequency','range_mode_frequency') ORDER BY name").all().map(row=>row.name),
      ['range_frequency','range_mode_frequency']);
    const relativeRun=db.prepare("SELECT key_json,source_key_json FROM catalog_run WHERE view='relative_harmony'").get();
    assert.deepEqual(JSON.parse(relativeRun.key_json),{scale:'major',tonic:'F'});
    assert.deepEqual(JSON.parse(relativeRun.source_key_json),{scale:'minor',tonic:'D'});
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

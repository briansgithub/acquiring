import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCanonical, fetchCounts } from './listenbrainz.mjs';
import { validateProviderImport, buildPopularitySnapshot } from './popularity.mjs';
const song={slug:'artist__song',artist:'Artist',title:'Song'};
const candidate={artist_credit_name:'Artist',recording_name:'Song',recording_mbid:'mbid',release_name:'Album'};
const input=observations=>({schemaVersion:1,provider:'listenbrainz',dataVersion:'test',collectedAt:'2026-09-17T00:00:00.000Z',rights:{allowRawStorage:true,allowDerivedRedistribution:true,basis:'CC0'},observations});
test('canonical metadata is explicit evidence, never falsely an exact identifier or reviewed studio match',()=>{
  const row=chooseCanonical(song,[candidate],'dump');
  assert.equal(row.match.method,'canonical_metadata'); assert.equal(row.match.reviewed,false); assert.equal(row.versionKind,'canonical');
  assert.doesNotThrow(()=>validateProviderImport(input([row])));
  assert.throws(()=>validateProviderImport(input([{...row,identityEvidence:null}])));
});
test('identity disagreement, duplicate candidates and explicit recording versions remain unranked',()=>{
  assert.equal(chooseCanonical(song,[],'dump').match.status,'unmatched');
  assert.equal(chooseCanonical(song,[{...candidate,artist_credit_name:'Cover artist'}],'dump').match.status,'unmatched');
  assert.equal(chooseCanonical(song,[candidate,{...candidate,recording_mbid:'other'}],'dump').match.status,'ambiguous');
  for(const release_name of ['Live in London','Faz um Milagre em Mim Ao Vivo','En Vivo','Karaoke Hits']) assert.equal(chooseCanonical(song,[{...candidate,release_name}],'dump').match.status,'ambiguous');
});
test('unknown count stays null and throttling retries without an API key',async()=>{
  let n=0; const waits=[];
  const rows=await fetchCounts(['mbid'],{wait:async ms=>waits.push(ms),fetchImpl:async()=>++n===1 ? new Response('{}',{status:429,headers:{'retry-after':'2'}}) : new Response(JSON.stringify([{recording_mbid:'mbid',total_listen_count:null,total_user_count:null}]))});
  assert.equal(rows[0].total_user_count,null); assert.deepEqual(waits,[2000]);
});
test('cumulative listener and play percentiles have explicit 80/20 weights, no invented recent signal',()=>{
  const rows=['a','b','c'].map((id,i)=>{
    const row=chooseCanonical({...song,slug:id},[{...candidate,recording_mbid:id}],'dump');
    row.measurements=[{metric:'listeners',value:i,weight:.8},{metric:'plays',value:2-i,weight:.2}].map(m=>({...m,category:'enduring',unit:'count',territory:'global',timeWindow:'lifetime',observedAt:'2026-09-17T00:00:00.000Z'}));
    return row;
  });
  const snapshot=buildPopularitySnapshot(input(rows));
  assert.deepEqual(snapshot.songs.map(s=>Number(s.score.toFixed(6))),[.2,.5,.8]);
  assert.ok(snapshot.songs.every(s=>s.components.recent===null));
});

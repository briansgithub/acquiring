import test from 'node:test';
import assert from 'node:assert/strict';
import { matchLastfm, scoreLastfm, fetchLastfm } from './lastfm.mjs';
test('optional Last.fm adapter preserves identity uncertainty and version qualifiers',()=>{
  const data={track:{name:'Song',artist:{name:'Artist'},url:'https://www.last.fm/music/Artist/_/Song',listeners:'10',playcount:'100'}};
  assert.equal(matchLastfm({id:'a',title:'Song',artist:'Artist'},data,'2026-09-17').status,'matched');
  assert.equal(matchLastfm({id:'a',title:'Song (Live)',artist:'Artist'},data,'2026-09-17').status,'ambiguous');
  assert.equal(matchLastfm({id:'a',title:'Song',artist:'Another'},data,'2026-09-17').confidence,0);
  assert.equal(scoreLastfm([],['a']).songs[0].score,null);
});
test('Last.fm errors never disclose request URLs or keys',async()=>{
  await assert.rejects(fetchLastfm({title:'Song',artist:'Artist'},{apiKey:'SECRET',fetchImpl:async()=>new Response('{"error":10}')}),error=>!error.message.includes('SECRET') && error.message.includes('rejected'));
});
test('Last.fm cache directives override the default refresh interval',async()=>{
  const at='2026-09-17T00:00:00.000Z';
  for(const [header,seconds] of [['max-age=60',60],['no-cache, max-age=60',0]]) {
    const row=await fetchLastfm({title:'Song',artist:'Artist'},{apiKey:'fixture',now:()=>at,
      fetchImpl:async()=>new Response('{"error":6}',{headers:{'cache-control':header}})});
    assert.equal(Date.parse(row.refreshAfter)-Date.parse(at),seconds*1000);
  }
});

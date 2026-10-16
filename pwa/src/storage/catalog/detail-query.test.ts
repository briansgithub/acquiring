import {expect,it} from 'vitest';
import {SONG_DETAIL_LIMITS,songDetailQuery,songPayloadRecord,readSongComplexity} from './detail-query';
const row=()=>({slug:'A/raw slug',artist:null,title:'Raw_Title',url:'https://example.test',status:'complete',payloadType:'blob',payloadBytes:2,dataBlob:new Uint8Array([1,2])});
it('uses native exact equality with bound raw slug and caps materialized blob in SQL',()=>{
  const slug="x' OR 1=1 --_%";const plan=songDetailQuery(slug);
  expect(plan.bind).toEqual([SONG_DETAIL_LIMITS.compressedBytes,slug]);
  expect(plan.sql).not.toContain(slug);expect(plan.sql).toContain('WHERE slug=? LIMIT 1');
  expect(plan.sql).toContain("typeof(dataBlob)='blob' AND length(dataBlob)<=?");
  for(const value of ['',null,undefined,3,{},'x\0y','x'.repeat(2049)])expect(()=>songDetailQuery(value as string)).toThrow('Invalid song');
});
it('distinguishes absent rows/null blobs/empty bytes and snapshots the selected payload',()=>{
  expect(songPayloadRecord('snapshot',undefined)).toBeNull();
  expect(songPayloadRecord('s',{...row(),payloadType:'null',payloadBytes:null,dataBlob:null})?.data).toBeNull();
  expect(songPayloadRecord('s',{...row(),payloadBytes:0,dataBlob:new Uint8Array()})?.data).toEqual(new Uint8Array());
  const input=row(),result=songPayloadRecord('snapshot',input)!;
  input.dataBlob[0]=9;input.title='changed';
  expect(result).toEqual({sourceSnapshot:'snapshot',song:{slug:'A/raw slug',artist:null,title:'Raw_Title',url:'https://example.test',status:'complete'},data:new Uint8Array([1,2])});
});
it('rejects oversized/type-corrupt/truncated responses without converting them to missing data',()=>{
  for(const change of [{artist:3},{url:null},{payloadType:'text'},{payloadBytes:NaN},{payloadBytes:-1},{payloadBytes:1},{dataBlob:null}]) {
    expect(()=>songPayloadRecord('s',{...row(),...change})).toThrow();
  }
  expect(()=>songPayloadRecord('s',{...row(),payloadBytes:SONG_DETAIL_LIMITS.compressedBytes+1,dataBlob:null})).toThrow('browser limit');
});

it('reads optional complexity by bound exact slug without clamping, and isolates lookup failures',()=>{
  const slug="raw'_%";
  for(const score of [0,77.05,-1,101])expect(readSongComplexity(slug,(sql,bind)=>{
    expect(sql).toBe('SELECT complexityRating FROM song_browse_entries WHERE slug=? LIMIT 1');
    expect(bind).toEqual([slug]);return score;
  })).toBe(score);
  for(const score of [null,undefined,'77',NaN,Infinity])expect(readSongComplexity(slug,()=>score)).toBeNull();
  expect(readSongComplexity(slug,()=>{throw new Error('unavailable optional metadata');})).toBeNull();
});

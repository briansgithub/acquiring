import {gzipSync} from 'node:zlib';
import {expect,it} from 'vitest';
import {SONG_DETAIL_LIMITS,type SongPayload} from '../../storage/catalog/detail-query';
import {readSongDetails} from './reader';
const sections=JSON.stringify({'10':{sectionName:'Chorus',sectionIndex:1,chords:[]},'2':{sectionName:'Verse',sectionIndex:0,chords:[]}});
const song=()=>({slug:'raw-slug',artist:null,title:'Raw_Title',url:'https://example.test',status:'complete'});
const payload=(data:Uint8Array|null):SongPayload=>({sourceSnapshot:'source-1',song:song(),data});
const client=(data:Uint8Array|null)=>({songPayload:async()=>payload(data)});
it('decodes gzip/raw native payloads through existing repair/order without normalizing raw IDs',async()=>{
  for(const data of [new TextEncoder().encode(sections),new Uint8Array(gzipSync(sections))]){
    const result=await readSongDetails(client(data),'raw-slug');
    expect(result?.sourceSnapshot).toBe('source-1');expect(result?.song).toEqual(song());
    expect(result?.sections.map(([id])=>id)).toEqual(['2','10']);
  }
});
it('keeps missing song/missing payload/invalid JSON and mismatched identity distinct',async()=>{
  expect(await readSongDetails({songPayload:async()=>null},'raw-slug')).toBeNull();
  await expect(readSongDetails(client(null),'raw-slug')).rejects.toMatchObject({code:'PAYLOAD_MISSING'});
  await expect(readSongDetails(client(new Uint8Array()),'raw-slug')).rejects.toThrow();
  await expect(readSongDetails(client(new TextEncoder().encode('{}')),'different')).rejects.toMatchObject({code:'INTEGRITY'});
  await expect(readSongDetails(client(new TextEncoder().encode('{broken')),'raw-slug')).rejects.toThrow();
});
it('never raw-falls-back after decompression exceeds its explicit resource limit',async()=>{
  const compressed=new Uint8Array(gzipSync(' '.repeat(SONG_DETAIL_LIMITS.decodedBytes+1)));
  expect(compressed.length).toBeLessThan(SONG_DETAIL_LIMITS.compressedBytes);
  await expect(readSongDetails(client(compressed),'raw-slug')).rejects.toMatchObject({code:'LIMIT'});
  await expect(readSongDetails(client(new Uint8Array(SONG_DETAIL_LIMITS.compressedBytes+1)),'raw-slug')).rejects.toMatchObject({code:'LIMIT'});
  await expect(readSongDetails(client(new TextEncoder().encode('{"x":'+ '['.repeat(129)+'0'+']'.repeat(129)+'}')),'raw-slug')).rejects.toMatchObject({code:'LIMIT'});
  const tooMany=Object.fromEntries(Array.from({length:4097},(_,i)=>['s'+i,{chords:[]}]));
  await expect(readSongDetails(client(new TextEncoder().encode(JSON.stringify(tooMany))),'raw-slug')).rejects.toMatchObject({code:'LIMIT'});
});
it('does not publish a cancelled read before or after a pending catalog response',async()=>{
  const before=new AbortController();before.abort();let calls=0;
  await expect(readSongDetails({songPayload:async()=>{calls++;return null;}},'raw-slug',before.signal)).rejects.toMatchObject({code:'CLOSED'});
  expect(calls).toBe(0);
  const after=new AbortController();let resolve!:(value:SongPayload)=>void;
  const pending=readSongDetails({songPayload:()=>new Promise< SongPayload>(yes=>{resolve=yes;})},'raw-slug',after.signal);
  after.abort();resolve(payload(new TextEncoder().encode(sections)));
  await expect(pending).rejects.toMatchObject({code:'CLOSED'});
});

it('retains optional song-level scores including zero without changing the decoded sections',async()=>{
  for(const score of [0,77.05,null,undefined]){
    const result=await readSongDetails({songPayload:async()=>({...payload(new TextEncoder().encode(sections)),complexityRating:score})},'raw-slug');
    expect(result?.complexityRating).toBe(score??null);expect(result?.sections.map(([id])=>id)).toEqual(['2','10']);
  }
});

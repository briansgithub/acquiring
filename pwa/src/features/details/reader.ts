import type {ExtractedSection,Song} from '../../contracts';
import {parseSections,sectionsInSongOrder} from '../../domain/data';
import {SONG_DETAIL_LIMITS,type SongPayload} from '../../storage/catalog/detail-query';
import {CatalogError} from '../../storage/catalog/protocol';

export interface SongDetails {readonly sourceSnapshot:string;readonly song:Song;readonly sections:readonly (readonly [string,ExtractedSection])[]}
export interface SongDetailClient {songPayload(slug:string):Promise<SongPayload|null>}
function checkAbort(signal?:AbortSignal):void {if(signal?.aborted)throw new CatalogError('CLOSED','Song read cancelled');}

async function boundedText(data:Uint8Array,signal?:AbortSignal):Promise<string> {
  checkAbort(signal);
  if(data.byteLength>SONG_DETAIL_LIMITS.compressedBytes)throw new CatalogError('LIMIT','Song payload exceeds the browser limit');
  const snapshot=new Uint8Array(data);
  const reader=new Blob([snapshot]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks:Uint8Array[]=[];let size=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try {
    while(true){
      checkAbort(signal);
      const item=await reader.read();checkAbort(signal);
      if(item.done)break;
      size+=item.value.byteLength;
      if(size>SONG_DETAIL_LIMITS.decodedBytes)throw new CatalogError('LIMIT','Decoded song exceeds the browser limit');
      chunks.push(item.value);
    }
    const result=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
    return new TextDecoder('utf-8',{ignoreBOM:true}).decode(result);
  } catch(error) {
    void reader.cancel().catch(()=>{});
    checkAbort(signal);
    if(error instanceof CatalogError)throw error;
    // Frozen Android DataUtils falls back to replacement-tolerant raw UTF-8 on gzip failure.
    return new TextDecoder('utf-8',{ignoreBOM:true}).decode(snapshot);
  } finally {signal?.removeEventListener('abort',abort);reader.releaseLock();}
}

function checkDepth(text:string):void {
  let quoted=false,depth=0;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){if(char==='\\')i++;else if(char==='"')quoted=false;}
    else if(char==='"')quoted=true;
    else if(char==='{'||char==='['){if(++depth>SONG_DETAIL_LIMITS.jsonDepth)throw new CatalogError('LIMIT','Song JSON nesting exceeds the browser limit');}
    else if(char==='}'||char===']')depth--;
  }
}

/** One exact raw slug; no title normalization, network harvest or catalog/user writes. Caller owns client lifetime. */
export async function readSongDetails(client:SongDetailClient,slug:string,signal?:AbortSignal):Promise<SongDetails|null> {
  checkAbort(signal);
  const payload=await client.songPayload(slug);checkAbort(signal);
  if(!payload)return null;
  if(payload.song.slug!==slug)throw new CatalogError('INTEGRITY','Song response identifier mismatch');
  if(payload.data===null)throw new CatalogError('PAYLOAD_MISSING','This song has no downloaded chord data');
  const song={...payload.song},sourceSnapshot=payload.sourceSnapshot;
  const text=await boundedText(payload.data,signal);checkDepth(text);checkAbort(signal);
  const sections=parseSections(text);
  if(sections.size>SONG_DETAIL_LIMITS.sections)throw new CatalogError('LIMIT','Song section count exceeds the browser limit');
  return {sourceSnapshot,song,sections:sectionsInSongOrder(sections)};
}

import type {Song} from '../../contracts';
import {CatalogError} from './protocol';

export const SONG_DETAIL_LIMITS=Object.freeze({slugCharacters:2048,compressedBytes:8*1024*1024,decodedBytes:32*1024*1024,sections:4096,jsonDepth:128});
export interface SongPayload {readonly sourceSnapshot:string;readonly song:Song;readonly data:Uint8Array|null}

/** Native SongDao.getSongBySlug equality, with bounded materialization before the blob crosses RPC. */
export function songDetailQuery(slug:string):{sql:string;bind:(string|number)[]} {
  if(typeof slug!=='string'||!slug.length||slug.length>SONG_DETAIL_LIMITS.slugCharacters||slug.includes('\0')) {
    throw new CatalogError('INVALID_REQUEST','Invalid song identifier');
  }
  return {sql:`SELECT slug,artist,title,url,status,typeof(dataBlob) AS payloadType,length(dataBlob) AS payloadBytes,
    CASE WHEN typeof(dataBlob)='blob' AND length(dataBlob)<=? THEN dataBlob ELSE NULL END AS dataBlob
    FROM songs WHERE slug=? LIMIT 1`,bind:[SONG_DETAIL_LIMITS.compressedBytes,slug]};
}

export function songPayloadRecord(sourceSnapshot:string,row:Record<string,unknown>|undefined):SongPayload|null {
  if(!row)return null;
  if(typeof row.slug!=='string'||typeof row.url!=='string'||typeof row.status!=='string'
    ||row.artist!==null&&typeof row.artist!=='string'||row.title!==null&&typeof row.title!=='string') {
    throw new CatalogError('INTEGRITY','Invalid song metadata');
  }
  if(row.payloadType!=='null'&&row.payloadType!=='blob')throw new CatalogError('INTEGRITY','Invalid song payload type');
  if(row.payloadType==='blob'&&(!Number.isSafeInteger(row.payloadBytes)||Number(row.payloadBytes)<0))throw new CatalogError('INTEGRITY','Invalid song payload size');
  if(Number(row.payloadBytes)>SONG_DETAIL_LIMITS.compressedBytes)throw new CatalogError('LIMIT','Song payload exceeds the browser limit');
  if(row.payloadType==='blob'&&(!(row.dataBlob instanceof Uint8Array)||row.dataBlob.byteLength!==row.payloadBytes))throw new CatalogError('INTEGRITY','Incomplete song payload');
  return {sourceSnapshot,song:{slug:row.slug,artist:row.artist,title:row.title,url:row.url,status:row.status},
    data:row.payloadType==='null'?null:new Uint8Array(row.dataBlob as Uint8Array)};
}

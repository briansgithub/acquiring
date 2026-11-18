/** N15 (Android 1b86ef6c AuralCatalog.exampleSongs): one candidate per catalog_song in id order, scored by the
 * installed aural-popularity.db. Bounded like the other aural reads; text values come back as JS strings. */
import {CatalogError} from './protocol';
import type {AuralReadDatabase} from './aural-read-contracts';

export interface AuralExampleSong {readonly slug:string;readonly title:string;readonly artist:string;readonly score:number|null}
export interface AuralExampleSongs {readonly sourceSnapshot:string;readonly songs:readonly AuralExampleSong[]}

const MAX_SONGS=50_000;
const MAX_TEXT=4096;

export function readAuralExampleSongRows(db:AuralReadDatabase):{slug:string;title:string;artist:string}[] {
  let rows:Record<string,unknown>[];
  try {
    rows=db.selectObjects(`SELECT id,typeof(id) AS idType,title,typeof(title) AS titleType,artist,typeof(artist) AS artistType
      FROM catalog_song ORDER BY id LIMIT ${MAX_SONGS+1}`,[]);
  } catch {throw new CatalogError('INTEGRITY','Invalid aural example songs');}
  if(rows.length>MAX_SONGS)throw new CatalogError('LIMIT','Aural example songs exceed the browser limit');
  const text=(row:Record<string,unknown>,name:string,fallback:string)=>{
    const value=row[name];
    if(row[name+'Type']!=='text'||typeof value!=='string')return fallback;
    if(value.length>MAX_TEXT)throw new CatalogError('LIMIT','Aural example song text exceeds the browser limit');
    return value;
  };
  return rows.map(row=>{
    if(row.idType!=='text'||typeof row.id!=='string'||!row.id||row.id.length>MAX_TEXT)throw new CatalogError('INTEGRITY','Invalid aural example song id');
    const slug=row.id;
    return {slug,title:text(row,'title',slug),artist:text(row,'artist','')};
  });
}

/** Native popularity[slug].score accepted only when finite and within 0..1. */
export function exampleSongScore(score:number|null|undefined):number|null {
  return typeof score==='number'&&Number.isFinite(score)&&score>=0&&score<=1?score:null;
}

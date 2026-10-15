/** Pure AllSongsGrouping port, Android authority801cf798 SongBrowse.kt. */
import type { ExtractedSection } from '../../contracts';

export interface SongBrowseRow { slug:string; artist:string|null; title:string|null; complexityRating?:number|null }
export interface SongBrowseEntry extends SongBrowseRow { alphaGroup:string; complexityRating:number|null; complexityBucket:number|null }
export interface AllSongsGroup { readonly key:string; readonly label:string }
export type AllSongsSortMode = 'alphabetical'|'complexity'|'mode';
export type DiatonicMode = 'ionian'|'dorian'|'phrygian'|'lydian'|'mixolydian'|'aeolian'|'locrian';
export const UNRATED_KEY='unrated';
const group=(key:string,label=key):AllSongsGroup=>Object.freeze({key,label});
export const alphabeticalGroups:readonly AllSongsGroup[]=Object.freeze([
  ...Array.from({length:26},(_,i)=>group(String.fromCharCode(65+i))),
  ...Array.from({length:10},(_,i)=>group(String(i))),group('#'),
]);
export const complexityGroups:readonly AllSongsGroup[]=Object.freeze([
  ...Array.from({length:10},(_,i)=>group(String(i),`${i*10}-${i*10+10}`)),group(UNRATED_KEY,'Unrated'),
]);
export const modeGroups:readonly AllSongsGroup[]=Object.freeze([
  group('ionian','Ionian (Major)'),group('dorian','Dorian'),group('phrygian','Phrygian'),
  group('lydian','Lydian'),group('mixolydian','Mixolydian'),group('aeolian','Aeolian (minor)'),group('locrian','Locrian'),
]);
export function groupsFor(mode:AllSongsSortMode):readonly AllSongsGroup[] {
  return mode==='alphabetical'?alphabeticalGroups:mode==='complexity'?complexityGroups:modeGroups;
}
export const toggledExpandedGroup=(current:string|null,selected:string):string|null=>current===selected?null:selected;
export function alphabeticalGroup(title:string|null):string {
  const first=title?.trim().charAt(0).toUpperCase()??'';
  return /^[A-Z0-9]$/.test(first)?first:'#';
}
const fuzzySearchText=(value:string|null):string=>(value??'').toLowerCase().replace(/[ _-]/g,'');
export function fuzzySongMatches(song:Pick<SongBrowseRow,'artist'|'title'>,filterText:string):boolean {
  const query=fuzzySearchText(filterText);
  return fuzzySearchText(song.title).includes(query)||fuzzySearchText(song.artist).includes(query);
}
const validRating=(rating:number|null):rating is number=>rating!==null&&Number.isFinite(rating)&&rating>=0&&rating<=100;
export function complexityBucket(rating:number|null):number|null {
  return validRating(rating)?rating===100?9:Math.trunc(rating/10):null;
}
export function complexityOnesDigit(rating:number|null):number|null {
  return validRating(rating)?rating===100?9:Math.trunc(rating)%10:null;
}
export function canonicalMode(raw:string|null):DiatonicMode|null {
  const value=raw?.trim().toLowerCase().replace(/[ _-]/g,'');
  switch(value){
    case 'major':case 'ionian':return 'ionian';
    case 'minor':case 'aeolian':case 'naturalminor':return 'aeolian';
    case 'dorian':case 'phrygian':case 'lydian':case 'mixolydian':case 'locrian':return value;
    default:return null;
  }
}
export function canonicalModes(values:Iterable<string|null>):Set<DiatonicMode> {
  const result=new Set<DiatonicMode>();
  for(const value of values){const mode=canonicalMode(value);if(mode)result.add(mode);}
  return result;
}
/** Every key event in every section contributes, with stable first-observed order. */
export function modesInSections(sections:Iterable<ExtractedSection>):Set<DiatonicMode> {
  const scales:string[]=[];
  for(const section of sections){
    const keys=section.metadata?.keys;
    if(!Array.isArray(keys))continue;
    for(const key of keys){
      if(key&&typeof key==='object'&&!Array.isArray(key)&&typeof key.scale==='string')scales.push(key.scale);
    }
  }
  return canonicalModes(scales);
}
export function browseEntry(song:Pick<SongBrowseRow,'slug'|'artist'|'title'>,rating:number|null=null):SongBrowseEntry {
  return {slug:song.slug,artist:song.artist,title:song.title,alphaGroup:alphabeticalGroup(song.title),complexityRating:rating,complexityBucket:complexityBucket(rating)};
}

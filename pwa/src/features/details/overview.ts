import type {ExtractedSection,JsonObject,KeyInfo} from '../../contracts';
import {getBpm,getKeys,keyAtBeat,safeNumericId} from '../../domain/data';
import {doubleOrUndefined,isObject,primitiveContent} from '../../domain/data/primitives';
import {nativeBooleanOrNull} from '../../domain/music/native-json';

export const INFO_LIMITS=Object.freeze({changes:512,notes:65536,chords:4096});
export interface InfoRow {readonly label:string;readonly value:string}
export interface SongOverview {
  readonly rows:readonly InfoRow[];
  readonly changes:readonly {title:string;rows:readonly InfoRow[]}[];
  readonly progression:readonly {chord:JsonObject;beat:number;key:KeyInfo}[];
  readonly numericId:string;
  readonly youtubeUrl:string|null;
}
const num=(object:JsonObject|undefined,key:string)=>doubleOrUndefined(object?.[key]);
const int=(value:number)=>Number.isNaN(value)?0:Math.min(2147483647,Math.max(-2147483648,Math.trunc(value)));
const round=(value:number)=>int(Math.floor(value+.5));
const compare=(a:number,b:number)=>a===b?0:Number.isNaN(a)?Number.isNaN(b)?0:1:Number.isNaN(b)?-1:a<b?-1:1;
export const prettyScale=(scale:string)=>scale.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,char=>char.toUpperCase());
const complexityFormat=new Intl.NumberFormat('en-US',{useGrouping:false,minimumFractionDigits:1,maximumFractionDigits:1});
const beatFormat=new Intl.NumberFormat('en-US',{useGrouping:false,minimumFractionDigits:2,maximumFractionDigits:2});
export const formatBeat=(beat:number)=>Number.isInteger(beat)?String(int(beat)):!Number.isFinite(beat)?String(beat):beatFormat.format(beat).replace(/0+$/,'').replace(/\.$/,'');
function objects(section:ExtractedSection,field:string):JsonObject[]{
  const value=section.metadata?.[field];
  if(!Array.isArray(value))return[];
  if(value.length>INFO_LIMITS.changes)throw new RangeError('This section has too many metadata changes to display.');
  return value.filter(isObject);
}
/** Source-matched InfoTab projection; existing data/theory helpers retain native JSON/key semantics. */
export function songOverview(section:ExtractedSection,uniqueChords:number,complexityRating:number|null=null):SongOverview {
  if(section.chords.length>INFO_LIMITS.chords)throw new RangeError('This section has too many chords to display.');
  objects(section,'keys');
  const keys=getKeys(section),tempos=objects(section,'tempos'),meters=objects(section,'meters'),bpm=getBpm(section);
  const first=keys[0].key,beatsPerMeasure=num(meters[0],'numBeats');
  const rows:InfoRow[]=[{label:'Key',value:first.tonic+' '+prettyScale(first.scale)},
    {label:'Tempo',value:Number.isFinite(bpm)?round(bpm)+' BPM':'Unknown'}];
  const meter=beatsPerMeasure===undefined?undefined:int(beatsPerMeasure);
  if(meter!==undefined)rows.push({label:'Beats / measure',value:String(meter)});
  const end=num(section.metadata??undefined,'endBeat'),beats=end===undefined?0:Math.max(0,end-1);
  if(beats>0){
    if(!Number.isNaN(beats/bpm)){
      const seconds=round(beats/bpm*60),minutes=Math.trunc(seconds/60),remainder=seconds%60;
      rows.push({label:'Length',value:minutes+':'+String(remainder).padStart(2,'0')});
    }
    const bars=meter!==undefined&&meter>0?int(Math.ceil(beats/meter)):null;
    rows.push({label:'Beats',value:formatBeat(beats)+(bars===null?'':' · '+bars+' bars')});
  }
  rows.push({label:'Chords',value:section.chords.length+' ('+uniqueChords+' unique)'});
  if(complexityRating!==null&&Number.isFinite(complexityRating))rows.push({label:'Complexity score',value:complexityFormat.format(complexityRating)+' / 100'});
  const raw=Array.isArray(section.notes)?section.notes:isObject(section.notes)&&Array.isArray(section.notes.melody1)?section.notes.melody1:[];
  if(raw.length>INFO_LIMITS.notes)throw new RangeError('This section has too many melody entries to display.');
  const notes=raw.filter(isObject),sounded=notes.filter(note=>nativeBooleanOrNull(note.isRest)!==true&&nativeBooleanOrNull(note.rest)!==true).length;
  rows.push({label:'Melody notes',value:notes.length?sounded+' sounded / '+notes.length+' total':'None — chords only'});
  const changes:{title:string;rows:InfoRow[]}[]=[];
  if(keys.length>1)changes.push({title:'Key changes',rows:keys.map(value=>({label:'Beat '+formatBeat(value.beat),value:value.key.tonic+' '+prettyScale(value.key.scale)}))});
  if(tempos.length>1)changes.push({title:'Tempo changes',rows:tempos.map(value=>({label:'Beat '+formatBeat(num(value,'beat')??1),value:round(num(value,'bpm')??120)+' BPM'}))});
  if(meters.length>1)changes.push({title:'Meter changes',rows:meters.map(value=>({label:'Beat '+formatBeat(num(value,'beat')??1),value:int(num(value,'numBeats')??4)+' beats / measure'}))});
  const progression=[...section.chords].sort((a,b)=>compare(num(a,'beat')??0,num(b,'beat')??0)).map(chord=>{
    const beat=num(chord,'beat')??1;return {chord,beat,key:keyAtBeat(keys,beat)};
  });
  const youtube=section.metadata?.youtube,id=isObject(youtube)&&youtube.id!==null?primitiveContent(youtube.id):undefined;
  return {rows,changes,progression,numericId:safeNumericId(section),youtubeUrl:id===undefined?null:'https://www.youtube.com/watch?v='+encodeURIComponent(id)};
}

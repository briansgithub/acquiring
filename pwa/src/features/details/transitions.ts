import type {ExtractedSection,JsonObject,KeyInfo} from '../../contracts';
import {getParsedKey} from '../../domain/data';
import {intOrUndefined,doubleOrUndefined} from '../../domain/data/primitives';
import {getRomanSymbol} from '../../domain/music';
import {nativeBooleanOrNull} from '../../domain/music/native-json';
export interface ChordTransition {readonly id:string;readonly from:JsonObject;readonly to:JsonObject;readonly count:number;readonly firstBeat:number}
export function transitionIdentity(chord:JsonObject,key:KeyInfo,rootOnly:boolean):string {
  return rootOnly?String(intOrUndefined(chord.root)??0):getRomanSymbol(chord,key);
}
const compareDouble=(a:number,b:number):number=>a===b?0:Number.isNaN(a)?Number.isNaN(b)?0:1:Number.isNaN(b)?-1:a<b?-1:1;
/** Frozen ChordTransitions.kt: original input sequence, first representatives, native Double/UTF16 ties. */
export function chordTransitions(section:ExtractedSection,rootOnly:boolean):readonly ChordTransition[] {
  if(!Array.isArray(section?.chords)||section.chords.length>4096)throw new RangeError('Transition chord count exceeds browser limit');
  const key=getParsedKey(section),sequence=section.chords.filter(chord=>{
    const roman=getRomanSymbol(chord,key);
    return nativeBooleanOrNull(chord.isRest)!==true&&nativeBooleanOrNull(chord.rest)!==true&&roman!==''&&roman!=='—'&&roman!=='Rest';
  });
  const seen=new Map<string,{from:JsonObject;to:JsonObject;count:number;firstBeat:number}>();
  for(let index=0;index+1<sequence.length;index++){
    const from=sequence[index],to=sequence[index+1],a=transitionIdentity(from,key,rootOnly),b=transitionIdentity(to,key,rootOnly);
    if(a===b)continue;
    const id=a+' → '+b,current=seen.get(id);
    if(current)current.count++;
    else {const beat=doubleOrUndefined(to.beat)??1;seen.set(id,{from,to,count:1,firstBeat:beat===0?1:beat});}
  }
  // Like native, from/to are the original first-observed objects. Never mutate them.
  return Object.freeze([...seen].map(([id,value])=>Object.freeze({id,...value})).sort((a,b)=>b.count-a.count||compareDouble(a.firstBeat,b.firstBeat)||(a.id<b.id?-1:a.id>b.id?1:0)));
}

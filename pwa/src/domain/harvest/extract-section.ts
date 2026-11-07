/** Frozen DataExtractor + HarvestService assembly, lossless scalar JSON spelling. */
import {readRawJson,stringValue,compactRawJson,type RawJson} from './raw-json';
export interface HarvestApiSection {id:string;song:string;artist:string|null;section:string|null;data:RawJson}
export function decodeHarvestApi(text:string):HarvestApiSection {
  const root=readRawJson(text);if(root.kind!=='object')throw new Error('Expected API object');
  const fields=root.fields!,ID=fields.get('ID'),song=stringValue(fields.get('song'));
  if(!ID||song===undefined)throw new Error('Missing API ID/song');
  function optionalString(key:string):string|null {
    const value=fields.get(key);if(!value||value.raw==='null')return null;
    const result=stringValue(value);if(result===undefined)throw new Error('Invalid API '+key);return result;
  }
  const raw=optionalString('jsonData');if(raw===null)throw new Error('No jsonData in API result');
  const data=readRawJson(raw);if(data.kind!=='object')throw new Error('Expected jsonData object');
  return {id:stringValue(ID)??compactRawJson(ID),song,artist:optionalString('artist'),section:optionalString('section'),data};
}
const META=['version','keys','tempos','meters','sections','endBeat','youtube','lyrics','bands','breaks','pickup'];
export function extractHarvestSection(api:HarvestApiSection,name:string,index:number):string {
  const fields=api.data.fields!,metadata=new Map<string,RawJson>();
  for(const key of META){const value=fields.get(key);if(value)metadata.set(key,value);}
  const settings=fields.get('settings');
  for(const [from,to] of [['externalMP3URL','externalMp3Url'],['externalMP3StartBeat','externalMp3StartBeat'],['externalMP3Duration','externalMp3Duration']]) {
    const value=settings?.fields?.get(from!);if(value)metadata.set(to!,value);
  }
  const result=new Map<string,string>([['songId',JSON.stringify(api.id)],['numericId',JSON.stringify(api.id)],
    ['sectionName',JSON.stringify(name)],['sectionIndex',String(index)],['songInfo',JSON.stringify(api.song)]]);
  const chords=fields.get('chords')?.items?.filter(item=>item.kind==='object')??[];
  if(chords.length)result.set('chords','['+chords.map(compactRawJson).join(',')+']');
  const notes=fields.get('notes');if(notes)result.set('notes',compactRawJson(notes));
  result.set('metadata','{'+[...metadata].map(([key,value])=>JSON.stringify(key)+':'+compactRawJson(value)).join(',')+'}');
  return '{'+[...result].map(([key,value])=>JSON.stringify(key)+':'+value).join(',')+'}';
}

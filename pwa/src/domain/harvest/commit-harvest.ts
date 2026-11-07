/** Native HarvestLedger.record payload, persisted through established T06 record+receipt transaction. */
import type {HarvestDocument} from './harvest-handler';
import {readRawJson,stringValue} from './raw-json';
import {harvestSlugFromUrl} from './harvest-url';
import {encodeHarvestedSong,HARVEST_META_PREFIX} from './user-harvest-ledger';
import {alphabeticalGroup,canonicalMode} from '../../features/library/grouping';
import {encodeModes} from './harvested-song';
import type {Mutation,MutationResult} from '../../storage/user';
export interface HarvestCommitRequest {document:HarvestDocument;operationId:string;harvestedAt:number}
export interface HarvestCommitResult {slug:string;applied:boolean;sequence:number}
export function harvestCommitMutation(request:HarvestCommitRequest):Mutation {
  const invalid=()=>{throw new Error('Invalid complete harvest document');};
  if(!request||typeof request!=='object')return invalid();
  const {document,operationId,harvestedAt}=request;
  if(typeof operationId!=='string'||!operationId.trim()||operationId.length>128||operationId.includes('\0')||!Number.isSafeInteger(harvestedAt)||harvestedAt<0)return invalid();
  const song=document?.song;
  if(!song||typeof song.slug!=='string'||!song.slug.trim()||song.slug.length>512||song.slug.includes('\0')||song.slug.startsWith(HARVEST_META_PREFIX)
    ||typeof song.url!=='string'||song.url.length>2048||harvestSlugFromUrl(song.url)!==song.slug||song.status!=='enriched'
    ||song.artist!==null&&typeof song.artist!=='string'||song.title!==null&&typeof song.title!=='string'
    ||typeof document.data!=='string'||document.data.length>8*1024*1024)return invalid();
  const bytes=new TextEncoder().encode(document.data);if(bytes.length>8*1024*1024)return invalid();
  const sections=readRawJson(document.data);
  if(sections.kind!=='object'||!Number.isInteger(document.sectionCount)||document.sectionCount<1||document.sectionCount>64||sections.fields!.size!==document.sectionCount)return invalid();
  const modes=new Set<string>();let index=0;
  for(const [key,section] of sections.fields!) {
    const fields=section.fields;
    if(!key||section.kind!=='object'||!fields||fields.get('sectionIndex')?.raw!==String(index++)
      ||stringValue(fields.get('songId'))===undefined||stringValue(fields.get('numericId'))===undefined
      ||stringValue(fields.get('sectionName'))===undefined||stringValue(fields.get('songInfo'))===undefined)return invalid();
    const chords=fields.get('chords');if(chords&&(chords.kind!=='array'||chords.items!.some(chord=>chord.kind!=='object')))return invalid();
    const metadata=fields.get('metadata');if(metadata?.kind!=='object')return invalid();
    const keys=metadata.fields!.get('keys');
    for(const key of keys?.items??[]) {
      const mode=canonicalMode(stringValue(key.fields?.get('scale'))??null);if(mode)modes.add(mode);
    }
  }
  return {namespace:'guest',store:'harvests',id:song.slug,operationId,createdAt:harvestedAt,value:encodeHarvestedSong({...song,dataBlob:bytes,alphaGroup:alphabeticalGroup(song.title),modes:encodeModes(modes),harvestedAt})};
}
export async function persistHarvest(request:HarvestCommitRequest,store:{mutate:(mutation:Mutation,signal?:AbortSignal)=>Promise<MutationResult>},signal?:AbortSignal):Promise<HarvestCommitResult> {
  const mutation=harvestCommitMutation(request);
  const result=await store.mutate(mutation,signal);
  return {slug:mutation.id,applied:result.applied,sequence:result.receipt.sequence};
}

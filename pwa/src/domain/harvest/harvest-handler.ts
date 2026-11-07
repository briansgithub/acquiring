/** Repo-side Worker Request/Response contract. No default transport, storage or deployment binding.
 * Production origin/CORS/rate/cache wiring and Library/T06 commit remain separate acceptance gates.
 */
import {pageSectionRefs} from './page-sections';
import {decodeHarvestApi,extractHarvestSection,type HarvestApiSection} from './extract-section';
import {harvestSlugFromUrl} from './harvest-url';
import type {Song} from '../../contracts';
export const HARVEST_LIMITS=Object.freeze({requestBytes:4096,pageBytes:2*1024*1024,apiBytes:4*1024*1024,
  totalBytes:8*1024*1024,outputBytes:8*1024*1024,sections:64,deadlineMs:20_000});
export interface HarvestDocument {song:Song;data:string;sectionCount:number}
export type HarvestFetch=(url:string,init:RequestInit)=>Promise<Response>;
export class HarvestError extends Error {
  constructor(readonly code:'INVALID_REQUEST'|'UPSTREAM'|'NO_SECTIONS'|'LIMIT'|'TIMEOUT'|'CANCELLED',message:string){super(message);}
}
function fail(code:HarvestError['code'],message:string):never {throw new HarvestError(code,message);}
/** Explicit browser extension: only canonical ASCII artist/song paths; never a general URL proxy. */
export function harvestPageUrl(input:unknown):{url:string;original:string} {
  if(typeof input!=='string'||input.length>2048)fail('INVALID_REQUEST','Invalid Hooktheory URL');
  const match=/^https:\/\/(?:www\.)?hooktheory\.com\/theorytab\/view\/([A-Za-z0-9_-]{1,200})\/([A-Za-z0-9_-]{1,200})\/*$/.exec(input.trim());
  if(!match)fail('INVALID_REQUEST','Invalid Hooktheory URL');
  return {url:`https://www.hooktheory.com/theorytab/view/${match[1]}/${match[2]}`,original:input};
}
function abortReason(signal:AbortSignal):HarvestError {
  return signal.reason instanceof HarvestError?signal.reason:new HarvestError('CANCELLED','Harvest cancelled');
}
function check(signal:AbortSignal):void {if(signal.aborted)throw abortReason(signal);}
async function abortable<T>(work:Promise<T>,signal:AbortSignal):Promise<T> {
  check(signal);
  let stop!:()=>void;
  const cancelled=new Promise<never>((_,reject)=>{stop=()=>reject(abortReason(signal));signal.addEventListener('abort',stop,{once:true});});
  try{return await Promise.race([work,cancelled]);}finally{signal.removeEventListener('abort',stop);}
}
async function boundedText(response:Response,limit:number,signal:AbortSignal,budget:{bytes:number}):Promise<string> {
  const length=response.headers.get('content-length');
  if(length&&(/^\d+$/.test(length))&&(Number(length)>limit||Number(length)+budget.bytes>HARVEST_LIMITS.totalBytes)) {
    void response.body?.cancel().catch(()=>{});fail('LIMIT','Harvest response too large');
  }
  if(!response.body)return '';
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{ignoreBOM:true});
  let text='',bytes=0;
  try {
    while(true) {
      check(signal);const next=await abortable(reader.read(),signal);if(next.done)break;
      bytes+=next.value.byteLength;budget.bytes+=next.value.byteLength;
      if(bytes>limit||budget.bytes>HARVEST_LIMITS.totalBytes)fail('LIMIT','Harvest response too large');
      text+=decoder.decode(next.value,{stream:true});
    }
    return text+decoder.decode();
  } catch(error) {void reader.cancel().catch(()=>{});throw error;}
  finally {reader.releaseLock();}
}
async function providerText(url:string,fetcher:HarvestFetch,limit:number,signal:AbortSignal,budget:{bytes:number}):Promise<string> {
  check(signal);
  const response=await abortable(fetcher(url,{method:'GET',redirect:'error',credentials:'omit',signal,headers:{Accept:'text/html, application/json'}}),signal);
  if(response.status<200||response.status>=300||response.redirected||(response.url&&response.url!==url)) {
    void response.body?.cancel().catch(()=>{});fail('UPSTREAM',`Provider request failed (${response.status})`);
  }
  return boundedText(response,limit,signal,budget);
}
/** Fetch each distinct public section ID once; repeated named tabs still become distinct ordered entries. */
async function extractDocument(input:unknown,fetcher:HarvestFetch,signal:AbortSignal,budget:{bytes:number}):Promise<HarvestDocument> {
  const page=harvestPageUrl(input);
  const html=await providerText(page.url,fetcher,HARVEST_LIMITS.pageBytes,signal,budget);
  check(signal);
  const refs=pageSectionRefs(html);
  if(!refs.length)fail('NO_SECTIONS','No sections found on page');
  if(refs.length>HARVEST_LIMITS.sections)fail('LIMIT','Too many sections');
  const cached=new Map<string,HarvestApiSection>(),sections=new Map<string,string>();
  let songTitle='Unknown',artist='Unknown';
  for(const [index,ref] of refs.entries()) {
    check(signal);
    // Encode the entire ID as a single path segment. Never interpolate provider text as a URL/query.
    if(!ref.songId||ref.songId==='.'||ref.songId==='..'||ref.songId.length>512||/[\u0000-\u001f\u007f]/.test(ref.songId))fail('UPSTREAM','Invalid section ID');
    let api=cached.get(ref.songId);
    if(!api) {
      const url=`https://api.hooktheory.com/v1/songs/public/${encodeURIComponent(ref.songId)}?fields=ID,song,section,jsonData`;
      api=decodeHarvestApi(await providerText(url,fetcher,HARVEST_LIMITS.apiBytes,signal,budget));cached.set(ref.songId,api);
    }
    const rawName=ref.sectionName??api.section??`Section ${index+1}`;
    const first=rawName.charAt(0);
    if(first.toLowerCase()===first&&first.toUpperCase()!==first&&!/[a-z]/.test(first))fail('UPSTREAM','Unsupported section name casing');
    const name=/[a-z]/.test(first)?first.toUpperCase()+rawName.slice(1):rawName; // native ASCII titlecase; non-ASCII lowercase is explicitly refused
    let key=ref.songId,duplicate=1;
    while(sections.has(key))key=`${ref.songId}#${index}-${duplicate++}`;
    sections.set(key,extractHarvestSection(api,name,index));
    if(index===0){songTitle=api.song;artist=api.artist??page.original.split('view/')[1]!.split('/')[0]!;}
  }
  // Object.fromEntries/JSON.stringify would reorder integer-like IDs, violating native linkedMap order.
  const data='{'+[...sections].map(([key,value])=>JSON.stringify(key)+':'+value).join(',')+'}';
  const document={song:{slug:harvestSlugFromUrl(page.original),artist,title:songTitle,url:page.original,status:'enriched'},data,sectionCount:sections.size};
  if(new TextEncoder().encode(JSON.stringify(document)).byteLength>HARVEST_LIMITS.outputBytes)fail('LIMIT','Harvest output too large');
  check(signal);return document;
}
/** POST /harvest {url}. Successful response is one complete document, never a partial harvest. */
export function createHarvestHandler(fetcher:HarvestFetch):(request:Request)=>Promise<Response> {
  return async request=>{
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
    if(new URL(request.url).pathname!=='/harvest')return new Response(null,{status:404});
    if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
    const controller=new AbortController();
    const cancel=()=>controller.abort(new HarvestError('CANCELLED','Harvest cancelled'));
    request.signal.addEventListener('abort',cancel,{once:true});if(request.signal.aborted)cancel();
    const timeout=setTimeout(()=>controller.abort(new HarvestError('TIMEOUT','Harvest timed out')),HARVEST_LIMITS.deadlineMs);
    try {
      if(request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')fail('INVALID_REQUEST','Expected JSON request');
      const body=await boundedText(new Response(request.body),HARVEST_LIMITS.requestBytes,controller.signal,{bytes:0});
      let input:unknown;
      try {input=JSON.parse(body);}catch{fail('INVALID_REQUEST','Invalid JSON request');}
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='url'))fail('INVALID_REQUEST','Expected URL request');
      const result=await extractDocument((input as {url?:unknown}).url,fetcher,controller.signal,{bytes:0});
      return new Response(JSON.stringify(result),{headers});
    } catch(error) {
      const known=controller.signal.aborted?abortReason(controller.signal):error instanceof HarvestError?error:new HarvestError('UPSTREAM','Could not extract song');
      const status={INVALID_REQUEST:400,UPSTREAM:502,NO_SECTIONS:422,LIMIT:413,TIMEOUT:504,CANCELLED:499}[known.code];
      return new Response(JSON.stringify({error:{code:known.code,message:known.message}}),{status,headers});
    } finally {clearTimeout(timeout);request.signal.removeEventListener('abort',cancel);}
  };
}

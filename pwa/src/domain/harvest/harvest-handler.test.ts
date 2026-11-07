import {describe,it,expect,vi} from 'vitest';
import {createHarvestHandler,HARVEST_LIMITS,harvestPageUrl,type HarvestDocument,type HarvestFetch} from './harvest-handler';
import {pageSectionRefs} from './page-sections';
import {decodeHarvestApi,extractHarvestSection} from './extract-section';
import {readRawJson,compactRawJson} from './raw-json';
import {parseSections} from '../data/payload';
const url='https://www.hooktheory.com/theorytab/view/artist/song';
const page='<a class="tb-section-tab" href="#tab-10">verse</a><a class="tb-section-tab" href="#tab-2">Chorus</a><a class="tb-section-tab" href="#tab-10">Outro</a><a class="tb-section-tab" href="#tab-unused"> VERSE </a>';
export function api(id:string|number='9007199254740993',patch:Record<string,unknown>={}) {
  return JSON.stringify({ID:id,song:'Fixture song',artist:'Fixture artist',section:'api name',jsonData:JSON.stringify({chords:[{root:1,type:5},null,3],notes:{melody1:[{sd:'1'}]},keys:[{tonic:'D',scale:'minor',beat:1}],settings:{externalMP3URL:'fixture.mp3'},version:2,unknown:'ignored'}),...patch});
}
const request=(body:unknown={url},signal?:AbortSignal)=>new Request('https://worker.test/harvest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
function fixture(html=page,body=api()) {
  const calls:{url:string;init:RequestInit}[]=[];
  const fetcher:HarvestFetch=async(url,init)=>{calls.push({url,init});return new Response(calls.length===1?html:body);};
  return {handler:createHarvestHandler(fetcher),calls};
}

describe('native Scraper/DataExtractor/HarvestService request slice (no live fetch)',()=>{
  it('keeps native distinct tab types in DOM order, shared IDs and fallback containers',()=>{
    expect(pageSectionRefs(page)).toEqual([{songId:'10',sectionName:'verse'},{songId:'2',sectionName:'Chorus'},{songId:'10',sectionName:'Outro'}]);
    expect(pageSectionRefs('<a class="tb-section-tab" href="#tab-1">Pre—Chorus</a><a class="tb-section-tab" href="#tab-2">pre_chorus</a><a class="tb-section-tab" href="#tab-3">All Sections</a>')).toEqual([{songId:'1',sectionName:'Pre—Chorus'}]);
    expect(pageSectionRefs('<div id="tab-player"></div><div id="tab-2"></div><p id="tab-10"></p><div id="tab-2"></div>')).toEqual([{songId:'2',sectionName:null},{songId:'10',sectionName:null}]);
    expect(pageSectionRefs('<a class="tb-section-tab" href="#tab-1"><b>Verse</b>&nbsp;&amp; <i>Chorus</i><script>not text</script></a>')[0]!.sectionName).toBe('Verse & Chorus');
  });
  it('assembles a whole ordered document, fetches shared ID once and round-trips through product decoder',async()=>{
    const {handler,calls}=fixture();const response=await handler(request());expect(response.status).toBe(200);
    const result=await response.json() as HarvestDocument;
    expect(result.song).toEqual({slug:'artist__song',artist:'Fixture artist',title:'Fixture song',url,status:'enriched'});
    const sections=parseSections(result.data);
    expect([...sections.keys()]).toEqual(['10','2','10#2-1']);
    expect([...sections.values()].map(section=>[section.sectionName,section.sectionIndex,section.numericId])).toEqual([['Verse',0,'9007199254740993'],['Chorus',1,'9007199254740993'],['Outro',2,'9007199254740993']]);
    expect(sections.get('10')!.chords).toEqual([{root:1,type:5}]);
    expect(sections.get('10')!.metadata).toEqual({version:2,keys:[{tonic:'D',scale:'minor',beat:1}],externalMp3Url:'fixture.mp3'});
    expect(calls.map(call=>call.url)).toEqual([url,'https://api.hooktheory.com/v1/songs/public/10?fields=ID,song,section,jsonData','https://api.hooktheory.com/v1/songs/public/2?fields=ID,song,section,jsonData']);
    expect(calls.every(call=>call.init.redirect==='error'&&call.init.credentials==='omit')).toBe(true);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('uses fallback API names/defaults and original artist fallback, keeps duplicate-key suffix collision rules',async()=>{
    const {handler}=fixture('<i id="tab-10"></i><i id="tab-10#2-1"></i>',api(42,{artist:null,section:null}));
    const response=await handler(request());const result=await response.json() as HarvestDocument;
    expect(result.song.artist).toBe('artist');
    expect([...parseSections(result.data).values()].map(section=>section.sectionName)).toEqual(['Section 1','Section 2']);
    const collision=fixture('<a class="tb-section-tab" href="#tab-10">Verse</a><a class="tb-section-tab" href="#tab-10#2-1">Chorus</a><a class="tb-section-tab" href="#tab-10">Outro</a>');
    expect([...parseSections(((await (await collision.handler(request())).json()) as HarvestDocument).data).keys()]).toEqual(['10','10#2-1','10#2-2']);
  });
  it('preserves numeric lexemes and arbitrary IDs without Number precision loss, including metadata',()=>{
    // Build the outer JSON without converting the numeric ID through Number.
    const body='{"ID":9007199254740993,"song":"S","jsonData":'+JSON.stringify('{"chords":[{"root":1}],"version":9007199254740993,"notes":null}')+'}';
    const decoded=decodeHarvestApi(body);expect(decoded.id).toBe('9007199254740993');
    const extracted=extractHarvestSection(decoded,'Verse',0);
    expect(extracted).toContain('"version":9007199254740993');expect(extracted).toContain('"notes":null');
    expect(decodeHarvestApi('{"ID":1e2,"song":"S","jsonData":"{}"}').id).toBe('1e2');
    expect(compactRawJson(readRawJson('{"__proto__":1,"k":2,"k":3}'))).toBe('{"__proto__":1,"k":3}');
    expect(decodeHarvestApi(api('x',{jsonData:'{"chords":[null,3],"notes":false,"settings":{"externalMP3StartBeat":0,"externalMP3Duration":null}}'}))).toMatchObject({id:'x'});
  });
  it.each(['', 'null', '{"ID":1}',api(1,{jsonData:null}),api(1,{jsonData:'[]'}),api(1,{jsonData:'{chords:[]}'}),api(1,{artist:42})])('refuses malformed/unsupported API data: %s',async body=>{
    const {handler}=fixture(page,body);const response=await handler(request());expect(response.status).toBe(502);expect(await response.json()).toMatchObject({error:{code:'UPSTREAM'}});
  });
  it.each(['http://www.hooktheory.com/theorytab/view/a/b','https://evil.test/theorytab/view/a/b','https://www.hooktheory.com@evil.test/theorytab/view/a/b','https://www.hooktheory.com/theorytab/view/a/../b','https://www.hooktheory.com/theorytab/view/a/b?q=x','https://www.hooktheory.com/theorytab/view/a/%2f','https://www.hooktheory.com:444/theorytab/view/a/b'])('rejects unbounded URL inputs before transport: %s',async value=>{
    const {handler,calls}=fixture();expect((await handler(request({url:value}))).status).toBe(400);expect(calls).toEqual([]);
  });
  it('validates endpoint/method/body; accepts canonical path and preserves input URL in song',async()=>{
    const {handler,calls}=fixture();expect((await handler(new Request('https://worker.test/nope'))).status).toBe(404);
    expect((await handler(new Request('https://worker.test/harvest'))).status).toBe(405);
    expect((await handler(request({url,extra:'x'}))).status).toBe(400);
    expect((await handler(new Request('https://worker.test/harvest',{method:'POST',body:'bad'}))).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(harvestPageUrl(' https://hooktheory.com/theorytab/view/a/b/// ')).toEqual({url:'https://www.hooktheory.com/theorytab/view/a/b',original:' https://hooktheory.com/theorytab/view/a/b/// '});
    expect((await handler(request({url:'x'.repeat(HARVEST_LIMITS.requestBytes+1)}))).status).toBe(413);
  });
  it('refuses missing sections and too many distinct tab types without API calls',async()=>{
    const absent=fixture('<p>no tabs</p>');expect((await absent.handler(request())).status).toBe(422);expect(absent.calls).toHaveLength(1);
    const many=fixture(Array.from({length:65},(_,i)=>`<a class="tb-section-tab" href="#tab-${i}">Section ${i}</a>`).join(''));
    expect((await many.handler(request())).status).toBe(413);expect(many.calls).toHaveLength(1);
  });
  it.each([301,403,500])('refuses upstream status %s without exposing provider body',async status=>{
    const handler=createHarvestHandler(async()=>new Response('private provider body',{status}));
    const response=await handler(request());expect(response.status).toBe(502);expect(await response.text()).not.toContain('private provider body');
  });
  it('rejects redirected/rebound responses and dot-path IDs',async()=>{
    for(const property of ['redirected','url']) {
      const response=new Response('fixture');Object.defineProperty(response,property,{value:property==='url'?'https://evil.test/':true});
      expect((await createHarvestHandler(async()=>response)(request())).status).toBe(502);
    }
    const dot=fixture('<i id="tab-.."></i>');expect((await dot.handler(request())).status).toBe(502);expect(dot.calls).toHaveLength(1);
  });
  it('caps aggregate provider bytes, even when individual responses fit',async()=>{
    let calls=0;
    const large=api(1,{jsonData:JSON.stringify({lyrics:'X'.repeat(3_000_000)})});
    const handler=createHarvestHandler(async()=>new Response(++calls===1?page+'<a class="tb-section-tab" href="#tab-3">Bridge</a>':large));
    expect((await handler(request())).status).toBe(413);expect(calls).toBe(4);
  });
  it('cancels a pending response stream instead of returning partial output',async()=>{
    const controller=new AbortController();let begun!:()=>void,cancelled=false;
    const started=new Promise<void>(resolve=>{begun=resolve;});
    const handler=createHarvestHandler(async()=>new Response(new ReadableStream({start(){begun();},cancel(){cancelled=true;}})));
    const result=handler(request({url},controller.signal));await started;controller.abort();
    expect((await result).status).toBe(499);expect(cancelled).toBe(true);
  });
  it('never returns partial sections if a later API call fails',async()=>{
    let calls=0;const handler=createHarvestHandler(async()=>new Response(++calls===1?page:calls===2?api():'broken'));
    const response=await handler(request());expect(response.status).toBe(502);expect(await response.json()).not.toHaveProperty('data');expect(calls).toBe(3);
  });
  it('caps header and streamed bytes and cancels oversized streams',async()=>{
    let cancelled=false;
    const header=createHarvestHandler(async()=>new Response('x',{headers:{'Content-Length':String(HARVEST_LIMITS.pageBytes+1)}}));
    expect((await header(request())).status).toBe(413);
    const stream=createHarvestHandler(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(HARVEST_LIMITS.pageBytes+1));},cancel(){cancelled=true;}})));
    expect((await stream(request())).status).toBe(413);expect(cancelled).toBe(true);
  });
  it('honors cancellation even if the transport never resolves',async()=>{
    const controller=new AbortController();let begun!:()=>void;const started=new Promise<void>(resolve=>{begun=resolve;});
    const handler=createHarvestHandler(async()=>{begun();return new Promise<Response>(()=>{});});
    const result=handler(request({url},controller.signal));await started;controller.abort();
    expect((await result).status).toBe(499);
  });
  it('bounds the whole request deadline, not a separate timer per section',async()=>{
    vi.useFakeTimers();
    try {
      let begun!:()=>void;const started=new Promise<void>(resolve=>{begun=resolve;});
      const handler=createHarvestHandler(async()=>{begun();return new Promise<Response>(()=>{});});
      const result=handler(request());await started;await vi.advanceTimersByTimeAsync(HARVEST_LIMITS.deadlineMs);
      expect((await result).status).toBe(504);
    } finally {vi.useRealTimers();}
  });
  it('refuses excessive JSON depth and trailing/lenient input explicitly',()=>{
    for(const text of ['{"a":1,}','[1,]','{"a":01}','true false','["unterminated]','['.repeat(66)+'0'+']'.repeat(66)])expect(()=>readRawJson(text)).toThrow();
  });
});

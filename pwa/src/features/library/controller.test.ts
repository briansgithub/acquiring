import {afterEach,expect,it,vi} from 'vitest';
import {CatalogError} from '../../storage/catalog/protocol';
import {LibraryController,type LibraryClient} from './controller';
import type {SongPage} from '../../storage/catalog/library-queries';
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const page=(slug:string,sourceSnapshot='one',nextOffset:number|null=null):SongPage=>({sourceSnapshot,rows:[{slug,title:slug,artist:'Artist',complexityRating:null}],hasMore:nextOffset!==null,nextOffset});
function fixture(){
  const client={songPage:vi.fn<LibraryClient['songPage']>(),songBrowseBySlugs:vi.fn<LibraryClient['songBrowseBySlugs']>(),
    songBrowseGroupCounts:vi.fn<LibraryClient['songBrowseGroupCounts']>(),
    songBrowseGroupSongs:vi.fn<LibraryClient['songBrowseGroupSongs']>(),
    artistSuggestions:vi.fn<LibraryClient['artistSuggestions']>(),terminate:vi.fn()};
  return {client,open:vi.fn(async()=>client)};
}
afterEach(()=>vi.useRealTimers());
it('debounces text and never publishes an older response after a newer query',async()=>{
  vi.useFakeTimers();const {client,open}=fixture(),old=deferred<SongPage>(),fresh=deferred<SongPage>();
  client.songPage.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const library=new LibraryController(undefined,open);const start=library.start();await vi.advanceTimersByTimeAsync(0);
  library.search('b');library.search('beta');await vi.advanceTimersByTimeAsync(199);expect(client.songPage).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);expect(client.songPage).toHaveBeenLastCalledWith({mode:'search',text:'beta',limit:20,offset:0});
  fresh.resolve(page('beta'));await vi.runAllTimersAsync();old.resolve(page('stale'));await start;
  expect(library.getSnapshot().rows[0]!.slug).toBe('beta');library.dispose();
});
it('does not submit obsolete text while reader ownership is still opening',async()=>{
  vi.useFakeTimers();const {client}=fixture(),opening=deferred<LibraryClient>();client.songPage.mockResolvedValue(page('new'));
  const library=new LibraryController(undefined,()=>opening.promise);const start=library.start();library.search('new');await vi.advanceTimersByTimeAsync(200);
  opening.resolve(client);await start;await vi.runAllTimersAsync();
  expect(client.songPage).toHaveBeenCalledTimes(1);expect(library.getSnapshot().text).toBe('new');library.dispose();
});
it('appends one bounded page at a time and resets instead of mixing snapshots',async()=>{
  const {client,open}=fixture();client.songPage.mockResolvedValueOnce(page('a','one',20)).mockResolvedValueOnce(page('b','one',40)).mockResolvedValueOnce(page('new-page','two',60)).mockResolvedValueOnce(page('new-first','two'));
  const library=new LibraryController(undefined,open);await library.start();const pending=library.loadMore();await library.loadMore();await pending;
  expect(library.getSnapshot().rows.map(row=>row.slug)).toEqual(['a','b']);expect(client.songPage).toHaveBeenCalledTimes(2);
  await library.loadMore();expect(library.getSnapshot().rows.map(row=>row.slug)).toEqual(['new-first']);expect(library.getSnapshot().sourceSnapshot).toBe('two');library.dispose();
});
it('restores loaded rows/focus only for the same immutable source and retains artist context',async()=>{
  const remembered={text:'draft',artist:'Raw-Artist',rows:[...page('a').rows,...page('b').rows],sourceSnapshot:'one',nextOffset:40,focusSlug:'b'};
  const {client,open}=fixture();client.songPage.mockResolvedValue(page('a'));
  const library=new LibraryController(remembered,open);await library.start();expect(library.capture()).toEqual(remembered);
  expect(client.songPage).toHaveBeenCalledWith({mode:'artist',text:'Raw-Artist',limit:20,offset:0});library.dispose();
  client.songPage.mockResolvedValue(page('new','two'));
  const changed=new LibraryController(remembered,open);await changed.start();expect(changed.getSnapshot().rows.map(row=>row.slug)).toEqual(['new']);expect(changed.getSnapshot().focusSlug).toBeUndefined();changed.dispose();
});
it('keeps missing/busy/error messages meaningful and retries failed ownership',async()=>{
  const {client}=fixture(),open=vi.fn<()=>Promise<LibraryClient>>().mockRejectedValueOnce(new CatalogError('BUSY','internal')).mockResolvedValue(client);
  const library=new LibraryController(undefined,open);await library.start();expect(library.getSnapshot().message).toContain('another tab');
  client.songPage.mockRejectedValueOnce(new CatalogError('NOT_INSTALLED','internal'));await library.retry();expect(library.getSnapshot().phase).toBe('missing');
  client.songPage.mockResolvedValue(page('ok'));await library.retry();expect(library.getSnapshot().phase).toBe('ready');library.dispose();
});
it('terminates late ownership and never emits or requests after disposal',async()=>{
  vi.useFakeTimers();const {client}=fixture(),opening=deferred<LibraryClient>();const library=new LibraryController(undefined,()=>opening.promise),listener=vi.fn();library.subscribe(listener);
  const start=library.start();library.search('draft');library.dispose();listener.mockClear();opening.resolve(client);await start;await vi.runAllTimersAsync();
  expect(client.terminate).toHaveBeenCalledTimes(1);expect(client.songPage).not.toHaveBeenCalled();expect(listener).not.toHaveBeenCalled();
});
it('artist detail uses exact raw identity and returning to search keeps the draft',async()=>{
  vi.useFakeTimers();const {client,open}=fixture();client.songPage.mockResolvedValue(page('x'));
  const library=new LibraryController(undefined,open);await library.start();library.search('draft');await vi.advanceTimersByTimeAsync(200);
  await library.showArtist('Raw-Artist');expect(client.songPage).toHaveBeenLastCalledWith({mode:'artist',text:'Raw-Artist',limit:20,offset:0});
  library.clearArtist();await vi.advanceTimersByTimeAsync(200);expect(client.songPage).toHaveBeenLastCalledWith({mode:'search',text:'draft',limit:20,offset:0});library.dispose();
});

it('restores a previous search page/focus after artist navigation without mixing contexts',async()=>{
  const {client,open}=fixture();client.songPage.mockResolvedValueOnce(page('a','one',20)).mockResolvedValueOnce(page('b','one',40)).mockResolvedValueOnce(page('artist')).mockResolvedValueOnce(page('a','one',20));
  const library=new LibraryController(undefined,open);await library.start();await library.loadMore();library.rememberFocused('b');const search=library.capture();
  await library.showArtist('Raw-Artist');await library.restore(search);
  expect(library.capture()).toEqual(search);expect(client.songPage).toHaveBeenLastCalledWith({mode:'search',text:'',limit:20,offset:0});library.dispose();
});

it('does not offer cached songs if the catalog has disappeared',async()=>{
  const {client,open}=fixture();client.songPage.mockRejectedValue(new CatalogError('NOT_INSTALLED','missing'));
  const library=new LibraryController({text:'',artist:null,rows:page('old').rows,sourceSnapshot:'one',nextOffset:20,focusSlug:'old'},open);
  await library.start();expect(library.getSnapshot().phase).toBe('missing');expect(library.getSnapshot().rows).toEqual([]);expect(library.getSnapshot().sourceSnapshot).toBeNull();library.dispose();
});

it('hydrates playlist slugs through the exclusive reader and stops after dispose',async()=>{
  const {client,open}=fixture();client.songPage.mockResolvedValue(page('a'));
  client.songBrowseBySlugs.mockResolvedValue([{slug:'a',artist:'Artist',title:'A',complexityRating:null}]);
  const library=new LibraryController(undefined,open);await library.start();
  await expect(library.browseBySlugs(['gone','a'])).resolves.toEqual([{slug:'a',artist:'Artist',title:'A',complexityRating:null}]);
  expect(client.songBrowseBySlugs).toHaveBeenCalledWith(['gone','a']);
  library.dispose();
  await expect(library.browseBySlugs(['a'])).resolves.toEqual([]);
});

it('Artists Search uses artistSearch LIKE mode and suggestions stay on the exclusive reader',async()=>{
  const {client,open}=fixture();client.songPage.mockResolvedValue(page('a-alpha'));
  client.artistSuggestions.mockResolvedValue({sourceSnapshot:'one',names:['Artist A'],hasMore:false,nextOffset:null});
  const library=new LibraryController(undefined,open);await library.start();
  await library.searchArtistSongs('Artist A');
  expect(client.songPage).toHaveBeenLastCalledWith({mode:'artistSearch',text:'Artist A',limit:20,offset:0});
  expect(library.capture().artistSearch).toBe(true);
  await expect(library.artistSuggestions('Artist A')).resolves.toEqual({sourceSnapshot:'one',names:['Artist A'],hasMore:false,nextOffset:null});
  expect(client.artistSuggestions).toHaveBeenCalledWith({query:'Artist A',limit:20,offset:0});
  await library.searchArtistSongs('   ');
  expect(client.songPage).toHaveBeenCalledTimes(2);
  expect(library.getSnapshot()).toMatchObject({artistSearch:true,rows:[],phase:'ready',message:'Enter an artist to search'});
  library.dispose();
  await expect(library.artistSuggestions('Artist A')).resolves.toEqual({sourceSnapshot:'',names:[],hasMore:false,nextOffset:null});
});

it('hydrates All Songs groups through the exclusive reader and stops after dispose',async()=>{
  const {client,open}=fixture();client.songPage.mockResolvedValue(page('a'));
  client.songBrowseGroupCounts.mockResolvedValue([{groupKey:'7',songCount:2}]);
  client.songBrowseGroupSongs.mockResolvedValue([{slug:'a-alpha',artist:'Artist-A',title:'Alpha Song',complexityRating:77}]);
  const library=new LibraryController(undefined,open);await library.start();
  await expect(library.browseGroupCounts('complexity')).resolves.toEqual([{groupKey:'7',songCount:2}]);
  await expect(library.browseGroupSongs('mode','ionian')).resolves.toEqual([{slug:'a-alpha',artist:'Artist-A',title:'Alpha Song',complexityRating:77}]);
  expect(client.songBrowseGroupCounts).toHaveBeenCalledWith('complexity','');
  expect(client.songBrowseGroupSongs).toHaveBeenCalledWith('mode','ionian','');
  library.dispose();
  await expect(library.browseGroupCounts('alphabetical')).resolves.toEqual([]);
  await expect(library.browseGroupSongs('alphabetical','A')).resolves.toEqual([]);
});

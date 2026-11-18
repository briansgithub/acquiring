import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {navigate,subscribeRoute} from '../../app/routes';
import {LibraryController,type LibraryView} from './controller';
import {recordOpenedArtist,recordOpenedSong} from './history-store';
import {LibraryContent} from './LibraryContent';
import {SongQueueScreen} from './SongQueueScreen';
import {mutateSongQueue,songQueueSession,songQueueVersion,startExampleShuffle,subscribeSongQueue} from './song-queue-host';

interface Remembered {view:LibraryView;scrollY:number}
// Transient view state only. Durable favorites/recents remain in user storage.
const views=new Map<string,Remembered>();
let lastArtist:string|null=null;
let activeSave:(()=>void)|undefined;
export const saveLibraryView=()=>activeSave?.();
/** N14: the Library lists scroll inside their own region (native LazyColumn), so Back restores that region. */
const scrollRegion=()=>document.querySelector<HTMLElement>('[data-library-scroll]');
// Last position the user (or a restore) scrolled the region to. A re-rendered region starts at 0 without a scroll
// event, so reading scrollTop during route changes could overwrite a saved position with 0.
let regionScroll=0;
if(typeof document!=='undefined')document.addEventListener('scroll',event=>{
  const target=event.target;
  if(target instanceof HTMLElement&&target.hasAttribute('data-library-scroll'))regionScroll=target.scrollTop;
},true);
const libraryScrollTop=()=>scrollRegion()?regionScroll:window.scrollY;
function restoreLibraryScroll(top:number):void {
  regionScroll=top;
  const region=scrollRegion();
  if(region)region.scrollTop=top;else window.scrollTo(0,top);
}
const key=(artist:string|null)=>artist===null?'search':'artist:'+artist;
const artistFromHistory=():string|null=>typeof history.state?.libraryArtist==='string'?history.state.libraryArtist:null;
export const libraryRouteState=()=>({libraryArtist:lastArtist});
function initialView(artist:string|null):LibraryView {
  return {text:views.get('search')?.view.text??'',artist,rows:[],sourceSnapshot:null,nextOffset:null};
}
function makeReader(){
  const artist=artistFromHistory(),remembered=views.get(key(artist));
  lastArtist=artist;
  return {controller:new LibraryController(remembered?.view??initialView(artist)),remembered};
}
/** pendingScroll: a saved position not yet re-applied to the freshly mounted list; keep it instead of reading 0. */
function remember(controller:LibraryController,pendingScroll?:number):void {
  const view=controller.capture();views.set(key(view.artist),{view,scrollY:pendingScroll??libraryScrollTop()});lastArtist=view.artist;
}
export function LibraryScreen(){
  const [reader,setReader]=useState(makeReader),controller=reader.controller;
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  const queueVersion=useSyncExternalStore(subscribeSongQueue,songQueueVersion,songQueueVersion);
  const queue=songQueueSession();
  void queueVersion;
  const pendingRestore=useRef<Remembered|undefined>(reader.remembered);
  const departureSaved=useRef(false);
  useEffect(()=>{
    // Development StrictMode replays setup after cleanup; a disposed reader is final.
    if(controller.closed){setReader(makeReader());return;}
    pendingRestore.current=reader.remembered;
    departureSaved.current=false;
    const save=()=>{remember(controller,pendingRestore.current?.scrollY);departureSaved.current=true;};activeSave=save;
    void controller.start();
    const unsubscribe=subscribeRoute(()=>{
      if(location.pathname!=='/'){if(!departureSaved.current)save();return;}
      const artist=artistFromHistory();
      if(artist===controller.getSnapshot().artist)return;
      remember(controller);lastArtist=artist;
      const cached=views.get(key(artist));
      regionScroll=cached?.scrollY??0;pendingRestore.current=cached??{view:initialView(artist),scrollY:0};
      void controller.restore(cached?.view??initialView(artist));
    });
    const hide=()=>{save();controller.dispose();};
    const show=(event:PageTransitionEvent)=>{if(event.persisted)setReader(makeReader());};
    window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
    return ()=>{if(activeSave===save)activeSave=undefined;if(!departureSaved.current)remember(controller,pendingRestore.current?.scrollY);controller.dispose();unsubscribe();window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);};
  },[reader,controller]);
  useEffect(()=>{
    const cached=pendingRestore.current;
    // The remembered rows stay on screen even when the reopened reader reports an error (e.g. after Settings
    // released the catalog), so restore their scroll position then too.
    if(!cached||!(state.phase==='ready'||state.phase==='error'&&state.rows.length>0))return;
    pendingRestore.current=undefined;
    const sameSource=state.sourceSnapshot===cached.view.sourceSnapshot;
    const frame=requestAnimationFrame(()=>{
      restoreLibraryScroll(sameSource?cached.scrollY:0);
      if(sameSource&&state.focusSlug){
        [...document.querySelectorAll<HTMLButtonElement>('button[data-song-slug]')].find(button=>button.dataset.songSlug===state.focusSlug)?.focus({preventScroll:true});
      }
    });
    return ()=>cancelAnimationFrame(frame);
  },[state.phase,state.rows,state.sourceSnapshot,state.focusSlug]);
  if(queue.active&&!queue.started){
    return <SongQueueScreen
      onDismiss={()=>mutateSongQueue(session=>session.dismiss())}
      onOpenEntry={song=>{
        void recordOpenedSong(song.slug,song.artist||null);
        controller.rememberFocused(song.slug);saveLibraryView();
        navigate('/playback/'+encodeURIComponent(song.slug),{fromQueue:true});window.scrollTo(0,0);
      }}/>;
  }
  return <LibraryContent state={state}
    onSearch={text=>{
      if(state.artist!==null){remember(controller);history.replaceState({libraryArtist:null},'',location.href);}
      lastArtist=null;pendingRestore.current=undefined;controller.search(text);regionScroll=0;window.scrollTo(0,0);
    }}
    onSearchArtistSongs={text=>{
      if(state.artist!==null){remember(controller);history.replaceState({libraryArtist:null},'',location.href);}
      lastArtist=null;pendingRestore.current=undefined;controller.searchArtistSongs(text);regionScroll=0;window.scrollTo(0,0);
    }}
    onArtist={artist=>{void recordOpenedArtist(artist);remember(controller);navigate('/',{libraryArtist:artist});}}
    onClearArtist={()=>{if(artistFromHistory()!==null)history.back();else controller.clearArtist();}}
    onLoadMore={()=>{void controller.loadMore();}}
    onRetry={()=>{void controller.retry();}}
    onDownload={()=>{saveLibraryView();navigate('/settings',{fromLibrary:true});}}
    onOpenSong={row=>{void recordOpenedSong(row.slug,row.artist);controller.rememberFocused(row.slug);saveLibraryView();navigate('/songs/'+encodeURIComponent(row.slug),{fromLibrary:true});window.scrollTo(0,0);}}
    browseBySlugs={controller.browseBySlugs}
    onShuffleExamples={percent=>{void startExampleShuffle(controller.exampleSongs,percent);}}
    browseGroupCounts={controller.browseGroupCounts}
    browseGroupSongs={controller.browseGroupSongs}
    artistSuggestions={controller.artistSuggestions}
  />;
}

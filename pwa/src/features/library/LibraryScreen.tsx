import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {navigate,subscribeRoute} from '../../app/routes';
import {LibraryController,type LibraryView} from './controller';
import {LibraryContent} from './LibraryContent';

interface Remembered {view:LibraryView;scrollY:number}
// Transient view state only. Durable favorites/recents remain in user storage.
const views=new Map<string,Remembered>();
let lastArtist:string|null=null;
let activeSave:(()=>void)|undefined;
export const saveLibraryView=()=>activeSave?.();
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
function remember(controller:LibraryController):void {
  const view=controller.capture();views.set(key(view.artist),{view,scrollY:window.scrollY});lastArtist=view.artist;
}
export function LibraryScreen(){
  const [reader,setReader]=useState(makeReader),controller=reader.controller;
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  const pendingRestore=useRef<Remembered|undefined>(reader.remembered);
  const departureSaved=useRef(false);
  useEffect(()=>{
    // Development StrictMode replays setup after cleanup; a disposed reader is final.
    if(controller.closed){setReader(makeReader());return;}
    pendingRestore.current=reader.remembered;
    departureSaved.current=false;
    const save=()=>{remember(controller);departureSaved.current=true;};activeSave=save;
    void controller.start();
    const unsubscribe=subscribeRoute(()=>{
      if(location.pathname!=='/'){if(!departureSaved.current)save();return;}
      const artist=artistFromHistory();
      if(artist===controller.getSnapshot().artist)return;
      remember(controller);lastArtist=artist;
      const cached=views.get(key(artist));
      pendingRestore.current=cached??{view:initialView(artist),scrollY:0};
      void controller.restore(cached?.view??initialView(artist));
    });
    const hide=()=>{save();controller.dispose();};
    const show=(event:PageTransitionEvent)=>{if(event.persisted)setReader(makeReader());};
    window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
    return ()=>{if(activeSave===save)activeSave=undefined;if(!departureSaved.current)remember(controller);controller.dispose();unsubscribe();window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);};
  },[reader,controller]);
  useEffect(()=>{
    const cached=pendingRestore.current;
    if(state.phase!=='ready'||!cached)return;
    pendingRestore.current=undefined;
    const sameSource=state.sourceSnapshot===cached.view.sourceSnapshot;
    const frame=requestAnimationFrame(()=>{
      window.scrollTo(0,sameSource?cached.scrollY:0);
      if(sameSource&&state.focusSlug){
        [...document.querySelectorAll<HTMLButtonElement>('button[data-song-slug]')].find(button=>button.dataset.songSlug===state.focusSlug)?.focus({preventScroll:true});
      }
    });
    return ()=>cancelAnimationFrame(frame);
  },[state.phase,state.rows,state.sourceSnapshot,state.focusSlug]);
  return <LibraryContent state={state}
    onSearch={text=>{
      if(state.artist!==null){remember(controller);history.replaceState({libraryArtist:null},'',location.href);}
      lastArtist=null;pendingRestore.current=undefined;controller.search(text);window.scrollTo(0,0);
    }}
    onArtist={artist=>{remember(controller);navigate('/',{libraryArtist:artist});}}
    onClearArtist={()=>{if(artistFromHistory()!==null)history.back();else controller.clearArtist();}}
    onLoadMore={()=>{void controller.loadMore();}}
    onRetry={()=>{void controller.retry();}}
    onDownload={()=>{saveLibraryView();navigate('/settings',{fromLibrary:true});}}
    onOpenSong={row=>{controller.rememberFocused(row.slug);saveLibraryView();navigate('/songs/'+encodeURIComponent(row.slug),{fromLibrary:true});window.scrollTo(0,0);}}
  />;
}

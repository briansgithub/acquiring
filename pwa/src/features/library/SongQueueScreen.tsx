import {useEffect,useState} from 'react';
import {openGuestPlaylistStore,type PlaylistStore} from '../playback/playlist-store';
import {mutateSongQueue,saveCurrentQueue,songQueueSession} from './song-queue-host';
import type {QueuedSong} from './song-queue';

export function SongQueueScreen({onOpenEntry,onDismiss}:{
  onOpenEntry(song:QueuedSong):void;
  onDismiss():void;
}){
  const queue=songQueueSession();
  const [store,setStore]=useState<PlaylistStore|null>(null);
  const [saving,setSaving]=useState(false);
  const [name,setName]=useState(queue.suggestedName);
  useEffect(()=>{
    let closed=false,db:{close():void}|undefined;
    void openGuestPlaylistStore().then(opened=>{
      if(closed||!opened)return;
      db=opened.db;setStore(opened.store);
    });
    return()=>{closed=true;db?.close();};
  },[]);
  const shuffleable=queue.entries.length>1;
  const orderLabel=queue.shuffleEnabled?'Random order':queue.originQuiz?'Popularity order':'Saved order';
  function playEntry(index:number){
    mutateSongQueue(session=>session.select(index,true));
    const song=songQueueSession().entries[index];
    if(song)onOpenEntry(song);
  }
  async function save(){
    if(!store||saving)return;
    setSaving(true);
    await saveCurrentQueue(store,name);
    setSaving(false);
  }
  return <section className="library-content" data-song-queue-screen="" aria-label="Song queue">
    <header className="library-all-songs-header">
      <button className="library-back" type="button" onClick={onDismiss}>Back</button>
      <h2>{queue.started?`${queue.index+1} of ${queue.entries.length}`:'Song examples'}</h2>
    </header>
    <div className="library-queue-toolbar">
      <label className="playback-check">
        <input type="checkbox" role="switch" aria-label="Shuffle" disabled={!shuffleable}
          checked={queue.shuffleEnabled}
          onChange={()=>mutateSongQueue(session=>session.toggleShuffle())}/>
        Shuffle
      </label>
      <span>{orderLabel}</span>
    </div>
    {queue.notice&&<p className="library-status" role="status">{queue.notice}</p>}
    {queue.loading&&<p className="library-status" role="status" aria-live="polite">Finding matching songs…</p>}
    {!queue.loading&&queue.entries.length===0&&
      <p className="library-playlist-empty">No matching songs to play or save.</p>}
    {!queue.loading&&queue.entries.length>0&&!queue.started&&<>
      <div className="library-queue-actions">
        <button className="library-primary-action" type="button" data-play-song-queue=""
          onClick={()=>{mutateSongQueue(session=>session.start());const song=songQueueSession().entries[0];if(song)onOpenEntry(song);}}>
          Play queue
        </button>
        <button className="library-back" type="button" disabled={!store} onClick={()=>void save()}>
          {saving?'Saving…':'Save playlist'}
        </button>
      </div>
      {store&&<label className="library-search-label">Playlist name
        <input className="library-search-input" value={name} onChange={event=>setName(event.target.value)}
          aria-label="Playlist name" maxLength={120}/>
      </label>}
      <ul className="library-song-list" aria-label="Song queue">
        {queue.entries.map((song,index)=>
          <li className="library-song" key={`${song.slug}:${song.sectionId}:${index}`}>
            <button className="library-open-song" type="button" onClick={()=>playEntry(index)}>
              {index+1}. {song.title} — {song.artist} · {song.sectionName}
            </button>
          </li>)}
      </ul>
    </>}
  </section>;
}

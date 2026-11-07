import {useEffect,useSyncExternalStore} from 'react';
import {navigate} from '../../app/routes';
import {songQueueSession,songQueueVersion,subscribeSongQueue} from './song-queue-host';

/** Keep the playback route on the active queue entry after start/select/completed/unavailable. */
export function SongQueueRouteSync(){
  const version=useSyncExternalStore(subscribeSongQueue,songQueueVersion,songQueueVersion);
  useEffect(()=>{
    const queue=songQueueSession();
    if(!queue.active||!queue.started||queue.entries.length===0)return;
    const song=queue.entries[queue.index];
    if(!song)return;
    const path='/playback/'+encodeURIComponent(song.slug);
    if(location.pathname!==path)navigate(path,{fromQueue:true});
  },[version]);
  return null;
}

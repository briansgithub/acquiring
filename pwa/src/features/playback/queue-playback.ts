import {useEffect,useRef} from 'react';
import type {SectionPlaybackController} from './controller';

/** Native PlaybackView playOnceKey: autoplay after explicit queue start, complete once, skip missing. */
export function useQueuePlayback(input:{
  playback:SectionPlaybackController|null;
  playbackError:string|null;
  autoStart?:boolean;
  playOnceKey?:string|null;
  phase:string;
  completionKey:string|null;
  detailPhase:string;
  title:string;
  onSectionComplete?:(key:string)=>void;
  onSongUnavailable?:(message:string)=>void;
}):void {
  const {playback,playbackError,autoStart,playOnceKey,phase,completionKey,detailPhase,title,onSectionComplete,onSongUnavailable}=input;
  const started=useRef<SectionPlaybackController|null>(null);
  const reported=useRef<string|null>(null);
  useEffect(()=>{
    if(!playback||playbackError||!autoStart||started.current===playback)return;
    started.current=playback;
    playback.play();
  },[playback,playbackError,autoStart]);
  useEffect(()=>{
    if(!playOnceKey||!onSectionComplete||phase!=='completed'||completionKey!==playOnceKey)return;
    onSectionComplete(playOnceKey);
  },[phase,completionKey,playOnceKey,onSectionComplete]);
  useEffect(()=>{
    if(!onSongUnavailable||!playOnceKey)return;
    if(detailPhase!=='missing'&&detailPhase!=='error')return;
    if(reported.current===playOnceKey)return;
    reported.current=playOnceKey;
    onSongUnavailable(`Skipped ${title}: song or saved section unavailable.`);
  },[detailPhase,playOnceKey,title,onSongUnavailable]);
}

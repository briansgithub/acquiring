import {Waveform} from '../../audio/synth';
import type {SectionPlaybackController} from './controller';
import {capturePlayback,setSessionTranspose,setSessionWaveform} from './playback-route-memory';

export const PLAYBACK_ARPEGGIO_NAMES=['1/4','1/3','1/2','Off','1x','2x','3x','4x'];
export const emptyPlaybackState=Object.freeze({
  settings:Object.freeze({tempoPercent:100,transpose:0,melodyPercent:50,waveform:Waveform.CLARINET,rootOnly:false,arpeggioIndex:3}),
  transport:Object.freeze({phase:'stopped' as const,transportRevision:0,playbackRequested:false,beat:1,bpm:120,window:null,renderEnded:false,completion:null,error:null,clock:null}),
  endBeat:32,baseBpm:120,scrubbing:false,
});

export function rememberPlayback(slug:string,sectionId:string|null,owner:SectionPlaybackController|null):void {
  if(!owner||owner.closed||!sectionId)return;
  const {settings,transport}=owner.getSnapshot();
  capturePlayback(slug,{sectionId,beat:transport.beat,tempoPercent:settings.tempoPercent,arpeggioIndex:settings.arpeggioIndex});
  setSessionTranspose(settings.transpose);setSessionWaveform(settings.waveform);
}

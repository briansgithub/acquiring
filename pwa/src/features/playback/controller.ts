import type {ExtractedSection} from '../../contracts';
import {PlaybackTransport,type AudioPlaybackTransport,type PlaybackTransportState} from '../../audio/transport';
import {PlaybackChordMode,Waveform,type PlaybackConfig} from '../../audio/synth';
import {preparePlaybackSection,type PreparedPlaybackSection} from './section-model';

export const PLAYBACK_ARPEGGIOS=Object.freeze([.25,1/3,.5,0,1,2,3,4]);
export const DEFAULT_PLAYBACK_TEMPO_PERCENT=100;
export const DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX=3;
export interface PlaybackSettings {
  readonly tempoPercent:number;readonly transpose:number;readonly melodyPercent:number;
  readonly waveform:Waveform;readonly rootOnly:boolean;readonly arpeggioIndex:number;
}
export interface SectionPlaybackState {
  readonly settings:PlaybackSettings;readonly transport:PlaybackTransportState;
  readonly endBeat:number;readonly baseBpm:number;readonly scrubbing:boolean;
}
const defaults:PlaybackSettings=Object.freeze({tempoPercent:DEFAULT_PLAYBACK_TEMPO_PERCENT,transpose:0,melodyPercent:50,waveform:Waveform.CLARINET,rootOnly:false,arpeggioIndex:DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX});
function config(model:PreparedPlaybackSection,settings:PlaybackSettings):PlaybackConfig {
  const {tempoPercent,transpose,melodyPercent,waveform,rootOnly,arpeggioIndex}=settings;
  for(const [value,min,max] of [[tempoPercent,0,200],[transpose,-12,12],[melodyPercent,0,100],[arpeggioIndex,0,7]])
    if(!Number.isInteger(value)||value<min||value>max)throw new RangeError('Invalid playback setting');
  if(!Object.values(Waveform).includes(waveform)||typeof rootOnly!=='boolean')throw new RangeError('Invalid playback setting');
  const melodyGain=Math.fround(melodyPercent/100);
  return {bpm:Math.fround(Math.fround(model.baseBpm*tempoPercent)/100),transpose,waveform,
    chordMode:rootOnly?PlaybackChordMode.ROOT_ONLY:PlaybackChordMode.FULL,melodyGain,chordGain:Math.fround(1-melodyGain),arpeggiateCycles:PLAYBACK_ARPEGGIOS[arpeggioIndex]};
}
/** Feature state only. Construction is pure; explicit start creates one borrowed transport. */
export class SectionPlaybackController {
  private model:PreparedPlaybackSection;
  private settings:PlaybackSettings=defaults;
  private engine:AudioPlaybackTransport|null=null;
  private unsubscribe:(()=>void)|null=null;
  private listeners=new Set<()=>void>();
  private state:SectionPlaybackState;
  private stopped=false;
  private revision=0;
  private scrubbing=false;
  private resumeAfterScrub=false;
  private scrubRevision:number|null=null;
  constructor(section:ExtractedSection,private readonly factory:(config:PlaybackConfig)=>AudioPlaybackTransport=config=>new PlaybackTransport({initialConfig:config}),private readonly playOnceKey:string|null=null) {
    this.model=preparePlaybackSection(section,playOnceKey);this.state=this.snapshot();
  }
  get closed():boolean{return this.stopped;}
  getSnapshot=():SectionPlaybackState=>this.state;
  subscribe=(listener:()=>void):(()=>void)=>{if(this.stopped)return()=>{};this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private snapshot():SectionPlaybackState {
    const transport=this.engine?.getSnapshot()??Object.freeze({phase:'stopped' as const,transportRevision:0,playbackRequested:false,beat:1,bpm:config(this.model,this.settings).bpm,window:null,renderEnded:false,completion:null,error:null,clock:null});
    return Object.freeze({settings:this.settings,transport,endBeat:this.model.timeline.endBeat,baseBpm:this.model.baseBpm,scrubbing:this.scrubbing});
  }
  private publish():void {
    const state=this.state=this.snapshot();
    for(const listener of [...this.listeners]){if(this.state!==state)break;try{listener();}catch{/* Subscribers cannot prevent ownership cleanup. */}}
  }
  private clearScrub():void {this.scrubbing=false;this.resumeAfterScrub=false;this.scrubRevision=null;}
  start():void {
    if(this.stopped||this.engine)return;
    const revision=++this.revision,engine=this.factory(config(this.model,this.settings));
    if(this.stopped||revision!==this.revision){engine.release();return;}
    this.engine=engine;this.unsubscribe=engine.subscribe(()=>{if(!this.stopped)this.publish();});
    engine.load(this.model.timeline,false);this.publish();
  }
  play():void {if(this.stopped)return;this.start();++this.revision;this.clearScrub();this.engine!.playFromGesture();this.publish();}
  pause():void {if(this.stopped)return;++this.revision;this.clearScrub();this.engine?.pause();this.publish();}
  reset():void {if(this.stopped)return;++this.revision;this.clearScrub();this.engine?.reset();this.publish();}
  updateSettings(input:Partial<PlaybackSettings>):void {
    if(this.stopped)return;
    const revision=this.revision;
    const {tempoPercent,transpose,melodyPercent,waveform,rootOnly,arpeggioIndex}=input;
    const next=Object.freeze({tempoPercent:tempoPercent??this.settings.tempoPercent,transpose:transpose??this.settings.transpose,
      melodyPercent:melodyPercent??this.settings.melodyPercent,waveform:waveform??this.settings.waveform,
      rootOnly:rootOnly??this.settings.rootOnly,arpeggioIndex:arpeggioIndex??this.settings.arpeggioIndex});
    const updated=config(this.model,next);
    if(this.stopped||revision!==this.revision)throw new Error('Playback settings superseded');
    ++this.revision;this.settings=next;this.engine?.updateConfig(updated);this.publish();
  }
  loadSection(section:ExtractedSection):void {
    if(this.stopped)return;
    const previous=this.revision,model=preparePlaybackSection(section,this.playOnceKey),updated=config(model,this.settings);
    if(this.stopped||previous!==this.revision)throw new Error('Playback section superseded');
    const resume=this.engine?.getSnapshot().playbackRequested??false,revision=++this.revision;
    this.clearScrub();this.model=model;this.engine?.updateConfig(updated);
    if(!this.stopped&&revision===this.revision)this.engine?.load(model.timeline,resume);
    this.publish();
  }
  beginScrub():void {
    if(this.stopped||this.scrubbing)return;
    this.start();const revision=++this.revision;this.scrubbing=true;
    const resume=this.engine!.pauseForScrub();
    if(this.stopped||revision!==this.revision)return;
    this.resumeAfterScrub=resume;this.scrubRevision=this.engine!.getSnapshot().transportRevision;this.publish();
  }
  scrubTo(beat:number):void {
    if(this.stopped)return;
    if(!Number.isFinite(beat))throw new RangeError('Invalid playback beat');
    this.beginScrub();const revision=++this.revision;
    this.engine!.seek(Math.min(this.model.timeline.endBeat,Math.max(1,beat)),false);
    if(!this.stopped&&revision===this.revision)this.scrubRevision=this.engine!.getSnapshot().transportRevision;
    this.publish();
  }
  finishScrub():void {
    if(this.stopped||!this.scrubbing)return;
    const current=this.engine!.getSnapshot(),valid=current.transportRevision===this.scrubRevision;
    const resume=this.resumeAfterScrub&&config(this.model,this.settings).bpm>0;
    ++this.revision;this.clearScrub();
    if(valid)this.engine!.seek(current.beat,resume);
    this.publish();
  }
  cancelScrub():void {if(this.stopped)return;++this.revision;this.clearScrub();this.publish();}
  restoreBeat(beat:number):void {
    if(this.stopped)return;
    if(!Number.isFinite(beat))throw new RangeError('Invalid playback beat');
    this.start();const revision=++this.revision;this.clearScrub();
    this.engine!.seek(Math.min(this.model.timeline.endBeat,Math.max(1,beat)),false);
    if(!this.stopped&&revision===this.revision)this.publish();
  }
  dispose():void {
    if(this.stopped)return;this.stopped=true;++this.revision;this.clearScrub();
    const engine=this.engine;this.unsubscribe?.();this.unsubscribe=null;
    try{engine?.release();}finally{this.publish();this.listeners.clear();}
  }
}

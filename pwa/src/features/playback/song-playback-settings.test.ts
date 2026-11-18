import {describe,expect,it} from 'vitest';
import {Waveform} from '../../audio/synth';
import {DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,DEFAULT_PLAYBACK_TEMPO_PERCENT} from './controller';
import {
  DEFAULT_MELODY_CHORD_BALANCE,DEFAULT_PLAYBACK_VOICE_VOLUME,DEFAULT_SONG_PLAYBACK_SETTINGS,SongPlaybackSettingsSession,
  sanitizeSongPlaybackSettings,type SongPlaybackSettingsRow,type SongPlaybackSettingsStore,
} from './song-playback-settings';

class FakeStore implements SongPlaybackSettingsStore {
  rows=new Map<string,SongPlaybackSettingsRow>();
  gets=0;upserts=0;
  upsertGate:Promise<void>|null=null;
  private getGates:Promise<void>[]=[];
  holdNextGet(gate:Promise<void>):void {this.getGates.push(gate);}
  async get(slug:string){this.gets++;const gate=this.getGates.shift();if(gate)await gate;return this.rows.get(slug)??null;}
  async upsert(row:SongPlaybackSettingsRow){this.upserts++;const gate=this.upsertGate;this.upsertGate=null;if(gate)await gate;this.rows.set(row.slug,row);}
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
const idle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function session(store:FakeStore){const s=new SongPlaybackSettingsSession();s.attachStore(store);return s;}
const saved=(slug:string,tempoPercent=DEFAULT_PLAYBACK_TEMPO_PERCENT):SongPlaybackSettingsRow=>({slug,...DEFAULT_SONG_PLAYBACK_SETTINGS,tempoPercent});

describe('native SongPlaybackSettingsViewModelTest (3c887223)',()=>{
  it('missingRowStaysAtDefaultsAndWritesNothing',async()=>{
    const store=new FakeStore(),state=session(store);
    state.enterSong('song-a');await idle();
    const s=state.getSnapshot();
    expect(s.tempoPercent).toBe(DEFAULT_PLAYBACK_TEMPO_PERCENT);
    expect(s.arpeggioOptionIndex).toBe(DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX);
    expect(s.melodyChordBalance).toBe(DEFAULT_MELODY_CHORD_BALANCE);
    expect(s.rootDegreeCue).toBe('OFF');
    expect(s.voiceVolume).toBe(DEFAULT_PLAYBACK_VOICE_VOLUME);
    expect(s.transpose).toBe(0);expect(s.lockInMajor).toBe(false);expect(s.loopSection).toBe(true);expect(s.instrument).toBeNull();
    expect(store.upserts).toBe(0);expect(store.rows.size).toBe(0);
  });
  it('roundTripRestoresTheSavedSnapshot',async()=>{
    const store=new FakeStore(),state=session(store);
    state.enterSong('song-a');await idle();
    state.updateLockInMajor(true);state.updateTempoPercent(90);state.updateArpeggioOptionIndex(1);state.updateMelodyChordBalance(0.25);
    state.updateInstrument(Waveform.FLUTE);state.updateTranspose(99);state.updateRootDegreeCue('SPOKEN_NUMBER');
    state.updateVoiceVolume(0.8);state.updateLoopSection(false);await idle();
    state.clearSession();
    expect(state.getSnapshot().tempoPercent).toBe(DEFAULT_PLAYBACK_TEMPO_PERCENT);expect(state.getSnapshot().instrument).toBeNull();
    state.enterSong('song-a');await idle();
    expect(state.getSnapshot()).toMatchObject({lockInMajor:true,tempoPercent:90,arpeggioOptionIndex:1,melodyChordBalance:0.25,
      instrument:Waveform.FLUTE,transpose:12,rootDegreeCue:'SPOKEN_NUMBER',voiceVolume:0.8,loopSection:false});
  });
  it('changingSongPublishesDefaultsImmediately',async()=>{
    const store=new FakeStore(),state=session(store);
    state.enterSong('song-a');await idle();
    state.updateTempoPercent(80);state.updateInstrument(Waveform.FLUTE);await idle();
    state.enterSong('song-b');
    expect(state.getSnapshot()).toMatchObject({tempoPercent:DEFAULT_PLAYBACK_TEMPO_PERCENT,instrument:null,songSlug:'song-b'});
    await idle();
    expect(store.rows.get('song-a')).toMatchObject({tempoPercent:80,instrument:Waveform.FLUTE});
    expect(store.rows.get('song-b')).toBeUndefined();
    expect(state.getSnapshot().tempoPercent).toBe(DEFAULT_PLAYBACK_TEMPO_PERCENT);
  });
  it('reenteringTheSameSongKeepsTheValues',async()=>{
    const store=new FakeStore(),state=session(store);
    state.enterSong('song-a');await idle();
    state.updateTempoPercent(80);state.updateLoopSection(false);
    const gets=store.gets;
    state.enterSong('song-a');await idle();
    expect(state.getSnapshot()).toMatchObject({tempoPercent:80,loopSection:false});
    expect(store.gets).toBe(gets);
  });
  it('lateLoadCannotClobberANewerEdit',async()=>{
    const store=new FakeStore(),gate=deferred();store.holdNextGet(gate.promise);
    store.rows.set('song-a',saved('song-a',40));
    const state=session(store);
    state.enterSong('song-a');await idle();
    state.updateTempoPercent(80);gate.resolve();await idle();
    expect(state.getSnapshot().tempoPercent).toBe(80);
    expect(store.rows.get('song-a')?.tempoPercent).toBe(80);
  });
  it('lateLoadForThePreviousSongDoesNotApply',async()=>{
    const store=new FakeStore(),gate=deferred();store.holdNextGet(gate.promise);
    const state=session(store);
    state.enterSong('song-a');await idle();
    store.rows.set('song-a',saved('song-a',40));
    state.enterSong('song-b');
    expect(state.getSnapshot().tempoPercent).toBe(DEFAULT_PLAYBACK_TEMPO_PERCENT);
    gate.resolve();await idle();
    expect(state.getSnapshot()).toMatchObject({songSlug:'song-b',tempoPercent:DEFAULT_PLAYBACK_TEMPO_PERCENT,instrument:null});
  });
  it('invalidStoredFieldsFallBackAndNullInstrumentStaysNull',async()=>{
    const bad=sanitizeSongPlaybackSettings('song-a',{lockInMajor:true,tempoPercent:500,arpeggioOptionIndex:99,melodyChordBalance:0.2,
      instrument:'BANJO',transpose:3,rootDegreeCue:'NOPE',voiceVolume:0.7,loopSection:false});
    expect(bad).toMatchObject({tempoPercent:DEFAULT_PLAYBACK_TEMPO_PERCENT,arpeggioOptionIndex:DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,
      rootDegreeCue:'OFF',instrument:null,melodyChordBalance:0.2,transpose:3,voiceVolume:0.7,lockInMajor:true,loopSection:false});
    const store=new FakeStore();store.rows.set('song-a',bad!);store.rows.set('song-b',{...saved('song-b',90),instrument:null});
    const state=session(store);
    state.enterSong('song-a');await idle();
    expect(state.getSnapshot()).toMatchObject({tempoPercent:DEFAULT_PLAYBACK_TEMPO_PERCENT,instrument:null,transpose:3,lockInMajor:true});
    expect(store.upserts).toBe(0);
    state.enterSong('song-b');await idle();
    expect(state.getSnapshot()).toMatchObject({instrument:null,tempoPercent:90});
    expect(sanitizeSongPlaybackSettings('x',null)).toBeNull();
    expect(sanitizeSongPlaybackSettings('x',{transpose:13,tempoPercent:Number.NaN,voiceVolume:2})).toMatchObject({transpose:0,tempoPercent:100,voiceVolume:0.5,loopSection:true});
  });
  it('sliderTicksCoalesceToTheLatestSnapshot',async()=>{
    const store=new FakeStore(),gate=deferred();store.upsertGate=gate.promise;
    const state=session(store);
    state.enterSong('song-a');await idle();
    state.updateTempoPercent(10);await idle();
    state.updateTempoPercent(20);state.updateTempoPercent(30);
    expect(store.upserts).toBe(1);
    gate.resolve();await idle();
    expect(store.rows.get('song-a')?.tempoPercent).toBe(30);
    expect(store.upserts).toBe(2);
  });
  it('edits without a song are ignored and a late-attached store loads and flushes',async()=>{
    const state=new SongPlaybackSettingsSession();
    state.updateTempoPercent(50);expect(state.getSnapshot().tempoPercent).toBe(100);
    state.enterSong('song-a');state.updateTranspose(-3);
    const store=new FakeStore();state.attachStore(store);await idle();
    expect(store.rows.get('song-a')?.transpose).toBe(-3);
  });
});

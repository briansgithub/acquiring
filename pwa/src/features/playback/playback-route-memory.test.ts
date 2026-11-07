import {afterEach,describe,expect,it} from 'vitest';
import {Waveform} from '../../audio/synth';
import {DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,DEFAULT_PLAYBACK_TEMPO_PERCENT} from './controller';
import {
  capturePlayback,enterPlayback,leavePlaybackSong,resetPlaybackRouteMemory,
  sessionTranspose,sessionWaveform,setSessionTranspose,setSessionWaveform,
} from './playback-route-memory';

afterEach(()=>{resetPlaybackRouteMemory();});

describe('native MainActivity/PlaybackController route-position memory',()=>{
  it('first song selection uses tempo 100, arpeggio Off, beat 1 and clarinet',()=>{
    const entry=enterPlayback('song-a','verse',['verse','chorus']);
    expect(entry).toEqual({sectionId:'verse',beat:1,tempoPercent:DEFAULT_PLAYBACK_TEMPO_PERCENT,
      arpeggioIndex:DEFAULT_PLAYBACK_ARPEGGIO_OPTION_INDEX,transpose:0,waveform:Waveform.CLARINET});
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it('Info round-trip restores section, beat, tempo and arpeggio for the same slug',()=>{
    enterPlayback('song-a','verse',['verse','chorus']);
    capturePlayback('song-a',{sectionId:'chorus',beat:8.25,tempoPercent:125,arpeggioIndex:4});
    const entry=enterPlayback('song-a','verse',['verse','chorus']);
    expect(entry).toMatchObject({sectionId:'chorus',beat:8.25,tempoPercent:125,arpeggioIndex:4});
  });

  it('leaving the song resets tempo and arpeggio but restores beat when first-section identity matches',()=>{
    enterPlayback('song-a','verse',['verse','chorus']);
    capturePlayback('song-a',{sectionId:'verse',beat:6,tempoPercent:150,arpeggioIndex:1});
    leavePlaybackSong();
    const entry=enterPlayback('song-a','verse',['verse','chorus']);
    expect(entry).toMatchObject({sectionId:'verse',beat:6,tempoPercent:100,arpeggioIndex:3});
  });

  it('library re-entry on a different first section does not keep the previous identity beat',()=>{
    enterPlayback('song-a','verse',['verse','chorus']);
    capturePlayback('song-a',{sectionId:'chorus',beat:9,tempoPercent:140,arpeggioIndex:5});
    leavePlaybackSong();
    expect(enterPlayback('song-a','verse',['verse','chorus'])).toMatchObject({sectionId:'verse',beat:1,tempoPercent:100});
  });

  it('transpose and session waveform survive song changes; mix is not stored',()=>{
    enterPlayback('song-a','verse',['verse']);
    capturePlayback('song-a',{sectionId:'verse',beat:3,tempoPercent:110,arpeggioIndex:2});
    setSessionTranspose(4);setSessionWaveform(Waveform.SINE);
    leavePlaybackSong();
    const other=enterPlayback('song-b','intro',['intro']);
    expect(other).toMatchObject({sectionId:'intro',beat:1,tempoPercent:100,arpeggioIndex:3,transpose:4,waveform:Waveform.SINE});
    expect(sessionTranspose()).toBe(4);expect(sessionWaveform()).toBe(Waveform.SINE);
    expect(other).not.toHaveProperty('rootOnly');expect(other).not.toHaveProperty('melodyPercent');
  });

  it('unknown remembered section falls back to the first section',()=>{
    enterPlayback('song-a','verse',['verse','chorus']);
    capturePlayback('song-a',{sectionId:'gone',beat:4,tempoPercent:130,arpeggioIndex:0});
    expect(enterPlayback('song-a','verse',['verse','chorus'])).toMatchObject({sectionId:'verse',beat:1,tempoPercent:130});
  });
});

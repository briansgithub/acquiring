import {afterEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  DisplayRefreshStore,RETIRED_DISPLAY_PREFS_KEY,displayRefreshStore,maximumRefreshRate,probeDisplayMaximumHz,
  retireTimelineFrameRatePreference,stateUpdateNanos,
} from './playback-frame-rate';
import {PlaybackPlayhead} from '../playback/playback-playhead';

afterEach(()=>{displayRefreshStore.resetForTests();});

describe('native PlaybackFrameRateTest.kt (3c887223)',()=>{
  it('maximumRateStaysAtTheCurrentResolution',()=>{
    const modes=[{width:1280,height:2856,refreshRate:120},{width:960,height:2142,refreshRate:Math.fround(120.00001)},
      {width:960,height:2142,refreshRate:60},{width:2560,height:5712,refreshRate:144}];
    expect(maximumRefreshRate(modes,960,2142,60)).toBe(Math.fround(120.00001));
  });
  it('sixtyHertzPanelReportsItsOnlyRate',()=>{
    expect(maximumRefreshRate([{width:1080,height:2400,refreshRate:60}],1080,2400,60)).toBe(60);
  });
  it('missingModesKeepTheCurrentRate',()=>{
    expect(maximumRefreshRate([],0,0,90)).toBe(90);
  });
});

describe('display-maximum publishing replaces the retired 60 fps preference',()=>{
  it('publishes one state per display frame with a 60 Hz fallback',()=>{
    expect(stateUpdateNanos(120)).toBe(8_333_333);
    expect(stateUpdateNanos(60)).toBe(16_666_666);
    expect(probeDisplayMaximumHz({screen:{refreshRate:119.88}})).toBe(120);
    expect(probeDisplayMaximumHz({screen:{}})).toBe(60);
    expect(probeDisplayMaximumHz({screen:{refreshRate:0}})).toBe(60);
    const store=new DisplayRefreshStore();
    store.apply(144);
    expect(store.minStateUpdateNanos).toBe(6_944_444);
    store.apply(0);
    expect(store.displayMaximumHz).toBe(1);
  });
  it('removes only the retired timelineFrameRate key',()=>{
    const data=new Map([[RETIRED_DISPLAY_PREFS_KEY,'{"timelineFrameRate":"maximum"}'],['acquiring-onboarding','keep']]);
    retireTimelineFrameRatePreference({removeItem:key=>{data.delete(key);}});
    expect([...data.keys()]).toEqual(['acquiring-onboarding']);
    expect(()=>retireTimelineFrameRatePreference({removeItem:()=>{throw new Error('denied');}})).not.toThrow();
  });
  it('Settings no longer renders a Display frame-rate section',()=>{
    const app=readFileSync(resolve('src/app/App.tsx'),'utf8');
    expect(app).not.toMatch(/TimelineFrameRateControl|<h2>Display<\/h2>/);
    expect(app).toContain('bindPlaybackFrameRateWindow');
  });
});

describe('native PlaybackPlayhead projection',()=>{
  it('projects the last sample forward at the playback rate, clamped to 50 ms',()=>{
    const playhead=new PlaybackPlayhead();
    expect(playhead.project(5)).toBe(1);
    playhead.sample(3,true,1_000_000_000);
    playhead.beatsPerSecond=2;
    expect(playhead.project(1_000_000_000)).toBe(3);
    expect(playhead.project(1_010_000_000)).toBeCloseTo(3.02,12);
    expect(playhead.project(1_500_000_000)).toBeCloseTo(3.1,12);
    expect(playhead.project(900_000_000)).toBe(3);
  });
  it('stops projecting and clears the rate when paused',()=>{
    const playhead=new PlaybackPlayhead();
    playhead.sample(2,true,10);playhead.beatsPerSecond=4;
    playhead.sample(2.5,false,20);
    expect(playhead.beatsPerSecond).toBe(0);
    expect(playhead.project(40_000_000)).toBe(2.5);
  });
});

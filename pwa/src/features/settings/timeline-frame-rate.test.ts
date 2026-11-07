import {afterEach,describe,expect,it} from 'vitest';
import {
  DISPLAY_PREFS_KEY,TimelineFrameRatePreference,TIMELINE_FRAME_RATE_OPTIONS,TimelineFrameRateStore,
  framesPerSecond,fromStorage,stateUpdateNanos,timelineFrameRateStore,
} from './timeline-frame-rate';
import {APP_VERSION_NAME,PRIVACY_POLICY_LABEL,PRIVACY_POLICY_URL,appVersionLabel} from './privacy-policy';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

afterEach(()=>{timelineFrameRateStore.resetForTests();});

describe('native TimelineFrameRateTest.kt',()=>{
  it('standardCapsAtSixtyWhileMaximumUsesTheDisplay',()=>{
    expect(framesPerSecond(TimelineFrameRatePreference.STANDARD,120)).toBe(60);
    expect(framesPerSecond(TimelineFrameRatePreference.STANDARD,60)).toBe(60);
    expect(framesPerSecond(TimelineFrameRatePreference.STANDARD,48)).toBe(48);
    expect(framesPerSecond(TimelineFrameRatePreference.MAXIMUM,120)).toBe(120);
    expect(stateUpdateNanos(TimelineFrameRatePreference.STANDARD,60)).toBe(16_666_666);
    expect(stateUpdateNanos(TimelineFrameRatePreference.MAXIMUM,120)).toBe(8_333_333);
  });

  it('applyKeepsTheRequestedRateAcrossReapplication',()=>{
    const store=new TimelineFrameRateStore({getItem:()=>null,setItem(){}});
    store.apply(TimelineFrameRatePreference.STANDARD,120);
    expect(store.minStateUpdateNanos).toBe(16_666_666);
    expect(store.displayMaximumHz).toBe(120);
    store.apply(TimelineFrameRatePreference.STANDARD,120);
    expect(store.minStateUpdateNanos).toBe(16_666_666);
    store.apply(TimelineFrameRatePreference.MAXIMUM,120);
    expect(store.minStateUpdateNanos).toBe(8_333_333);
    store.apply(TimelineFrameRatePreference.STANDARD,120);
    expect(store.minStateUpdateNanos).toBe(16_666_666);
  });

  it('unknownStorageFallsBackToSixty',()=>{
    expect(fromStorage(null)).toBe(TimelineFrameRatePreference.STANDARD);
    expect(fromStorage('maximum')).toBe(TimelineFrameRatePreference.MAXIMUM);
    expect(fromStorage('bogus')).toBe(TimelineFrameRatePreference.STANDARD);
  });
});

describe('display preference persistence is not T06 and not a data wipe',()=>{
  it('select writes timelineFrameRate and getSnapshot identity is stable',()=>{
    const data=new Map<string,string>();
    const store=new TimelineFrameRateStore({
      getItem(key){return data.get(key)??null;},
      setItem(key,value){data.set(key,value);},
    });
    const first=store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    store.select(TimelineFrameRatePreference.MAXIMUM,120);
    expect(JSON.parse(data.get(DISPLAY_PREFS_KEY)!)).toEqual({timelineFrameRate:'maximum'});
    expect(store.getSnapshot()).not.toBe(first);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    expect(store.minStateUpdateNanos).toBe(8_333_333);
  });
});

describe('native SettingsSectionsTest.kt display and privacy placement',()=>{
  it('settingsKeepsHelpDisplayAndDiagnostics titles',()=>{
    expect(TIMELINE_FRAME_RATE_OPTIONS.map(option=>option.title)).toEqual(['60 fps','Maximum']);
  });

  it('privacyPolicyResourceMatchesNative',()=>{
    expect(PRIVACY_POLICY_LABEL).toBe('Privacy policy');
    expect(PRIVACY_POLICY_URL).toBe('https://bellsworth.dev/apps/acquiring/privacy/');
    expect(APP_VERSION_NAME).toBe('0.1.0');
    expect(appVersionLabel()).toBe('Version 0.1.0');
  });

  it('privacyPolicyIsLastSettingsSectionNotOnSearch',()=>{
    const settings=readFileSync(resolve('src/app/App.tsx'),'utf8');
    const library=readFileSync(resolve('src/features/library/LibraryScreen.tsx'),'utf8');
    const link=settings.lastIndexOf('<PrivacyPolicyLink');
    const version=settings.lastIndexOf('appVersionLabel');
    expect(link).toBeGreaterThan(version);
    expect(link).toBeGreaterThan(settings.lastIndexOf('AudioDiagnosticsControl'));
    expect(library.includes('PrivacyPolicyLink')).toBe(false);
  });
});

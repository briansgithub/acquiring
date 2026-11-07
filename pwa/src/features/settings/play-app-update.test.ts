import {afterEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  PLAY_UPDATE_LABEL,PlayUpdateStatus,UPDATE_AVAILABILITY,checkAppUpdateStatus,
  playUpdateStatusFromAvailability,playUpdateStatusFromRegistration,requestAppUpdateCheck,
  resetAppUpdateForTests,settingsUpdatesHeading,
} from './play-app-update';
import {APP_VERSION_CODE,APP_VERSION_NAME,appVersionLabel} from './privacy-policy';

afterEach(()=>{resetAppUpdateForTests();});

describe('native PlayAppUpdateTest.kt',()=>{
  it('mapsPlayAvailabilityWithoutCrashingOnUnknownCodes',()=>{
    expect(playUpdateStatusFromAvailability(UPDATE_AVAILABILITY.UPDATE_AVAILABLE)).toBe(PlayUpdateStatus.UPDATE_AVAILABLE);
    expect(playUpdateStatusFromAvailability(UPDATE_AVAILABILITY.UPDATE_NOT_AVAILABLE)).toBe(PlayUpdateStatus.UP_TO_DATE);
    expect(playUpdateStatusFromAvailability(0)).toBe(PlayUpdateStatus.UNAVAILABLE);
    expect(playUpdateStatusFromAvailability(99)).toBe(PlayUpdateStatus.UNAVAILABLE);
  });
});

describe('native PlayAppUpdate labels and Settings chrome',()=>{
  it('keeps native labels, Updates bullet, and version format',()=>{
    expect(PLAY_UPDATE_LABEL[PlayUpdateStatus.UPDATE_AVAILABLE]).toBe('Update available');
    expect(PLAY_UPDATE_LABEL[PlayUpdateStatus.UP_TO_DATE]).toBe('Up to date');
    expect(PLAY_UPDATE_LABEL[PlayUpdateStatus.UNAVAILABLE]).toBe('Update status unavailable');
    expect(settingsUpdatesHeading(PlayUpdateStatus.UPDATE_AVAILABLE)).toBe('Updates •');
    expect(settingsUpdatesHeading(PlayUpdateStatus.UP_TO_DATE)).toBe('Updates');
    expect(APP_VERSION_NAME).toBe('0.1.0');
    expect(APP_VERSION_CODE).toBe(1);
    expect(appVersionLabel()).toBe('Version 0.1.0 (build 1)');
  });

  it('maps waiting worker to UPDATE_AVAILABLE and missing registration to UNAVAILABLE',()=>{
    expect(playUpdateStatusFromRegistration(null)).toBe(PlayUpdateStatus.UNAVAILABLE);
    expect(playUpdateStatusFromRegistration({waiting:{},active:{}})).toBe(PlayUpdateStatus.UPDATE_AVAILABLE);
    expect(playUpdateStatusFromRegistration({waiting:null,active:{}})).toBe(PlayUpdateStatus.UP_TO_DATE);
    expect(playUpdateStatusFromRegistration({waiting:null,active:null})).toBe(PlayUpdateStatus.UNAVAILABLE);
  });

  it('checkAppUpdateStatus is UNAVAILABLE without a service worker host',async()=>{
    await expect(checkAppUpdateStatus(undefined)).resolves.toBe(PlayUpdateStatus.UNAVAILABLE);
  });

  it('Open Play rechecks registration.update and never skipWaiting',async()=>{
    const calls:string[]=[];
    const registration={waiting:null,active:{},update:async()=>{calls.push('update');}};
    const worker={
      ready:Promise.resolve(registration),
      async getRegistration(){calls.push('get');return registration;},
    };
    await expect(requestAppUpdateCheck(worker)).resolves.toBe(PlayUpdateStatus.UP_TO_DATE);
    expect(calls).toEqual(['get','update']);
  });

  it('Updates section is before Display and version before Privacy',()=>{
    const settings=readFileSync(resolve('src/app/App.tsx'),'utf8');
    const updates=settings.lastIndexOf('<AppUpdateControl');
    const display=settings.lastIndexOf('TimelineFrameRateControl');
    const version=settings.lastIndexOf('appVersionLabel');
    const privacy=settings.lastIndexOf('<PrivacyPolicyLink');
    expect(updates).toBeGreaterThan(-1);
    expect(updates).toBeLessThan(display);
    expect(display).toBeLessThan(version);
    expect(version).toBeLessThan(privacy);
  });
});

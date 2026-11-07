import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  PLAY_UPDATE_LABEL,PWA_PLAY_UPDATE_STATUS,PlayUpdateStatus,UPDATE_AVAILABILITY,
  playUpdateStatusFromAvailability,settingsUpdatesHeading,
} from './play-app-update';
import {APP_VERSION_NAME,appVersionLabel} from './privacy-policy';

describe('native PlayAppUpdateTest.kt',()=>{
  it('mapsPlayAvailabilityWithoutCrashingOnUnknownCodes',()=>{
    expect(playUpdateStatusFromAvailability(UPDATE_AVAILABILITY.UPDATE_AVAILABLE)).toBe(PlayUpdateStatus.UPDATE_AVAILABLE);
    expect(playUpdateStatusFromAvailability(UPDATE_AVAILABILITY.UPDATE_NOT_AVAILABLE)).toBe(PlayUpdateStatus.UP_TO_DATE);
    expect(playUpdateStatusFromAvailability(0)).toBe(PlayUpdateStatus.UNAVAILABLE);
    expect(playUpdateStatusFromAvailability(99)).toBe(PlayUpdateStatus.UNAVAILABLE);
  });
});

describe('Play Store is not this PWA',()=>{
  it('keeps native labels without shipping Open Play or a fabricated build code',()=>{
    expect(PLAY_UPDATE_LABEL[PlayUpdateStatus.UPDATE_AVAILABLE]).toBe('Update available');
    expect(PLAY_UPDATE_LABEL[PlayUpdateStatus.UP_TO_DATE]).toBe('Up to date');
    expect(PLAY_UPDATE_LABEL[PlayUpdateStatus.UNAVAILABLE]).toBe('Update status unavailable');
    expect(settingsUpdatesHeading(PlayUpdateStatus.UPDATE_AVAILABLE)).toBe('Updates •');
    expect(settingsUpdatesHeading(PWA_PLAY_UPDATE_STATUS)).toBe('Updates');
    expect(PWA_PLAY_UPDATE_STATUS).toBe(PlayUpdateStatus.UNAVAILABLE);
    expect(APP_VERSION_NAME).toBe('0.1.0');
    expect(appVersionLabel()).toBe('Version 0.1.0');
  });

  it('Updates chrome is before Display, has no Open Play action, and version precedes Privacy',()=>{
    const settings=readFileSync(resolve('src/app/App.tsx'),'utf8');
    const control=readFileSync(resolve('src/features/settings/AppUpdateControl.tsx'),'utf8');
    const updates=settings.lastIndexOf('<AppUpdateControl');
    expect(updates).toBeGreaterThan(-1);
    expect(updates).toBeLessThan(settings.lastIndexOf('TimelineFrameRateControl'));
    expect(settings.lastIndexOf('appVersionLabel')).toBeLessThan(settings.lastIndexOf('<PrivacyPolicyLink'));
    expect(control).not.toMatch(/<button|Open Play Store|requestAppUpdateCheck|playUpdateStatusFromRegistration/);
  });
});

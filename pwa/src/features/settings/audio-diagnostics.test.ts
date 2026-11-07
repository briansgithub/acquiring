import {describe,expect,it,vi} from 'vitest';
import {
  AUDIO_DIAGNOSTICS_ALLOWED_OPERATIONS,AUDIO_DIAGNOSTICS_EVENT_LIMIT,AudioDiagnostics,
  audioDiagnostics,registerAudioEngine,
} from './audio-diagnostics';
import {INTRODUCTION_PREFS_KEY} from '../onboarding/introduction-prefs';

describe('native AudioDiagnosticsTest.kt', () => {
  it('recordsOnlyAllowListedOperationsAndStateKeys', () => {
    const diagnostics = new AudioDiagnostics({now:() => 1,stopAllPlayback:() => {},resetPlayback:() => {}});
    diagnostics.record('playback.playRequest',{phase:'PLAYING',songId:'all-star',slug:'smash-mouth/all-star'});
    diagnostics.record('not.an.allowed.operation',{phase:'PLAYING'});
    const events = diagnostics.snapshot();
    expect(events).toHaveLength(1);
    expect(events[0]?.operation).toBe('playback.playRequest');
    expect(events[0]?.state).toEqual({phase:'PLAYING'});
    expect(diagnostics.exportText()).not.toContain('all-star');
    expect(diagnostics.exportText()).not.toContain('smash-mouth');
  });

  it('trimsToEventLimit', () => {
    const diagnostics = new AudioDiagnostics({now:() => 1,stopAllPlayback:() => {},resetPlayback:() => {}});
    for (let index = 0; index < AUDIO_DIAGNOSTICS_EVENT_LIMIT + 5; index++)
      diagnostics.record('playback.reset',{phase:String(index)});
    const events = diagnostics.snapshot();
    expect(events).toHaveLength(AUDIO_DIAGNOSTICS_EVENT_LIMIT);
    expect(events[0]?.state.phase).toBe('5');
  });

  it('exportIsPlainTextWithoutAudioSamples', () => {
    const diagnostics = new AudioDiagnostics({now:() => 1,stopAllPlayback:() => {},resetPlayback:() => {}});
    diagnostics.record('playback.reset',{phase:'STOPPED'});
    const text = diagnostics.exportText();
    expect(text).toContain('schemaVersion');
    expect(text).toContain('playback.reset');
    expect(text).not.toContain('pcm');
    expect(text).not.toContain('sample');
  });
});

describe('engine-stop reset is not app-data destruction', () => {
  it('keeps diagnostics.export and diagnostics.reset allow-listed', () => {
    expect(AUDIO_DIAGNOSTICS_ALLOWED_OPERATIONS).toContain('diagnostics.export');
    expect(AUDIO_DIAGNOSTICS_ALLOWED_OPERATIONS).toContain('diagnostics.reset');
  });

  it('resetEngine records native stop order, stops playback, and leaves onboarding/catalog stores', () => {
    const store = new Map<string,string>([
      [INTRODUCTION_PREFS_KEY,JSON.stringify({hasCompletedIntroduction:true})],
      ['catalog','keep-me'],
    ]);
    const stopped:string[] = [];
    const diagnostics = new AudioDiagnostics({
      now:() => 10,
      stopAllPlayback:() => { stopped.push('stopAll'); },
      resetPlayback:() => { diagnostics.record('playback.reset'); },
    });
    diagnostics.resetEngine();
    expect(stopped).toEqual(['stopAll']);
    expect(diagnostics.snapshot().map(event => event.operation)).toEqual([
      'diagnostics.reset','engine.stopAll','engine.reset','playback.reset','playback.reset',
    ]);
    expect(store.get(INTRODUCTION_PREFS_KEY)).toContain('hasCompletedIntroduction');
    expect(store.get('catalog')).toBe('keep-me');
  });

  it('resetEngine never invokes a destructive data-wipe host', () => {
    const wipe = vi.fn();
    const diagnostics = new AudioDiagnostics({
      now:() => 1,
      stopAllPlayback:() => {},
      resetPlayback:() => {},
    });
    diagnostics.resetEngine();
    expect(wipe).not.toHaveBeenCalled();
    expect(diagnostics.snapshot().some(event => event.operation.includes('catalog'))).toBe(false);
  });

  it('production resetEngine stops registered playback and records native order', () => {
    audioDiagnostics.clearForTests();
    const stopped:string[] = [];
    const unregister = registerAudioEngine({
      stopAll:() => { stopped.push('transport'); },
      reset:() => { stopped.push('controller'); audioDiagnostics.record('playback.reset'); },
    });
    audioDiagnostics.resetEngine();
    unregister();
    expect(stopped).toEqual(['transport','controller']);
    expect(audioDiagnostics.snapshot().map(event => event.operation)).toEqual([
      'diagnostics.reset','engine.stopAll','engine.reset','playback.reset','playback.reset',
    ]);
    audioDiagnostics.clearForTests();
  });
});

/** Frozen 801cf798 AudioDiagnostics.kt. Engine stop/export only; never wipes catalog, onboarding, or T06. */
import {getPreviewOwner} from '../../audio/transport/preview-owner';

export const AUDIO_DIAGNOSTICS_EVENT_LIMIT = 128;
export const AUDIO_DIAGNOSTICS_ALLOWED_OPERATIONS = Object.freeze([
  'app.audioInitialized','playback.playRequest','playback.lifecyclePause','playback.reset',
  'engine.stopAll','engine.reset','diagnostics.export','diagnostics.reset',
]);
export const AUDIO_DIAGNOSTICS_ALLOWED_STATE_KEYS = Object.freeze([
  'phase','playing','hasFocus','underrunCount',
]);

export interface AudioDiagnosticEvent {
  readonly timestampMs:number;
  readonly operation:string;
  readonly state:Readonly<Record<string,string>>;
  readonly errorDomain?:string;
  readonly errorCode?:number;
}
export interface AudioDiagnosticsHost {
  now():number;
  stopAllPlayback():void;
  resetPlayback():void;
}

function escapeJson(value:string):string {
  return value.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
}

const playbackStops = new Set<()=>void>();
const playbackResets = new Set<()=>void>();

function defaultStopAllPlayback():void {
  getPreviewOwner().stop();
  for (const stop of [...playbackStops]) stop();
}

function defaultResetPlayback():void {
  if (playbackResets.size === 0) audioDiagnostics.record('playback.reset');
  else for (const reset of [...playbackResets]) reset();
}

/** Live section playback registers stop/reset. Does not own catalog/onboarding/T06. */
export function registerAudioEngine(hooks:{stopAll():void;reset():void}):()=>void {
  playbackStops.add(hooks.stopAll);
  playbackResets.add(hooks.reset);
  return () => { playbackStops.delete(hooks.stopAll); playbackResets.delete(hooks.reset); };
}

export class AudioDiagnostics {
  private readonly events:AudioDiagnosticEvent[] = [];
  constructor(private readonly host:AudioDiagnosticsHost = {
    now:() => Date.now(),
    stopAllPlayback:defaultStopAllPlayback,
    resetPlayback:defaultResetPlayback,
  }) {}

  record(
    operation:string,
    state:Record<string,string> = {},
    errorDomain?:string|null,
    errorCode?:number|null,
    timestampMs = this.host.now(),
  ):void {
    if (!(AUDIO_DIAGNOSTICS_ALLOWED_OPERATIONS as readonly string[]).includes(operation)) return;
    const sanitized:Record<string,string> = {};
    for (const key of AUDIO_DIAGNOSTICS_ALLOWED_STATE_KEYS) {
      const value = state[key];
      if (typeof value === 'string') sanitized[key] = value.slice(0,32);
    }
    const event:AudioDiagnosticEvent = {
      timestampMs,operation,state:Object.freeze(sanitized),
      ...(errorDomain == null ? {} : {errorDomain:errorDomain.slice(0,64)}),
      ...(errorCode == null ? {} : {errorCode}),
    };
    this.events.push(event);
    while (this.events.length > AUDIO_DIAGNOSTICS_EVENT_LIMIT) this.events.shift();
  }

  snapshot():readonly AudioDiagnosticEvent[] { return this.events.slice(); }

  clearForTests():void { this.events.length = 0; }

  exportText():string {
    this.record('diagnostics.export');
    const items = this.snapshot().map(event => {
      const state = Object.entries(event.state).sort(([a],[b]) => a.localeCompare(b))
        .map(([key,value]) => `"${escapeJson(key)}":"${escapeJson(value)}"`).join(',');
      let json = `{"timestampMs":${event.timestampMs},"operation":"${escapeJson(event.operation)}","state":{${state}}`;
      if (event.errorDomain != null) json += `,"errorDomain":"${escapeJson(event.errorDomain)}"`;
      if (event.errorCode != null) json += `,"errorCode":${event.errorCode}`;
      return json+'}';
    }).join(',');
    return `{"schemaVersion":1,"events":[${items}]}`;
  }

  resetEngine():void {
    this.record('diagnostics.reset');
    this.record('engine.stopAll');
    this.host.stopAllPlayback();
    this.record('engine.reset');
    this.record('playback.reset');
    this.host.resetPlayback();
  }

  async share():Promise<void> {
    const text = this.exportText();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({title:'Acquiring audio diagnostics',text});
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText)
      await navigator.clipboard.writeText(text);
  }
}

export const audioDiagnostics = new AudioDiagnostics();

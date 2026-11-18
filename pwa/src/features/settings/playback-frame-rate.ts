/** Native PlaybackFrameRate.kt at 3c887223 (N12). Playback always renders at the display's maximum
 * refresh rate; the old Settings 60 fps / Maximum timeline preference is retired and its stored key is
 * removed on startup. Browsers expose no display-mode list, so the maximum is the probed refresh rate
 * (non-standard screen.refreshRate) with the native 60 Hz fallback.
 */
export const RETIRED_DISPLAY_PREFS_KEY='acquiring-display';

export interface RefreshMode {readonly width:number;readonly height:number;readonly refreshRate:number}

/** Native maximumRefreshRate: highest rate at the current resolution; a faster mode at another size is ignored. */
export function maximumRefreshRate(modes:readonly RefreshMode[],currentWidth:number,currentHeight:number,currentRefreshRate:number):number {
  const sameSize=modes.filter(mode=>mode.width===currentWidth&&mode.height===currentHeight);
  const pool=sameSize.length?sameSize:modes;
  const peak=pool.length?Math.max(...pool.map(mode=>mode.refreshRate)):currentRefreshRate;
  return peak>=1?peak:Math.max(currentRefreshRate,0);
}

export function probeDisplayMaximumHz(target:{screen?:{refreshRate?:unknown}}=globalThis as never):number {
  const candidate=target.screen?.refreshRate;
  return typeof candidate==='number'&&Number.isFinite(candidate)&&candidate>=1?Math.round(candidate):60;
}

export function stateUpdateNanos(displayMaximumHz:number):number {
  return Math.trunc(1_000_000_000/Math.max(displayMaximumHz,1));
}

/** Minimum interval between visual Playback state publishes: one display frame, never a 60 Hz cap. */
export class DisplayRefreshStore {
  displayMaximumHz=60;
  minStateUpdateNanos=stateUpdateNanos(60);
  apply(displayMaximumHz:number):void {
    this.displayMaximumHz=Math.max(displayMaximumHz,1);
    this.minStateUpdateNanos=stateUpdateNanos(this.displayMaximumHz);
  }
  applyToWindow():void {this.apply(probeDisplayMaximumHz());}
  resetForTests():void {this.apply(60);}
}

export const displayRefreshStore=new DisplayRefreshStore();

export function retireTimelineFrameRatePreference(store?:Pick<Storage,'removeItem'>|null):void {
  try {
    const target=store===undefined?(typeof localStorage==='undefined'?null:localStorage):store;
    target?.removeItem(RETIRED_DISPLAY_PREFS_KEY);
  } catch {/* Storage can be unavailable in private modes; nothing to retire. */}
}

export function bindPlaybackFrameRateWindow(target:Window=window):()=>void {
  retireTimelineFrameRatePreference();
  const apply=()=>displayRefreshStore.applyToWindow();
  apply();
  target.addEventListener('visibilitychange',apply);
  target.addEventListener('pageshow',apply);
  return()=>{target.removeEventListener('visibilitychange',apply);target.removeEventListener('pageshow',apply);};
}

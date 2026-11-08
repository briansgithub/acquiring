import type {PitchResult} from '../../audio/capture';
import {formatPitchCentsError,pitchFeedbackColor} from './melody-pitch-display';
import {rootGaugeBarTop} from './persistent-root-target';
import './root-pitch-gauge.css';

export interface RootGaugeState {label:string;targetMidi:number;result:PitchResult;sampledCents:number|null}
/** Native PitchGauge over the current root card. No-signal is a prompt, never a fabricated score. */
export function RootPitchGauge({gauge}:{gauge:RootGaugeState}){
  const estimate=gauge.result.kind==='estimate'?gauge.result:null;
  const cents=estimate?.centsError;
  const color=cents==null?undefined:pitchFeedbackColor(cents);
  return <div className="root-pitch-gauge" role="img" data-root-pitch-gauge="" data-target-midi={gauge.targetMidi}
    data-root-estimate={String(estimate!=null)} data-root-cents={cents} data-root-held={estimate?String(estimate.isHeld):undefined}
    aria-label={cents==null?`Pitch gauge for ${gauge.label}, no signal`:`Pitch estimate for ${gauge.label}: ${Math.round(cents)} cents ${Math.round(cents)>0?'sharp':'flat'}`}>
    <span className="root-pitch-gauge__reference"/>
    {cents!=null&&<span className="root-pitch-gauge__bar" data-root-bar="" style={{top:rootGaugeBarTop(cents),backgroundColor:color}}/>}
    {cents!=null&&Math.abs(cents)>=200&&<span className={'root-pitch-gauge__arrow root-pitch-gauge__arrow--'+(cents>=200?'up':'down')}
      data-root-pinned={cents>=200?'sharp':'flat'} style={{color}}/>}
    {estimate?<span className="root-pitch-gauge__cents" style={{color:pitchFeedbackColor(gauge.sampledCents??estimate.centsError)}}>{formatPitchCentsError(gauge.sampledCents??estimate.centsError)}</span>
      :<span className="root-pitch-gauge__prompt">Hum a steady note...</span>}
  </div>;
}

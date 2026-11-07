import {useSyncExternalStore} from 'react';
import {TIMELINE_FRAME_RATE_OPTIONS,timelineFrameRateStore} from './timeline-frame-rate';
import './settings.css';

export function TimelineFrameRateControl(){
  const snapshot=useSyncExternalStore(timelineFrameRateStore.subscribe,timelineFrameRateStore.getSnapshot,timelineFrameRateStore.getSnapshot);
  return <div className="display-frame-rate" data-display-frame-rate={snapshot.preference.storageValue}>
    {TIMELINE_FRAME_RATE_OPTIONS.map(option=>{
      const selected=option===snapshot.preference;
      return <label key={option.storageValue} className="default-instrument__option">
        <input type="radio" name="timeline-frame-rate" checked={selected}
          aria-label={`Timeline frame rate: ${option.title}`}
          onChange={()=>timelineFrameRateStore.select(option)}/>
        {option.title}
      </label>;
    })}
  </div>;
}

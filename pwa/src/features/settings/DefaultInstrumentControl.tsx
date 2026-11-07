import {useSyncExternalStore} from 'react';
import {INSTRUMENTS} from '../../audio/synth';
import {appInstrumentSession} from './instrument-session';
import './settings.css';

export function DefaultInstrumentControl(){
  const snapshot=useSyncExternalStore(appInstrumentSession.subscribe,appInstrumentSession.getSnapshot,appInstrumentSession.getSnapshot);
  const groups=['Synths','Waveforms'] as const;
  return <div className="default-instrument">
    {groups.map(category=><fieldset key={category} className="default-instrument__group">
      <legend>{category}</legend>
      {INSTRUMENTS.filter(instrument=>instrument.categoryName===category).map(instrument=>{
        const selected=instrument.waveform===snapshot.defaultInstrument;
        return <label key={instrument.waveform} className="default-instrument__option">
          <input type="radio" name="default-instrument" checked={selected}
            aria-label={`Default instrument: ${instrument.displayName}`}
            onChange={()=>appInstrumentSession.selectAsDefault(instrument.waveform)}/>
          {instrument.displayName}
        </label>;
      })}
    </fieldset>)}
  </div>;
}

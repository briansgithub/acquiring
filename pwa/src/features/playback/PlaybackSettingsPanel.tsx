import {INSTRUMENTS,Waveform} from '../../audio/synth';
import {PLAYBACK_ARPEGGIOS,type PlaybackSettings} from './controller';
import {PLAYBACK_ARPEGGIO_NAMES} from './playback-screen-support';

export function PlaybackSettingsPanel({settings,disabled,onChange}:{
  settings:PlaybackSettings;disabled:boolean;onChange:(patch:Partial<PlaybackSettings>)=>void;
}){
  return <section className="panel playback-settings" aria-label="Playback settings">
    <label className="playback-field">Tempo (%)
      <input aria-label="Tempo (%)" type="range" min="0" max="200" step="1" value={settings.tempoPercent} disabled={disabled}
        onChange={event=>onChange({tempoPercent:Number(event.target.value)})}/>
      <output>{settings.tempoPercent}%</output>
    </label>
    <label className="playback-field">Transpose
      <input aria-label="Transpose" type="range" min="-12" max="12" step="1" value={settings.transpose} disabled={disabled}
        onChange={event=>onChange({transpose:Number(event.target.value)})}/>
      <output>{settings.transpose}</output>
    </label>
    <label className="playback-field">Instrument
      <select aria-label="Instrument" value={settings.waveform} disabled={disabled}
        onChange={event=>onChange({waveform:event.target.value as Waveform})}>
        {INSTRUMENTS.map(instrument=><option key={instrument.waveform} value={instrument.waveform}>{instrument.displayName}</option>)}
      </select>
    </label>
    <label className="playback-check"><input type="checkbox" aria-label="Root only" checked={settings.rootOnly} disabled={disabled}
      onChange={event=>onChange({rootOnly:event.target.checked})}/>Root only</label>
    <label className="playback-field">Melody mix
      <input aria-label="Melody mix" type="range" min="0" max="100" step="1" value={settings.melodyPercent} disabled={disabled}
        onChange={event=>onChange({melodyPercent:Number(event.target.value)})}/>
      <output>{settings.melodyPercent}%</output>
    </label>
    {!settings.rootOnly&&<label className="playback-field">Arpeggio
      <select aria-label="Arpeggio" value={settings.arpeggioIndex} disabled={disabled}
        onChange={event=>onChange({arpeggioIndex:Number(event.target.value)})}>
        {PLAYBACK_ARPEGGIOS.map((_,index)=><option key={index} value={index}>{PLAYBACK_ARPEGGIO_NAMES[index]}</option>)}
      </select>
    </label>}
  </section>;
}

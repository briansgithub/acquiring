import {audioDiagnostics} from './audio-diagnostics';
import './settings.css';

export function AudioDiagnosticsControl(){
  return <div className="audio-diagnostics" data-audio-diagnostics="true">
    <p>Reports stay on this phone until you share them. No song IDs or audio samples are included.</p>
    <button type="button" className="action" aria-label="Share audio diagnostics"
      onClick={() => { void audioDiagnostics.share(); }}>Share audio diagnostics</button>
    <button type="button" className="action" aria-label="Reset audio engine"
      onClick={() => audioDiagnostics.resetEngine()}>Reset audio engine</button>
  </div>;
}

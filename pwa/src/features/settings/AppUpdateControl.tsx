import {PLAY_UPDATE_LABEL,type PlayUpdateStatus,requestAppUpdateCheck,settingsUpdatesHeading} from './play-app-update';
import './settings.css';

export function AppUpdateControl({status}:{status:PlayUpdateStatus}){
  return <section className="panel" data-app-updates="true" data-app-update-status={status}>
    <h2>{settingsUpdatesHeading(status)}</h2>
    <p>{PLAY_UPDATE_LABEL[status]}</p>
    <button type="button" className="action" aria-label="Open Play Store for updates"
      onClick={()=>{void requestAppUpdateCheck();}}>Open Play</button>
  </section>;
}

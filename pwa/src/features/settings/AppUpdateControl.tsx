import {PLAY_UPDATE_LABEL,PWA_PLAY_UPDATE_STATUS,settingsUpdatesHeading} from './play-app-update';
import './settings.css';

/** Native AppSettings Open Play is a Play Store intent. This PWA has no listing; do not fake SW as Play. */
export function AppUpdateControl(){
  return <section className="panel" data-app-updates="true" data-app-update-status={PWA_PLAY_UPDATE_STATUS}>
    <h2>{settingsUpdatesHeading(PWA_PLAY_UPDATE_STATUS)}</h2>
    <p>{PLAY_UPDATE_LABEL[PWA_PLAY_UPDATE_STATUS]}</p>
  </section>;
}

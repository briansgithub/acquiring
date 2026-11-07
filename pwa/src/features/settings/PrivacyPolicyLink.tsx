import {PRIVACY_POLICY_LABEL,PRIVACY_POLICY_URL} from './privacy-policy';
import './settings.css';

export function PrivacyPolicyLink(){
  return <a className="action privacy-policy" href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer"
    data-privacy-policy="true">{PRIVACY_POLICY_LABEL}</a>;
}

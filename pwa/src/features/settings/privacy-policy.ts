import packageJson from '../../../package.json';

/** Frozen 801cf798 strings.xml privacy_policy / privacy_policy_url. Last Settings section, not Library. */
export const PRIVACY_POLICY_LABEL = 'Privacy policy';
export const PRIVACY_POLICY_URL = 'https://bellsworth.dev/apps/acquiring/privacy/';
/** Genuine PWA package metadata. Native APK is versionName 1.0 / versionCode 6; do not fabricate a build code. */
export const APP_VERSION_NAME = packageJson.version;
export function appVersionLabel(): string {
  return `Version ${APP_VERSION_NAME}`;
}

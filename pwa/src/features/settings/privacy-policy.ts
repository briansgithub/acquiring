/** Frozen 801cf798 strings.xml privacy_policy / privacy_policy_url. Last Settings section, not Library. */
export const PRIVACY_POLICY_LABEL = 'Privacy policy';
export const PRIVACY_POLICY_URL = 'https://bellsworth.dev/apps/acquiring/privacy/';
/** Independent PWA identity. Native APK is versionName 1.0 / versionCode 6. */
export const APP_VERSION_NAME = '0.1.0';
export const APP_VERSION_CODE = 1;
export function appVersionLabel(): string {
  return `Version ${APP_VERSION_NAME} (build ${APP_VERSION_CODE})`;
}

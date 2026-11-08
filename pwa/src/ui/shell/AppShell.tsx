import type { ReactNode } from 'react';
import './shell.css';

export type AppShellProps = {
  title: string;
  onSettings?: () => void;
  settingsUpdateAvailable?: boolean;
  onBack?: () => void;
  onTitleClick?: () => void;
  titleActionLabel?: string;
  children: ReactNode;
};

export function AppShell({ title, onSettings, settingsUpdateAvailable = false, onBack, onTitleClick, titleActionLabel = 'Open full title', children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__bar">
          {onBack ? (
            <button className="app-shell__action" type="button" aria-label="Back" onClick={onBack}>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M20 12H4m0 0 7-7m-7 7 7 7" />
              </svg>
            </button>
          ) : <span className="app-shell__action-spacer" aria-hidden="true" />}
          <h1 className="app-shell__title">{onTitleClick?<button type="button" className="app-shell__title-action" aria-label={titleActionLabel} aria-haspopup="dialog" onClick={onTitleClick}>{title}</button>:title}</h1>
          {onSettings ? (
            <button className="app-shell__action" type="button" aria-label="Settings"
              aria-description={settingsUpdateAvailable ? 'Update available' : 'No update'}
              data-settings-update={settingsUpdateAvailable ? 'available' : 'none'}
              onClick={onSettings}>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z" />
                <path d="m19.4 13.5 1.1.85-1.5 2.6-1.3-.5a7.9 7.9 0 0 1-1.4.8l-.2 1.4h-3l-.2-1.4a7.9 7.9 0 0 1-1.6-.7l-1.2.6-1.6-2.5 1-1a7.6 7.6 0 0 1-.1-1.7l-1.1-.8 1.5-2.6 1.3.5a7.9 7.9 0 0 1 1.4-.8l.2-1.4h3l.2 1.4a7.9 7.9 0 0 1 1.4.8l1.3-.5 1.5 2.6-1.1.9a7.6 7.6 0 0 1 0 1.5Z" />
              </svg>
            </button>
          ) : <span className="app-shell__action-spacer" aria-hidden="true" />}
        </div>
      </header>
      <main className="app-shell__content">{children}</main>
    </div>
  );
}

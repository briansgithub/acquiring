import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/app.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
    console.error('Offline shell registration failed', error);
  });
}

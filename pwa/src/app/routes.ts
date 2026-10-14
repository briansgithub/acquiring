import type { Route } from '../contracts';
export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { kind: 'library' };
  if (path === '/settings') return { kind: 'settings' };
  if (path === '/help') return { kind: 'help' };
  const match = /^\/songs\/([^/]+)$/.exec(path);
  if (match) {
    try { return { kind: 'song', slug: decodeURIComponent(match[1]!) }; }
    catch { return { kind: 'not-found' }; }
  }
  return { kind: 'not-found' };
}
export function navigate(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Expected a local app route');
  history.pushState(null, '', path);
  window.dispatchEvent(new Event('acquiring:navigate'));
}
export function subscribeRoute(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  window.addEventListener('acquiring:navigate', listener);
  return () => { window.removeEventListener('popstate', listener); window.removeEventListener('acquiring:navigate', listener); };
}

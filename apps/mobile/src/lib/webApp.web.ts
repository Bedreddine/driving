// Website: link the web app manifest and the iPhone home-screen icon. "Add to Home Screen" then opens the site
// full-screen like an app, which is also what iPhone requires before it allows browser notifications.
// Added from code so the links follow the base path (GitHub Pages serves the site under /driving).
import { normalizeBase } from './webPush';

export function installWebAppLinks() {
  if (typeof document === 'undefined' || document.querySelector('link[rel="manifest"]')) return;
  const base = normalizeBase(process.env.EXPO_BASE_URL);
  const add = (tag: 'link' | 'meta', attrs: Record<string, string>) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  };
  add('link', { rel: 'manifest', href: `${base}/manifest.json` });
  add('link', { rel: 'apple-touch-icon', href: `${base}/apple-touch-icon.png` });
  add('meta', { name: 'theme-color', content: '#0D0F12' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'Élysée' });
}

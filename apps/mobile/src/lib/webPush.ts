// Browser notifications for a guest's ride (Web Push). Pure helpers (no React Native, no browser globals),
// tested with vitest; the browser side is in useWebPush.ts and the service worker in public/push-sw.js.

/** The VAPID public key (base64url, no padding) as the bytes PushManager.subscribe expects. */
export function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** The site's base path ("/driving" on GitHub Pages, "" at the root), without a trailing slash. */
export function normalizeBase(baseUrl: string | null | undefined): string {
  const b = (baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!b) return '';
  return b.startsWith('/') ? b : `/${b}`;
}

/** Where the service worker file is served, and the scope it controls (the whole site). */
export function serviceWorkerPaths(baseUrl: string | null | undefined): { script: string; scope: string } {
  const base = normalizeBase(baseUrl);
  return { script: `${base}/push-sw.js`, scope: `${base}/` };
}

/**
 * A notification's address ("/b/<token>", from the server) inside the service worker's scope, so it opens
 * under the base path too (https://x.github.io/driving/b/<token>). Same logic as in push-sw.js.
 */
export function resolveInScope(url: string | null | undefined, scope: string): string {
  const base = new URL(scope.endsWith('/') ? scope : `${scope}/`);
  const target = new URL((url ?? '').replace(/^\/+/, ''), base);
  // Never another site, whatever the message says.
  return target.origin === base.origin ? target.href : base.href;
}

/** iPhone / iPad Safari: push works only once the site is added to the home screen (iOS 16.4+). */
export function isIos(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** Which rides of this browser are subscribed, by ride token: the endpoint used for each. */
export type PushRides = Record<string, string>;

export function readPushRides(raw: string | null | undefined): PushRides {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, e]) => typeof e === 'string')) as PushRides;
  } catch {
    return {};
  }
}

/** Whether another ride still uses this browser subscription (then turning one ride off must not unsubscribe). */
export function usedByOtherRide(rides: PushRides, token: string, endpoint: string): boolean {
  return Object.entries(rides).some(([t, e]) => t !== token && e === endpoint);
}

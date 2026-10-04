// "Me prévenir": browser notifications for one guest ride (website only). The service worker is
// public/push-sw.js, registered under the site's base path; the subscription is sent to the server with the
// ride, which deletes it with the ride. The browser keeps one subscription for the whole site: it is shared
// by the rides followed on this browser and only cancelled when the last one is turned off.
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { addWebPush, getWebPushKey, removeWebPush } from './publicApi';
import { authStorage } from './storage';
import { base64UrlToUint8Array, isIos, type PushRides, readPushRides, serviceWorkerPaths, usedByOtherRide } from './webPush';

const KEY = 'taxi.webPush';

export type WebPushState =
  /** Not on the website, feature off on the server, or a browser without push. */
  | { kind: 'hidden' }
  /** iPhone Safari outside the home-screen app: push needs the site installed first. */
  | { kind: 'ios-install' }
  | { kind: 'ready'; on: boolean; denied: boolean };

const paths = () => serviceWorkerPaths(process.env.EXPO_BASE_URL);

function readRides(): PushRides {
  try {
    return readPushRides(authStorage?.getItem(KEY));
  } catch {
    return {};
  }
}

function writeRides(rides: PushRides) {
  try {
    if (Object.keys(rides).length) authStorage?.setItem(KEY, JSON.stringify(rides));
    else authStorage?.removeItem(KEY);
  } catch {
    // storage unavailable (private browsing): the server still has the subscription
  }
}

const pushSupported = () =>
  typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function installedAsApp(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}

/** Same key bytes? A subscription made with an older server key must be renewed. */
function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

export function useWebPush(token: string) {
  const [state, setState] = useState<WebPushState>({ kind: 'hidden' });
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !token) return;
    let alive = true;
    void (async () => {
      const key = (await getWebPushKey().catch(() => null))?.public_key ?? null;
      if (!alive || !key) return;
      setPublicKey(key);
      if (isIos(navigator.userAgent, navigator.maxTouchPoints) && !installedAsApp()) {
        setState({ kind: 'ios-install' });
        return;
      }
      if (!pushSupported()) return;
      const reg = await navigator.serviceWorker.getRegistration(paths().scope).catch(() => undefined);
      const sub = await reg?.pushManager.getSubscription().catch(() => null);
      if (!alive) return;
      const granted = Notification.permission === 'granted';
      setState({ kind: 'ready', on: granted && !!sub && readRides()[token] === sub.endpoint, denied: Notification.permission === 'denied' });
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  /** Must run straight from a tap: browsers only ask for permission after a user gesture. */
  const enable = useCallback(async () => {
    if (!publicKey || !pushSupported()) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState({ kind: 'ready', on: false, denied: permission === 'denied' });
        return;
      }
      const { script, scope } = paths();
      await navigator.serviceWorker.register(script, { scope });
      const reg = await navigator.serviceWorker.ready;
      const appKey = base64UrlToUint8Array(publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub.options.applicationServerKey, appKey)) {
        await sub.unsubscribe().catch(() => undefined);
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
      const keys = sub.toJSON().keys ?? {};
      if (!keys.p256dh || !keys.auth) throw new Error('generic');
      await addWebPush(token, { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
      writeRides({ ...readRides(), [token]: sub.endpoint });
      setState({ kind: 'ready', on: true, denied: false });
    } catch (e) {
      setError((e as Error).message || 'generic');
    } finally {
      setBusy(false);
    }
  }, [publicKey, token]);

  const disable = useCallback(async () => {
    if (!pushSupported()) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration(paths().scope);
      const sub = await reg?.pushManager.getSubscription();
      const rides = readRides();
      const endpoint = sub?.endpoint ?? rides[token];
      if (endpoint) await removeWebPush(token, endpoint);
      delete rides[token];
      writeRides(rides);
      if (sub && !usedByOtherRide(rides, token, sub.endpoint)) await sub.unsubscribe().catch(() => undefined);
      setState((s) => (s.kind === 'ready' ? { ...s, on: false } : s));
    } catch (e) {
      setError((e as Error).message || 'generic');
    } finally {
      setBusy(false);
    }
  }, [token]);

  return { state, busy, error, enable, disable };
}

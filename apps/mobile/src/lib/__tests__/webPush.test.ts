import { describe, expect, it } from 'vitest';
import { base64UrlToUint8Array, isIos, normalizeBase, readPushRides, resolveInScope, serviceWorkerPaths, usedByOtherRide } from '../webPush';

describe('web push helpers', () => {
  it('decodes a base64url VAPID key', () => {
    // bytes 0xfb 0xff 0xfe use both url-safe characters
    expect(Array.from(base64UrlToUint8Array('-__-'))).toEqual([0xfb, 0xff, 0xfe]);
    expect(Array.from(base64UrlToUint8Array('AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(base64UrlToUint8Array('AQ'))).toEqual([1]);
    // A real P-256 public key: 65 bytes starting with 0x04.
    const key = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    const bytes = base64UrlToUint8Array(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });

  it('places the service worker under the base path', () => {
    expect(serviceWorkerPaths('')).toEqual({ script: '/push-sw.js', scope: '/' });
    expect(serviceWorkerPaths(undefined)).toEqual({ script: '/push-sw.js', scope: '/' });
    expect(serviceWorkerPaths('/driving')).toEqual({ script: '/driving/push-sw.js', scope: '/driving/' });
    expect(serviceWorkerPaths('/driving/')).toEqual({ script: '/driving/push-sw.js', scope: '/driving/' });
    expect(normalizeBase('driving')).toBe('/driving');
  });

  it('opens the ride inside the scope', () => {
    expect(resolveInScope('/b/abc', 'https://x.github.io/driving/')).toBe('https://x.github.io/driving/b/abc');
    expect(resolveInScope('/b/abc', 'https://taxi.example/')).toBe('https://taxi.example/b/abc');
    expect(resolveInScope(null, 'https://x.github.io/driving')).toBe('https://x.github.io/driving/');
    expect(resolveInScope('https://evil.example/b/abc', 'https://taxi.example/')).toBe('https://taxi.example/');
    expect(resolveInScope('//evil.example/b/abc', 'https://taxi.example/')).toBe('https://taxi.example/evil.example/b/abc');
  });

  it('recognises iPhones and iPads', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIos('Mozilla/5.0 (Linux; Android 15)')).toBe(false);
  });

  it('keeps the browser subscription while another ride uses it', () => {
    const rides = readPushRides(JSON.stringify({ a: 'https://push/1', b: 'https://push/1', c: 42 }));
    expect(rides).toEqual({ a: 'https://push/1', b: 'https://push/1' });
    expect(usedByOtherRide(rides, 'a', 'https://push/1')).toBe(true);
    expect(usedByOtherRide({ a: 'https://push/1' }, 'a', 'https://push/1')).toBe(false);
    expect(readPushRides('not json')).toEqual({});
  });
});

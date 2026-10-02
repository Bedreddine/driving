// One WebSocket to the API: the server sends {"type":"rides-changed"} when one of our rides changes,
// and every subscribed screen reloads.
// - If the connection drops, the access token may have expired (15 min): renew it, then reconnect.
// - When the phone app comes back to the foreground, reconnect and reload (the OS may have cut the socket).
import { AppState } from 'react-native';
import { accessToken, apiUrl, onAuthChange, refresh } from './http';

const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;

const notifyAll = () => listeners.forEach((l) => l());

function connect() {
  const token = accessToken();
  if (!token || socket || listeners.size === 0) return;
  const ws = new WebSocket(`${apiUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`);
  socket = ws;
  ws.onopen = () => {
    // Back online after a failure: changes may have been missed meanwhile.
    if (attempt > 0) notifyAll();
    attempt = 0;
  };
  ws.onmessage = notifyAll;
  ws.onclose = () => {
    if (socket === ws) socket = null;
    if (listeners.size === 0 || !accessToken()) return;
    const delay = Math.min(30_000, 1000 * 2 ** attempt++);
    retry = setTimeout(async () => {
      retry = null;
      await refresh(); // the usual cause is an expired access token; a network failure leaves the session as is
      connect();
    }, delay);
  };
}

function disconnect() {
  if (retry) clearTimeout(retry);
  retry = null;
  const ws = socket;
  socket = null;
  ws?.close();
}

onAuthChange((signedIn) => {
  disconnect();
  attempt = 0;
  if (signedIn) connect();
});

AppState.addEventListener('change', (state) => {
  if (state !== 'active' || listeners.size === 0 || !accessToken()) return;
  // The OS may have suspended the socket without telling us: start fresh and reload what is on screen.
  disconnect();
  attempt = 0;
  connect();
  notifyAll();
});

export function subscribeRides(onChange: () => void) {
  listeners.add(onChange);
  connect();
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) disconnect();
  };
}

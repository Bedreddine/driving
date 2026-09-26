// One WebSocket to the API: the server sends {"type":"rides-changed"} when one of our rides changes,
// and every subscribed screen reloads. Reconnects with a growing delay if the connection drops.
import { accessToken, apiUrl, onAuthChange } from './http';

const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;

function connect() {
  const token = accessToken();
  if (!token || socket || listeners.size === 0) return;
  const ws = new WebSocket(`${apiUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`);
  socket = ws;
  ws.onopen = () => {
    attempt = 0;
  };
  ws.onmessage = () => listeners.forEach((l) => l());
  ws.onclose = () => {
    socket = null;
    if (listeners.size === 0 || !accessToken()) return;
    // The access token may have expired: the next API call refreshes it, then we reconnect.
    const delay = Math.min(30_000, 1000 * 2 ** attempt++);
    retry = setTimeout(connect, delay);
  };
}

function disconnect() {
  if (retry) clearTimeout(retry);
  retry = null;
  socket?.close();
  socket = null;
}

onAuthChange((signedIn) => {
  disconnect();
  if (signedIn) connect();
});

export function subscribeRides(onChange: () => void) {
  listeners.add(onChange);
  connect();
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) disconnect();
  };
}

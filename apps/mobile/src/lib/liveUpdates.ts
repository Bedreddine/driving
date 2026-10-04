// One WebSocket to the API: the server sends {"type":"rides-changed"} when one of our rides changes,
// and every subscribed screen reloads; {"type":"ride-message","ride_id":"…"} when the client wrote about a
// ride, and only that ride's open conversation reloads.
// - If the connection drops, the access token may have expired (15 min): renew it, then reconnect.
// - When the phone app comes back to the foreground, reconnect and reload (the OS may have cut the socket).
import { AppState } from 'react-native';
import { accessToken, apiUrl, onAuthChange, refresh } from './http';

const listeners = new Set<() => void>();
/** Open conversations, by ride id. */
const messageListeners = new Map<string, Set<() => void>>();
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;

const listening = () => listeners.size > 0 || messageListeners.size > 0;
/** Everything on screen reloads (after a reconnection, changes and messages may have been missed). */
const notifyAll = () => {
  listeners.forEach((l) => l());
  messageListeners.forEach((set) => set.forEach((l) => l()));
};
const notifyRides = () => listeners.forEach((l) => l());

function onMessage(e: { data?: unknown }) {
  type LiveEvent = { type?: unknown; ride_id?: unknown };
  const parse = (): LiveEvent | null => {
    try {
      return typeof e.data === 'string' ? (JSON.parse(e.data) as LiveEvent) : null;
    } catch {
      return null; // not JSON: treat it as a change, as before
    }
  };
  const event = parse();
  if (event?.type === 'ride-message') {
    if (typeof event.ride_id === 'string') messageListeners.get(event.ride_id)?.forEach((l) => l());
    return;
  }
  notifyRides();
}

function connect() {
  const token = accessToken();
  if (!token || socket || !listening()) return;
  const ws = new WebSocket(`${apiUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`);
  socket = ws;
  ws.onopen = () => {
    // Back online after a failure: changes may have been missed meanwhile.
    if (attempt > 0) notifyAll();
    attempt = 0;
  };
  ws.onmessage = onMessage;
  ws.onclose = () => {
    if (socket === ws) socket = null;
    if (!listening() || !accessToken()) return;
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
  if (state !== 'active' || !listening() || !accessToken()) return;
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
    if (!listening()) disconnect();
  };
}

/** Reload one ride's conversation when the other side writes (driver and back office). */
export function subscribeRideMessages(rideId: string, onMessage: () => void) {
  let set = messageListeners.get(rideId);
  if (!set) messageListeners.set(rideId, (set = new Set()));
  set.add(onMessage);
  connect();
  return () => {
    const current = messageListeners.get(rideId);
    current?.delete(onMessage);
    if (current && current.size === 0) messageListeners.delete(rideId);
    if (!listening()) disconnect();
  };
}

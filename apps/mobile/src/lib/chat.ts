// Messages between the client and the driver about one ride. Pure helpers (no React Native), tested with vitest.
import type { RideStatus } from './api';

export type ChatSide = 'driver' | 'client';
export type ChatMessage = { id: string; from: ChatSide; body: string; at: string };

export const MAX_BODY = 500;
/** The server closes the conversation this long after the pickup time. */
export const CLOSE_AFTER_MS = 12 * 60 * 60 * 1000;

const byTime = (a: ChatMessage, b: ChatMessage) => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Adds what the server sent to what is on screen: each message once (by id), oldest first.
 * Returns `current` itself when nothing changed, so polling every few seconds does not re-render.
 */
export function mergeMessages(current: ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const known = new Map(current.map((m) => [m.id, m]));
  let changed = false;
  for (const m of incoming) {
    const old = known.get(m.id);
    if (!old || old.body !== m.body || old.at !== m.at || old.from !== m.from) {
      known.set(m.id, m);
      changed = true;
    }
  }
  return changed ? [...known.values()].sort(byTime) : current;
}

/** Messages from the other side that came after the last one seen (by id; all of them when none was seen). */
export function unreadCount(messages: readonly ChatMessage[], me: ChatSide, lastSeenId: string | null): number {
  const start = lastSeenId ? messages.findIndex((m) => m.id === lastSeenId) + 1 : 0;
  return messages.slice(start).filter((m) => m.from !== me).length;
}

/** The text to send, trimmed; null when empty or too long. */
export function cleanBody(text: string): string | null {
  const body = text.trim();
  return body.length === 0 || body.length > MAX_BODY ? null : body;
}

/** Whether the conversation is still open, as far as the app can tell (the server has the last word: MESSAGES_CLOSED). */
export function chatOpen(status: RideStatus, pickupAt: string, now: number): boolean {
  if (status !== 'requested' && status !== 'price_proposed' && status !== 'accepted') return false;
  return now <= Date.parse(pickupAt) + CLOSE_AFTER_MS;
}

import { describe, expect, it } from 'vitest';
import { chatOpen, cleanBody, type ChatMessage, mergeMessages, unreadCount } from '../chat';

const m = (id: string, from: 'driver' | 'client', at: string, body = id): ChatMessage => ({ id, from, body, at });

describe('chat messages', () => {
  it('merges each message once, oldest first', () => {
    const a = m('a', 'client', '2026-10-04T20:00:00Z');
    const b = m('b', 'driver', '2026-10-04T20:01:00Z');
    const c = m('c', 'client', '2026-10-04T20:02:00Z');
    expect(mergeMessages([a], [c, b, a]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns the same list when a poll brings nothing new', () => {
    const list = [m('a', 'client', '2026-10-04T20:00:00Z')];
    expect(mergeMessages(list, [m('a', 'client', '2026-10-04T20:00:00Z')])).toBe(list);
    expect(mergeMessages(list, [])).toBe(list);
  });

  it('counts unread messages from the other side only', () => {
    const list = [
      m('a', 'driver', '2026-10-04T20:00:00Z'),
      m('b', 'client', '2026-10-04T20:01:00Z'),
      m('c', 'driver', '2026-10-04T20:02:00Z'),
      m('d', 'driver', '2026-10-04T20:03:00Z'),
    ];
    expect(unreadCount(list, 'client', null)).toBe(3);
    expect(unreadCount(list, 'client', 'b')).toBe(2);
    expect(unreadCount(list, 'client', 'd')).toBe(0);
    expect(unreadCount(list, 'driver', 'a')).toBe(1);
  });

  it('trims and limits what is sent', () => {
    expect(cleanBody('  Je suis devant  ')).toBe('Je suis devant');
    expect(cleanBody('   ')).toBeNull();
    expect(cleanBody('x'.repeat(500))).toHaveLength(500);
    expect(cleanBody('x'.repeat(501))).toBeNull();
  });

  it('is open until 12 hours after pickup, for rides still going', () => {
    const pickup = '2026-10-04T20:00:00Z';
    const t = Date.parse(pickup);
    expect(chatOpen('accepted', pickup, t + 11 * 3600_000)).toBe(true);
    expect(chatOpen('accepted', pickup, t + 13 * 3600_000)).toBe(false);
    expect(chatOpen('requested', pickup, t)).toBe(true);
    expect(chatOpen('completed', pickup, t)).toBe(false);
    expect(chatOpen('cancelled', pickup, t)).toBe(false);
  });
});

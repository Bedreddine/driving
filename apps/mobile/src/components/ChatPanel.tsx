// Messages between the client and the driver about one ride: the same panel on the guest ride page
// (the client's messages on the right) and on the driver's ride detail (the driver's on the right).
// Guests have no live connection: the page checks every few seconds; the driver app reloads on the
// WebSocket "ride-message" event.
import { useCallback, useEffect, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Platform, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { type ChatMessage, type ChatSide, cleanBody, MAX_BODY, mergeMessages, unreadCount } from '@/lib/chat';
import { formatDateTime, formatTime } from '@/lib/format';
import { fonts, radius, tabular, useTheme } from '@/lib/theme';
import { useNow } from '@/lib/useNow';
import { Field, Icon, shades, Touchable } from './controls';
import { Chip } from './scene';

type Props = {
  /** Whose screen this is: their messages sit on the right. */
  me: ChatSide;
  load: () => Promise<ChatMessage[]>;
  send: (body: string) => Promise<ChatMessage>;
  /** Whether the app thinks the conversation is open (ride going on, < 12 h after pickup). */
  open: boolean;
  quickReplies: string[];
  /** Guests: check for new messages this often while the page is visible. */
  pollMs?: number;
  /** Driver: reload when the server announces a message. Returns the unsubscribe function. */
  subscribe?: (reload: () => void) => () => void;
  /** Whether the panel is on screen in the page; messages arriving while it is not count as unread. */
  inView?: boolean;
  /** The number of unread messages, for an indicator elsewhere on the page. */
  onUnread?: (count: number) => void;
};

const BOTTOM_SLACK = 24;
const DAY_MS = 20 * 60 * 60 * 1000;

const pageHidden = () => Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState === 'hidden';

export function ChatPanel({ me, load, send, open, quickReplies, pollMs, subscribe, inView = true, onUnread }: Props) {
  const { t, err, lang } = useAuth();
  const theme = useTheme();
  const now = useNow();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [serverClosed, setServerClosed] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [seenId, setSeenId] = useState<string | null>(null);
  const list = useRef<ScrollView>(null);
  const atBottomRef = useRef(true);
  const firstLoad = useRef(true);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const closed = !open || serverClosed;

  const reload = useCallback(async () => {
    try {
      const incoming = await loadRef.current();
      setMessages((cur) => mergeMessages(cur, incoming ?? []));
      if (firstLoad.current) {
        // The history found on opening is not "new".
        firstLoad.current = false;
        setSeenId(incoming?.length ? incoming[incoming.length - 1].id : null);
      }
      setLoaded(true);
    } catch (e) {
      const code = (e as Error).message;
      if (code === 'MESSAGES_CLOSED') setServerClosed(true);
      // An older server without messages: no panel at all.
      else if (code === 'NOT_FOUND' || code === 'FORBIDDEN') setUnavailable(true);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Driver: live, from the WebSocket.
  useEffect(() => (subscribe ? subscribe(() => void reload()) : undefined), [subscribe, reload]);

  // Guest: every few seconds while the conversation is open and the page is visible; at once on coming back.
  useEffect(() => {
    if (!pollMs || closed || unavailable) return;
    const id = setInterval(() => {
      if (!pageHidden()) void reload();
    }, pollMs);
    const onVisible = () => {
      if (!pageHidden()) void reload();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pollMs, closed, unavailable, reload]);

  // Everything is read while the end of the conversation is on screen.
  const lastId = messages.length ? messages[messages.length - 1].id : null;
  const looking = inView && atBottom;
  if (looking && loaded && seenId !== lastId) setSeenId(lastId);
  const unread = looking ? 0 : unreadCount(messages, me, seenId);
  useEffect(() => {
    onUnread?.(unread);
  }, [unread, onUnread]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const bottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - BOTTOM_SLACK;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
  };

  const toEnd = (animated = true) => list.current?.scrollToEnd({ animated });

  const submit = async (raw: string, fromField: boolean) => {
    const body = cleanBody(raw);
    if (!body || sending || closed) return;
    setSending(true);
    setError(null);
    try {
      const sent = await send(body);
      setMessages((cur) => mergeMessages(cur, sent ? [sent] : []));
      if (sent) setSeenId(sent.id);
      if (fromField) setText('');
      atBottomRef.current = true;
      setAtBottom(true);
      if (!sent) void reload();
    } catch (e) {
      const code = (e as Error).message;
      if (code === 'MESSAGES_CLOSED') setServerClosed(true);
      setError(err(code));
    } finally {
      setSending(false);
    }
  };

  if (unavailable || (loaded && closed && messages.length === 0)) return null;

  const time = (iso: string) => (now - Date.parse(iso) > DAY_MS ? formatDateTime(iso, lang) : formatTime(iso, lang));
  const newLabel = unread === 1 ? t('chatNewOne') : t('chatNewMany').replace('{n}', String(unread));

  return (
    <View
      accessibilityLabel={t('chatTitle')}
      style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.rule, borderRadius: radius.card, padding: 14, gap: 10 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: theme.rule, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="message-circle" size={16} color={theme.primary} />
        </View>
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.bold, fontSize: 17, color: theme.text }}>
          {t('chatTitle')}
        </Text>
        {unread > 0 ? (
          <View
            accessibilityLiveRegion="polite"
            accessibilityLabel={newLabel}
            style={{ minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: theme.onPrimary, ...tabular }}>{unread}</Text>
          </View>
        ) : null}
      </View>

      {messages.length === 0 ? (
        loaded ? (
          <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: theme.muted }}>
            {me === 'client' ? t('chatEmptyClient') : t('chatEmptyDriver')}
          </Text>
        ) : null
      ) : (
        <View>
          <ScrollView
            ref={list}
            style={{ maxHeight: 360 }}
            contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
              if (atBottomRef.current) toEnd(loaded);
            }}
          >
            {messages.map((m) => {
              const mine = m.from === me;
              const who = mine ? t('chatFromYou') : m.from === 'driver' ? t('chatFromDriver') : t('chatFromClient');
              const stamp = time(m.at);
              return (
                <View
                  key={m.id}
                  accessible
                  accessibilityLabel={`${who.replace('{time}', stamp)} : ${m.body}`}
                  style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '86%', gap: 3 }}
                >
                  <View
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: radius.control,
                      borderBottomRightRadius: mine ? 4 : radius.control,
                      borderBottomLeftRadius: mine ? radius.control : 4,
                      backgroundColor: mine ? theme.raised : theme.control,
                      borderWidth: 1,
                      borderColor: mine ? theme.edge : theme.rule,
                    }}
                  >
                    <Text selectable style={{ fontFamily: fonts.body, fontSize: 15.5, lineHeight: 22, color: theme.text }}>
                      {m.body}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: theme.muted, textAlign: mine ? 'right' : 'left', ...tabular }}>{stamp}</Text>
                </View>
              );
            })}
          </ScrollView>
          {unread > 0 && !atBottom ? (
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={newLabel}
              onPress={() => toEnd()}
              pressScale={0.95}
              style={({ hovered, pressed }) => ({
                position: 'absolute',
                bottom: 6,
                alignSelf: 'center',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: 44,
                paddingHorizontal: 16,
                borderRadius: radius.pill,
                borderWidth: 1.5,
                borderColor: theme.primary,
                backgroundColor: pressed ? theme.edge : hovered ? theme.controlHover : theme.raised,
              })}
            >
              <Icon name="arrow-down" size={16} color={theme.primary} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: theme.text }}>{newLabel}</Text>
            </Touchable>
          ) : null}
        </View>
      )}

      {closed ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="lock" size={15} color={theme.muted} />
          <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: theme.muted }}>{t('chatClosed')}</Text>
        </View>
      ) : (
        <>
          <View accessibilityLabel={t('chatQuick')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {quickReplies.map((q) => (
              <Chip key={q} label={q} onPress={() => void submit(q, false)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label={t('chatField')}
                value={text}
                onChangeText={setText}
                maxLength={MAX_BODY}
                returnKeyType="send"
                submitBehavior="submit"
                onSubmitEditing={() => void submit(text, true)}
                error={error}
              />
            </View>
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={t('chatSend')}
              accessibilityState={{ disabled: sending || !cleanBody(text), busy: sending }}
              disabled={sending || !cleanBody(text)}
              haptic="impact"
              onPress={() => void submit(text, true)}
              pressScale={0.94}
              style={({ hovered, pressed }) => ({
                width: 56,
                height: 56,
                borderRadius: radius.control,
                alignItems: 'center',
                justifyContent: 'center',
                // Error text under the field pushes it down: stay level with the box.
                alignSelf: error ? 'flex-start' : 'center',
                marginTop: error ? 11 : 0,
                backgroundColor: pressed ? shades.primaryPressed : hovered ? shades.primaryHover : theme.primary,
                opacity: sending || !cleanBody(text) ? 0.4 : 1,
              })}
            >
              <Icon name="send" size={20} color={theme.onPrimary} />
            </Touchable>
          </View>
        </>
      )}
    </View>
  );
}

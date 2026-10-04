// The driver's live moments of a confirmed ride. The client sees the newest one at the top of the ride page;
// the driver sends "on the way" and "arrived" with two big buttons ("arriving" comes from the live position).
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { postMoment, type Ride } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatTime } from '@/lib/format';
import { type Moment, momentAt, momentTitleKey } from '@/lib/moments';
import { fonts, radius, tabular, useTheme } from '@/lib/theme';
import { Button, Icon } from './controls';
import { LiveDot } from './scene';
import { Card, CardTitle, ErrorText } from './ui';

/** Guest page: the newest moment, big and amber, so a glance at the phone is enough. */
export function MomentBanner({ moment }: { moment: Moment }) {
  const { t, lang } = useAuth();
  const theme = useTheme();
  const title = t(momentTitleKey(moment.kind));
  const at = t('momentAt').replace('{time}', formatTime(moment.at, lang));
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${title}, ${at}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: radius.card,
        borderWidth: 1.5,
        borderColor: theme.primary,
        backgroundColor: theme.surface,
      }}
    >
      <LiveDot />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 19, lineHeight: 25, color: theme.text }}>{title}</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: theme.primary, ...tabular }}>{at}</Text>
      </View>
    </View>
  );
}

/** Driver's ride detail: "Je suis en route", then "Je suis arrivé"; each shows its time once sent. */
export function DriverMoments({ ride, onChanged, onSent }: { ride: Ride; onChanged: () => void; onSent?: (kind: 'on_the_way' | 'arrived') => void }) {
  const { t, err, lang } = useAuth();
  const theme = useTheme();
  const [busy, setBusy] = useState<'on_the_way' | 'arrived' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Shown as done at once; the reloaded ride then brings the server's time.
  const [sent, setSent] = useState<Partial<Record<'on_the_way' | 'arrived', string>>>({});

  const onTheWayAt = momentAt(ride.moments, 'on_the_way') ?? sent.on_the_way ?? null;
  const arrivingAt = momentAt(ride.moments, 'arriving');
  const arrivedAt = momentAt(ride.moments, 'arrived') ?? sent.arrived ?? null;

  const send = async (kind: 'on_the_way' | 'arrived') => {
    setBusy(kind);
    setError(null);
    try {
      await postMoment(ride.id, kind);
      setSent((s) => ({ ...s, [kind]: new Date().toISOString() }));
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onSent?.(kind);
      onChanged();
    } catch (e) {
      setError(err((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const done = (label: string) => (
    <View
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, borderRadius: radius.control, borderWidth: 1.5, borderColor: theme.rule, backgroundColor: theme.control }}
    >
      <Icon name="check-circle" size={20} color={theme.success} />
      <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 16.5, color: theme.text, ...tabular }}>{label}</Text>
    </View>
  );

  return (
    <Card style={{ gap: 10 }}>
      <CardTitle icon="navigation" help={t('momentsHelp')}>
        {t('momentsTitle')}
      </CardTitle>
      {onTheWayAt
        ? done(t('momentOnTheWayDone').replace('{time}', formatTime(onTheWayAt, lang)))
        : (
            <Button
              size="lg"
              icon="navigation"
              kind={arrivingAt && !arrivedAt ? 'secondary' : 'primary'}
              title={t('momentOnTheWay')}
              loading={busy === 'on_the_way'}
              disabled={!!busy}
              onPress={() => void send('on_the_way')}
            />
          )}
      {arrivingAt && !arrivedAt ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <LiveDot />
          <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 14.5, lineHeight: 20, color: theme.primary }}>{t('momentArrivingHint')}</Text>
        </View>
      ) : null}
      {arrivedAt
        ? done(t('momentArrivedDone').replace('{time}', formatTime(arrivedAt, lang)))
        : (
            <Button
              size="lg"
              icon="map-pin"
              kind={arrivingAt ? 'primary' : 'secondary'}
              title={t('momentArrived')}
              loading={busy === 'arrived'}
              disabled={!!busy}
              onPress={() => void send('arrived')}
            />
          )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { PremiumCard, PremiumShell } from '@/components/PremiumShell';
import { StatusBadge } from '@/components/RideCard';
import { Button, colors, ErrorText, Label, Loading, Muted, Row, serif, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { confirmAsk } from '@/lib/confirm';
import { formatDateTime, formatKm, formatMinutes, formatPrice } from '@/lib/format';
import type { TextKey } from '@/lib/i18n';
import { type BusinessInfo, cancelAsGuest, getBusiness, getGuestRide, type PublicRide, respondAsGuest } from '@/lib/publicApi';

const REFRESH_MS = 30_000;

/** The private link of one ride (sent by email): follow it, answer a price proposal, cancel. No account needed. */
export default function GuestRide() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t, err, lang } = useAuth();
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [ride, setRide] = useState<PublicRide | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getGuestRide(token)
        .then(setRide)
        .catch(() => setRide(null)),
    [token],
  );

  useEffect(() => {
    void getBusiness().then(setBusiness).catch(() => undefined);
    void load();
    // No account means no live connection: check again regularly while the page is open.
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(err((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const open = ride && ['requested', 'price_proposed', 'accepted'].includes(ride.status);
  const price = ride ? ride.final_price ?? ride.agreed_price ?? ride.proposed_price ?? ride.estimated_price : null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: t('yourRide') }} />
      <PremiumShell business={business}>
        <Text style={{ fontFamily: serif, color: '#FFFFFF', fontSize: 24, textAlign: 'center' }}>{t('yourRide')}</Text>

        {ride === undefined ? <Loading /> : null}
        {ride === null ? (
          <PremiumCard>
            <Text style={styles.text}>{err('NOT_FOUND')}</Text>
          </PremiumCard>
        ) : null}

        {ride ? (
          <>
            <PremiumCard>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={[styles.text, { fontWeight: '700', fontSize: 18 }]}>{formatDateTime(ride.pickup_at, lang)}</Text>
                <StatusBadge status={ride.status} />
              </Row>
              <Text style={styles.text}>{t(`guestStatus_${ride.status}` as TextKey)}</Text>
              <Label>{t('from')}</Label>
              <Text style={styles.text}>{ride.pickup_address}</Text>
              <Label>{t('to')}</Label>
              <Text style={styles.text}>{ride.dropoff_address}</Text>
              <Muted>
                {formatKm(ride.distance_m)} · {formatMinutes(ride.duration_s)} · {ride.passengers} 👤 · {ride.luggage} 🧳
                {ride.travel_ref ? ` · ${ride.travel_ref}` : ''}
                {ride.meet_greet ? ` · ${t('meetGreet')}` : ''}
              </Muted>
              {ride.cancel_reason ? <Muted>{`${t('reason')}: ${ride.cancel_reason}`}</Muted> : null}
            </PremiumCard>

            <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 14, padding: 18, gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: '#E8E4DA', fontSize: 16 }}>
                  {ride.status === 'price_proposed'
                    ? t('proposedPrice')
                    : ride.final_price !== null
                      ? t('finalPrice')
                      : ride.agreed_price !== null
                        ? t('agreedPrice')
                        : ride.is_fixed_price
                          ? t('fixedPrice')
                          : t('estimate')}
                </Text>
                <Text style={{ fontFamily: serif, color: colors.gold, fontSize: 30 }}>
                  {formatPrice(price, ride.currency, lang)}
                </Text>
              </Row>
              {ride.status === 'price_proposed' && ride.answer_deadline ? (
                <Text style={{ color: '#8A8A90' }}>{`${t('answerBefore')} ${formatDateTime(ride.answer_deadline, lang)}`}</Text>
              ) : null}
            </View>

            <ErrorText>{error}</ErrorText>
            {ride.status === 'price_proposed' ? (
              <View style={{ gap: 10 }}>
                <Button kind="gold" title={t('acceptPrice')} loading={busy === 'yes'} onPress={() => act('yes', () => respondAsGuest(token, true))} />
                <Button kind="secondary" title={t('refusePrice')} loading={busy === 'no'} onPress={() => act('no', () => respondAsGuest(token, false))} />
              </View>
            ) : null}
            {open ? (
              <Button
                kind="danger"
                title={t('cancelRide')}
                loading={busy === 'cancel'}
                onPress={async () => {
                  if (await confirmAsk(`${t('cancelRide')} ?`, t('confirm'), t('back'))) {
                    void act('cancel', () => cancelAsGuest(token));
                  }
                }}
              />
            ) : null}
            {business?.phone ? (
              <Button kind="secondary" title={`☎ ${t('callDriver')}`} onPress={() => void Linking.openURL(`tel:${business.phone}`)} />
            ) : null}
            <Text style={{ color: '#8A8A90', textAlign: 'center', fontSize: 12 }}>{t('keepLink')}</Text>
            <Link href="/book" style={{ color: colors.gold, textAlign: 'center', fontWeight: '600' }}>
              {t('bookAnother')}
            </Link>
          </>
        ) : null}
      </PremiumShell>
    </>
  );
}

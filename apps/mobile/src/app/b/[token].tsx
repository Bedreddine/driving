import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClientTopBar } from '@/components/ClientTopBar';
import { MapScene } from '@/components/map/MapScene';
import { ReviewForm } from '@/components/Reviews';
import { hasVehicle, VehicleCard } from '@/components/Vehicle';
import { AboardMenu, Display, LiveDot, MonoLine, Rise, Timeline, type TimelineStep } from '@/components/scene';
import { Body, Button, ErrorText, Loading, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { confirmAsk } from '@/lib/confirm';
import { formatDateTime, formatDay, formatKm, formatMinutes, formatPrice, formatTime } from '@/lib/format';
import { apiUrl } from '@/lib/http';
import type { TextKey } from '@/lib/i18n';
import type { LngLat } from '@/lib/mapStyle';
import { shortName, SUGGESTED_PLACES } from '@/lib/places';
import { type BusinessInfo, cancelAsGuest, type DriverPosition, getBusiness, getDriverPosition, getGuestRide, type PublicRide, respondAsGuest } from '@/lib/publicApi';
import { fonts, night } from '@/lib/theme';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

const REFRESH_MS = 30_000;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const short = (address: string) => SUGGESTED_PLACES.find((p) => p.address === address)?.short ?? shortName(address);

/** Colour of the status line: confirmed and done in sage, refused or cancelled in coral, waiting in amber. */
function statusColor(status: PublicRide['status']) {
  if (status === 'accepted' || status === 'completed') return night.success;
  if (status === 'requested' || status === 'price_proposed') return night.primary;
  return night.error;
}

/** Where the ride stands, for the timeline. Rides that ended without happening have none. */
function timelineOf(ride: PublicRide, t: (k: TextKey) => string, lang: 'fr' | 'en'): { steps: TimelineStep[]; reached: number } | null {
  const reachedByStatus: Partial<Record<PublicRide['status'], number>> = { requested: 0, price_proposed: 1, accepted: 1, completed: 2 };
  const reached = reachedByStatus[ride.status];
  if (reached === undefined) return null;
  const second: TimelineStep =
    ride.status === 'price_proposed'
      ? { title: t('tl_priceProposed'), detail: t('tl_priceProposedDetail') }
      : { title: reached >= 1 ? t('tl_confirmed') : t('tl_confirm') };
  return {
    reached,
    steps: [
      { title: t('tl_sent'), detail: reached === 0 ? t('tl_sentDetail') : undefined },
      second,
      { title: ride.status === 'completed' ? t('tl_done') : `${t('tl_pickup')} · ${formatTime(ride.pickup_at, lang)}` },
    ],
  };
}

/** The private link of one ride (sent by email): follow it on the map, answer a price proposal, cancel, leave a review. */
export default function GuestRide() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t, err, lang } = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [ride, setRide] = useState<PublicRide | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [driverAt, setDriverAt] = useState<DriverPosition | null>(null);

  const load = useCallback(
    () =>
      getGuestRide(token)
        .then(setRide)
        .catch(() => setRide(null)),
    [token],
  );

  useDocumentTitle(business ? `${business.name} – ${t('yourRide')}` : null);

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

  // The driver's car, live, while the ride is confirmed (the server decides when it is shown).
  const confirmed = ride?.status === 'accepted';
  useEffect(() => {
    if (!confirmed) return;
    let alive = true;
    const poll = () =>
      getDriverPosition(token)
        .then((p) => alive && setDriverAt(p ?? null))
        .catch(() => undefined);
    void poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [confirmed, token]);
  const car = confirmed && driverAt ? { lngLat: [driverAt.lng, driverAt.lat] as LngLat, heading: driverAt.heading } : null;
  const etaMin = driverAt?.eta_s != null ? Math.max(1, Math.round(driverAt.eta_s / 60)) : null;
  const who = business?.driver_name ?? t('yourDriver');
  const liveLine = !car
    ? null
    : driverAt?.eta_to === 'dropoff'
      ? etaMin != null
        ? t('driverToDropoff').replace('{min}', String(etaMin))
        : t('driverLive')
      : etaMin != null && etaMin <= 1
        ? t('driverNear').replace('{name}', who)
        : etaMin != null
          ? t('driverOnTheWay').replace('{name}', who).replace('{min}', String(etaMin))
          : t('driverLive');

  const open = ride && ['requested', 'price_proposed', 'accepted'].includes(ride.status);
  // Which price to show, and its name. A refused proposal no longer counts: back to the estimate.
  const priced: { amount: number | null; label: TextKey } | null = !ride
    ? null
    : ride.final_price !== null
      ? { amount: ride.final_price, label: 'finalPrice' }
      : ride.agreed_price !== null
        ? { amount: ride.agreed_price, label: 'agreedPrice' }
        : ride.status === 'price_proposed'
          ? { amount: ride.proposed_price, label: 'proposedPrice' }
          : { amount: ride.estimated_price, label: ride.is_fixed_price ? 'fixedPrice' : 'estimate' };
  const timeline = ride ? timelineOf(ride, t, lang) : null;
  const showReview = ride?.status === 'completed' && (ride.can_review || ride.review);
  const pickup: LngLat | null = ride?.pickup ? [ride.pickup.lng, ride.pickup.lat] : null;
  const dropoff: LngLat | null = ride?.dropoff ? [ride.dropoff.lng, ride.dropoff.lat] : null;
  const amenities = (business?.amenities ?? []).map((a) => ({
    label: lang === 'en' ? a.label_en : a.label_fr,
    detail: lang === 'en' ? a.detail_en : a.detail_fr,
  }));
  const whatsapp = business?.phone?.replace(/\D/g, '');
  const mapHeight = wide ? undefined : Math.round(height * 0.36);

  const row = (label: string, value: string) => (
    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: night.rule }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 14, color: night.muted }}>{label}</Text>
      <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: night.text, textAlign: 'right', flexShrink: 1 }}>{value}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: night.paper, flexDirection: wide ? 'row-reverse' : 'column' }}>
      <Stack.Screen options={{ headerShown: false, title: t('yourRide') }} />
      <StatusBar style="light" />

      <MapScene
        style={wide ? { flex: 1 } : { height: mapHeight }}
        mode="trip"
        pickup={pickup}
        dropoff={dropoff}
        route={ride?.route ?? (pickup && dropoff ? [pickup, dropoff] : null)}
        car={car}
        padding={{ top: insets.top + 70, bottom: 30, left: 40, right: 40 }}
      />
      {!wide ? <ClientTopBar name={business?.name} /> : null}

      <ScrollView
        style={wide ? { width: 480, flexGrow: 0, borderRightWidth: 1, borderRightColor: night.rule } : { flex: 1 }}
        contentContainerStyle={{ padding: 22, paddingTop: wide ? insets.top + 76 : 22, paddingBottom: insets.bottom + 28, gap: 16 }}
      >
        {wide ? <ClientTopBar name={business?.name} /> : null}
        <Rise index={0} style={{ gap: 4 }}>
          <Display size={38}>{t('yourRide')}</Display>
          {ride ? <Muted>{`${capitalize(formatDay(ride.pickup_at, lang))} · ${formatTime(ride.pickup_at, lang)}`}</Muted> : null}
        </Rise>

        {ride === undefined ? <Loading /> : null}
        {ride === null ? <Body>{err('NOT_FOUND')}</Body> : null}

        {ride ? (
          <>
            <Rise index={1} style={{ gap: 8 }}>
              <MonoLine>{`${short(ride.pickup_address)} → ${short(ride.dropoff_address)}`}</MonoLine>
              <MonoLine style={{ color: statusColor(ride.status) }}>{t(`board_${ride.status}` as TextKey)}</MonoLine>
              {liveLine ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <LiveDot />
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: night.text }}>{liveLine}</Text>
                </View>
              ) : null}
              <Body>{t(`guestStatus_${ride.status}` as TextKey)}</Body>
              {timeline ? <Timeline steps={timeline.steps} reached={timeline.reached} /> : null}
            </Rise>

            <Rise index={2} style={{ gap: 4 }}>
              <Muted style={{ fontSize: 13 }}>{priced ? t(priced.label) : ''}</Muted>
              <Text style={{ fontFamily: fonts.mono, fontSize: 40, lineHeight: 44, letterSpacing: -1, color: night.text }}>
                {formatPrice(priced?.amount, ride.currency, lang)}
              </Text>
              {ride.status === 'price_proposed' && ride.answer_deadline ? (
                <Muted style={{ fontSize: 13 }}>{`${t('answerBefore')} ${formatDateTime(ride.answer_deadline, lang)}`}</Muted>
              ) : null}
            </Rise>

            <ErrorText>{error}</ErrorText>
            {ride.status === 'price_proposed' ? (
              <View style={{ gap: 10 }}>
                <Button size="lg" icon="check" title={t('acceptPrice')} loading={busy === 'yes'} onPress={() => act('yes', () => respondAsGuest(token, true))} />
                <Button kind="secondary" icon="x" title={t('refusePrice')} loading={busy === 'no'} onPress={() => act('no', () => respondAsGuest(token, false))} />
              </View>
            ) : null}

            {showReview ? (
              <Rise index={3}>
                <ReviewForm token={token} ride={ride} onSaved={load} />
              </Rise>
            ) : null}

            <Rise index={3}>
              {row(t('from'), ride.pickup_address)}
              {row(t('to'), ride.dropoff_address)}
              {row(t('distance'), `${formatKm(ride.distance_m, lang)} · ${formatMinutes(ride.duration_s)}`)}
              {row(t('passengers'), String(ride.passengers))}
              {row(t('luggage'), String(ride.luggage))}
              {ride.travel_ref ? row(t('travelRef'), ride.travel_ref) : null}
              {ride.meet_greet ? row(t('meetGreet'), t('yes')) : null}
              {ride.cancel_reason ? row(t('reason'), ride.cancel_reason) : null}
            </Rise>

            {business?.driver_name ? (
              <Rise index={4} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {business.photo_url ? (
                  <Image
                    source={{ uri: `${apiUrl}${business.photo_url}` }}
                    accessibilityIgnoresInvertColors
                    style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: night.rule }}
                  />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: night.text }}>{business.driver_name}</Text>
                  {business.car ? <Muted>{business.car}</Muted> : null}
                </View>
              </Rise>
            ) : null}

            {business?.vehicle && hasVehicle(business.vehicle) && ride.status !== 'completed' ? (
              <Rise index={4}>
                <VehicleCard vehicle={business.vehicle} fallback={business.car} />
              </Rise>
            ) : null}

            {open && amenities.length > 0 ? (
              <Rise index={4} style={{ gap: 4 }}>
                <MonoLine muted>{t('aboard').toUpperCase()}</MonoLine>
                <AboardMenu items={amenities} />
              </Rise>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {business?.phone ? (
                <Button kind="secondary" style={{ flex: 1, minWidth: 130 }} icon="phone" title={t('callDriver')} onPress={() => void Linking.openURL(`tel:${business.phone}`)} />
              ) : null}
              {whatsapp ? (
                <Button kind="secondary" style={{ flex: 1, minWidth: 130 }} icon="message-circle" title="WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/${whatsapp}`)} />
              ) : null}
            </View>
            {open ? (
              <Button
                kind="danger"
                icon="x-circle"
                title={t('cancelRide')}
                loading={busy === 'cancel'}
                onPress={async () => {
                  if (await confirmAsk(t('cancelRideConfirm'), t('confirm'), t('back'))) {
                    void act('cancel', () => cancelAsGuest(token));
                  }
                }}
              />
            ) : null}
            <Muted style={{ fontSize: 12 }}>{t('keepLink')}</Muted>
            <Link href="/book" style={{ color: night.primary, fontFamily: fonts.semibold }}>
              {t('bookAnother')} →
            </Link>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

import { Link, Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { AddressInput } from '@/components/AddressInput';
import { DateTimeField } from '@/components/DateTimeField';
import { PremiumCard, PremiumShell } from '@/components/PremiumShell';
import { Button, colors, ErrorText, Field, Row, serif, Stepper, styles, Toggle } from '@/components/ui';
import type { BookingInput, BookingResult, DriverInfo, Place } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatKm, formatMinutes, formatPrice } from '@/lib/format';
import { rememberGuestRide, savedGuestRides, type SavedGuestRide } from '@/lib/guestRides';
import { type BusinessInfo, getBusiness, getPublicDriver, guestBook, guestQuote } from '@/lib/publicApi';

const PHONE = /^\+?[0-9 .\-()]{6,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function defaultPickup() {
  const d = new Date(Date.now() + 4 * 3600_000); // respects the minimum notice
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toISOString();
}

/**
 * The page the business-card QR code opens: book a chauffeur without an account.
 * Trip first, then the client's details, then the price, then the request.
 */
export default function PublicBooking() {
  const { t, err, lang } = useAuth();
  const router = useRouter();
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [driver, setDriver] = useState<DriverInfo | null>(null);

  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [when, setWhen] = useState(defaultPickup);
  const [passengers, setPassengers] = useState(1);
  const [luggage, setLuggage] = useState(1);
  const [meetGreet, setMeetGreet] = useState(false);
  const [travelRef, setTravelRef] = useState('');
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'quote' | 'book' | null>(null);
  const [answer, setAnswer] = useState<{ key: string; quote?: BookingResult; error?: string } | null>(null);
  // Earlier bookings made on this device (still upcoming), with their private links.
  const [mine] = useState<SavedGuestRide[]>(() =>
    savedGuestRides().filter((r) => new Date(r.pickup_at).getTime() > Date.now() - 6 * 3600_000),
  );

  useEffect(() => {
    void getBusiness().then(setBusiness).catch(() => undefined);
    void getPublicDriver().then(setDriver).catch(() => undefined);
  }, []);

  const ride: BookingInput | null = useMemo(
    () =>
      pickup && dropoff
        ? {
            pickup_at: when,
            pickup,
            dropoff,
            passengers,
            luggage,
            vehicle: driver?.vehicle ?? 'sedan',
            meet_greet: meetGreet,
            travel_ref: travelRef.trim() || undefined,
            customer_notes: notes.trim() || undefined,
          }
        : null,
    [pickup, dropoff, when, passengers, luggage, driver, meetGreet, travelRef, notes],
  );
  const client = { full_name: name.trim(), phone: phone.trim(), email: email.trim(), language: lang };
  const clientOk = client.full_name.length > 0 && PHONE.test(client.phone) && EMAIL.test(client.email);

  // A price belongs to the exact trip it was computed for; any change hides it.
  const key = JSON.stringify(ride);
  const current = answer?.key === key ? answer : null;
  const quote = current?.quote?.ok ? current.quote : null;

  const errorsOf = (r: BookingResult) => (r.errors ?? []).map((c) => err(c)).join('\n') || err('generic');

  const getPrice = async () => {
    if (!ride) return;
    setBusy('quote');
    try {
      const r = await guestQuote(ride);
      setAnswer({ key, quote: r, error: r.ok ? undefined : errorsOf(r) });
    } catch (e) {
      setAnswer({ key, error: err((e as Error).message) });
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!ride || !clientOk) return;
    setBusy('book');
    try {
      const r = await guestBook(client, ride);
      if (r.ok && r.access_token) {
        rememberGuestRide({ token: r.access_token, pickup_at: ride.pickup_at, from: ride.pickup.address, to: ride.dropoff.address });
        router.replace({ pathname: '/b/[token]', params: { token: r.access_token } });
        return;
      }
      setAnswer({ key, quote: quote ?? undefined, error: errorsOf(r) });
    } catch (e) {
      setAnswer({ key, quote: quote ?? undefined, error: err((e as Error).message) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: business?.name ?? t('bookYourChauffeur') }} />
      <PremiumShell business={business}>
        {mine.length > 0 ? (
          <PremiumCard title={t('myRides')}>
            {mine.map((r) => (
              <Link key={r.token} href={{ pathname: '/b/[token]', params: { token: r.token } }} style={styles.text}>
                {formatDateTime(r.pickup_at, lang)} · {r.from.split(',')[0]} → {r.to.split(',')[0]}
              </Link>
            ))}
          </PremiumCard>
        ) : null}

        <Text style={{ fontFamily: serif, color: '#FFFFFF', fontSize: 24, textAlign: 'center' }}>
          {t('bookYourChauffeur')}
        </Text>

        <PremiumCard title={t('yourTrip')}>
          <AddressInput label={t('from')} value={pickup} onChange={setPickup} />
          <AddressInput label={t('to')} value={dropoff} onChange={setDropoff} />
          <DateTimeField label={t('when')} value={when} onChange={setWhen} />
          <Stepper label={t('passengers')} value={passengers} min={1} max={driver?.seats ?? 4} onChange={setPassengers} />
          <Stepper label={t('luggage')} value={luggage} max={driver?.luggage ?? 3} onChange={setLuggage} />
          <Field label={t('travelRef')} value={travelRef} onChangeText={setTravelRef} autoCapitalize="characters" placeholder="AF1234 / TGV 6201" />
          <Toggle label={t('meetGreet')} value={meetGreet} onChange={setMeetGreet} />
          <Field label={t('notes')} value={notes} onChangeText={setNotes} multiline />
        </PremiumCard>

        <PremiumCard title={t('yourDetails')}>
          <Field label={t('fullName')} value={name} onChangeText={setName} autoComplete="name" />
          <Field label={t('phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="+33 6 12 34 56 78" />
          <Field label={t('email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        </PremiumCard>

        {quote ? (
          <View style={{ borderWidth: 1, borderColor: colors.gold, borderRadius: 14, padding: 18, gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: '#E8E4DA', fontSize: 16 }}>
                {quote.is_fixed ? t('fixedPrice') : quote.licence === 'taxi' ? t('meterEstimate') : t('estimate')}
              </Text>
              <Text style={{ fontFamily: serif, color: colors.gold, fontSize: 30 }}>
                {formatPrice(quote.estimate, quote.currency, lang)}
              </Text>
            </Row>
            {quote.distance_m ? (
              <Text style={{ color: '#8A8A90' }}>
                {formatKm(quote.distance_m)} · {formatMinutes(quote.duration_s ?? 0)}
              </Text>
            ) : null}
            {quote.route_estimated ? <Text style={{ color: '#8A8A90' }}>{t('roughRoute')}</Text> : null}
          </View>
        ) : null}

        {current?.error ? (
          <View style={{ backgroundColor: '#FAF8F3', borderRadius: 10, padding: 12 }}>
            <ErrorText>{current.error}</ErrorText>
          </View>
        ) : null}

        {!quote ? (
          <Button kind="gold" title={t('getPrice')} onPress={getPrice} loading={busy === 'quote'} disabled={!ride} />
        ) : (
          <Button kind="gold" title={t('requestMyRide')} onPress={send} loading={busy === 'book'} disabled={!clientOk} />
        )}
        <Text style={[styles.muted, { color: '#8A8A90', textAlign: 'center', fontSize: 12 }]}>{t('privacyNote')}</Text>
      </PremiumShell>
    </>
  );
}

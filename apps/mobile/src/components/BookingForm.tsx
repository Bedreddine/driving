import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';
import * as api from '@/lib/api';
import type { BookingInput, BookingResult, DriverInfo, Place, Ride } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatKm, formatMinutes, formatPrice } from '@/lib/format';
import { AddressInput } from './AddressInput';
import { DateTimeField } from './DateTimeField';
import { Button, Card, ErrorText, Field, Notice, Row, Stepper, styles, Toggle } from './ui';

// Default pickup: 4 hours from now, rounded to the next quarter hour (respects the 3 h notice).
function defaultPickup() {
  const d = new Date(Date.now() + 4 * 3600_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toISOString();
}

type Props = {
  mode: 'request' | 'quick_add';
  from?: Ride | null;                           // re-book: copy a past ride (read once, when the form mounts)
  extra?: Partial<BookingInput>;                // quick-add: contact, source, agreed price
  extraFields?: ReactNode;                      // quick-add: fields shown above the button
  canSubmit?: boolean;
  onBooked: (rideId: string) => void;
};

export function BookingForm({ mode, from, extra, extraFields, canSubmit = true, onBooked }: Props) {
  const { t, err, lang } = useAuth();
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  // Re-book: same places and passengers, new date.
  const [pickup, setPickup] = useState<Place | null>(() =>
    from ? { lat: from.pickup_lat, lng: from.pickup_lng, address: from.pickup_address } : null,
  );
  const [dropoff, setDropoff] = useState<Place | null>(() =>
    from ? { lat: from.dropoff_lat, lng: from.dropoff_lng, address: from.dropoff_address } : null,
  );
  const [when, setWhen] = useState(defaultPickup);
  const [passengers, setPassengers] = useState(from?.passengers ?? 1);
  const [luggage, setLuggage] = useState(from?.luggage ?? 0);
  const [meetGreet, setMeetGreet] = useState(from?.meet_greet ?? false);
  const [travelRef, setTravelRef] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'quote' | 'book' | null>(null);
  // The last server answer, remembered with the exact input it was for.
  const [answer, setAnswer] = useState<{ key: string; quote?: BookingResult; warnings?: string[]; error?: string } | null>(null);

  useEffect(() => {
    void api.getDriver().then(setDriver);
  }, []);

  const input: BookingInput | null = useMemo(
    () =>
      pickup && dropoff
        ? {
            mode,
            pickup_at: when,
            pickup,
            dropoff,
            passengers,
            luggage,
            vehicle: driver?.vehicle ?? 'sedan',
            meet_greet: meetGreet,
            travel_ref: travelRef.trim() || undefined,
            customer_notes: notes.trim() || undefined,
            ...extra,
          }
        : null,
    [mode, pickup, dropoff, when, passengers, luggage, driver, meetGreet, travelRef, notes, extra],
  );

  // Any change to the input makes the previous price and messages out of date.
  const inputKey = JSON.stringify(input);
  const current = answer?.key === inputKey ? answer : null;
  const quote = current?.quote ?? null;
  const warnings = current?.warnings ?? null;
  const error = current?.error ?? null;

  const errorsOf = (r: BookingResult) => (r.errors ?? []).map((c) => err(c)).join('\n') || undefined;

  const getQuote = async () => {
    if (!input) return;
    setBusy('quote');
    try {
      const r = await api.quote(input);
      setAnswer({ key: inputKey, quote: r, error: r.ok ? undefined : errorsOf(r), warnings: r.ok ? r.warnings : undefined });
    } catch (e) {
      setAnswer({ key: inputKey, error: err((e as Error).message) });
    } finally {
      setBusy(null);
    }
  };

  const submit = async (override = false) => {
    if (!input) return;
    setBusy('book');
    try {
      const r = await api.book(input, override);
      if (r.ok && r.ride_id) return onBooked(r.ride_id);
      if (r.needs_override && mode === 'quick_add') setAnswer({ key: inputKey, quote: quote ?? undefined, warnings: r.warnings ?? [] });
      else setAnswer({ key: inputKey, quote: quote ?? undefined, error: errorsOf(r) });
    } catch (e) {
      setAnswer({ key: inputKey, quote: quote ?? undefined, error: err((e as Error).message) });
    } finally {
      setBusy(null);
    }
  };

  const tooShort = quote?.errors?.includes('TOO_SHORT_NOTICE');
  const phoneDigits = driver?.phone?.replace(/[^\d]/g, '');

  return (
    <View style={{ gap: 8 }}>
      <AddressInput label={t('from')} value={pickup} onChange={setPickup} />
      <AddressInput label={t('to')} value={dropoff} onChange={setDropoff} />
      <DateTimeField label={t('when')} value={when} onChange={setWhen} />
      <Card>
        <Stepper label={t('passengers')} value={passengers} min={1} max={driver?.seats ?? 8} onChange={setPassengers} />
        <Stepper label={t('luggage')} value={luggage} max={driver?.luggage ?? 8} onChange={setLuggage} />
        <Toggle label={t('meetGreet')} value={meetGreet} onChange={setMeetGreet} />
      </Card>
      <Field label={t('travelRef')} value={travelRef} onChangeText={setTravelRef} autoCapitalize="characters" placeholder="AF1234 / TGV 6201" />
      <Field label={t('notes')} value={notes} onChangeText={setNotes} multiline />
      {extraFields}

      {quote?.ok ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.text}>
              {quote.is_fixed ? t('fixedPrice') : quote.licence === 'taxi' ? t('meterEstimate') : t('estimate')}
            </Text>
            <Text style={[styles.text, { fontSize: 22, fontWeight: '800' }]}>
              {formatPrice(quote.estimate, quote.currency, lang)}
            </Text>
          </Row>
          {quote.distance_m ? (
            <Text style={styles.muted}>
              {formatKm(quote.distance_m, lang)} · {formatMinutes(quote.duration_s ?? 0)}
            </Text>
          ) : null}
          {quote.route_estimated ? <Text style={styles.muted}>{t('roughRoute')}</Text> : null}
        </Card>
      ) : null}

      {/* On short notice the card below says it all, with call buttons: no second message. */}
      {!(tooShort && phoneDigits) ? <ErrorText>{error}</ErrorText> : null}
      {tooShort && phoneDigits ? (
        <Card>
          <Text style={styles.text}>{t('shortNotice')}</Text>
          <Row style={{ gap: 8 }}>
            <Button kind="secondary" title={t('call')} onPress={() => void Linking.openURL(`tel:${driver!.phone}`)} />
            <Button kind="secondary" title={t('whatsapp')} onPress={() => void Linking.openURL(`https://wa.me/${phoneDigits}`)} />
          </Row>
        </Card>
      ) : null}

      {warnings && warnings.length > 0 && mode === 'quick_add' ? (
        <Notice tone="warning">
          {t('overrideTitle')}: {warnings.map((w) => err(w)).join(' ')}
        </Notice>
      ) : null}

      {!quote?.ok ? (
        <Button title={t('getPrice')} onPress={getQuote} loading={busy === 'quote'} disabled={!input} />
      ) : warnings && warnings.length > 0 && mode === 'quick_add' ? (
        <Button title={t('overrideConfirm')} onPress={() => submit(true)} loading={busy === 'book'} disabled={!canSubmit} />
      ) : (
        <Button
          title={mode === 'quick_add' ? t('quickAdd') : t('requestRide')}
          onPress={() => submit(false)}
          loading={busy === 'book'}
          disabled={!canSubmit}
        />
      )}
    </View>
  );
}
